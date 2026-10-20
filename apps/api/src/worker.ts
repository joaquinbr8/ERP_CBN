import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Db } from "./db";
import amqp, { ChannelModel, ConfirmChannel } from "amqplib";
@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  timer?: NodeJS.Timeout;
  busy = false;
  simulateFailure = false;
  lastError = "";
  connection?: ChannelModel;
  channel?: ConfirmChannel;
  readonly mode =
    process.env.INTEGRATION_MODE === "rabbitmq" ? "rabbitmq" : "simulator";
  constructor(private db: Db) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 2000);
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.connection?.close();
  }
  async broker() {
    if (this.channel) return this.channel;
    this.connection = await amqp.connect(
      process.env.AMQP_URL || "amqp://127.0.0.1",
      { timeout: 3000 },
    );
    this.connection.on("error", (e) => {
      this.lastError = e.message;
    });
    this.connection.on("close", () => {
      this.channel = undefined;
      this.connection = undefined;
    });
    const ch = await this.connection.createConfirmChannel();
    await ch.assertExchange("cbn.review", "direct", { durable: true });
    await ch.assertQueue("cbn.inventory.review", { durable: true });
    await ch.bindQueue("cbn.inventory.review", "cbn.review", "inventory");
    await ch.assertQueue("cbn.inventory.events", {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": "cbn.review",
        "x-dead-letter-routing-key": "inventory",
      },
    });
    await ch.prefetch(1);
    await ch.consume(
      "cbn.inventory.events",
      async (msg) => {
        if (!msg) return;
        try {
          const event = JSON.parse(msg.content.toString());
          await this.db.rows(
            "INSERT INTO deliveries(event_id,destination,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [event.id, event.destination, event.payload],
          );
          ch.ack(msg);
        } catch (e) {
          this.lastError = String(e);
          ch.nack(msg, false, false);
        }
      },
      { noAck: false },
    );
    this.channel = ch;
    return ch;
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let i = 0; i < 10; i++) {
        const processed = await this.db.tx(async (c) => {
          const { rows } = await c.query(
            "SELECT * FROM outbox WHERE status='PENDIENTE' AND next_attempt<=now() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED",
          );
          const o = rows[0];
          if (!o) return false;
          try {
            if (this.simulateFailure)
              throw new Error(
                "Destino simulado no disponible (prueba controlada)",
              );
            if (this.mode === "rabbitmq") {
              const ch = await this.broker();
              ch.sendToQueue(
                "cbn.inventory.events",
                Buffer.from(JSON.stringify(o)),
                {
                  persistent: true,
                  messageId: o.id,
                  contentType: "application/json",
                },
              );
              await ch.waitForConfirms();
            } else
              await c.query(
                "INSERT INTO deliveries(event_id,destination,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
                [o.id, o.destination, o.payload],
              );
            await c.query(
              "UPDATE outbox SET status='ENVIADO',attempts=attempts+1,sent_at=now(),last_error=null WHERE id=$1",
              [o.id],
            );
            this.lastError = "";
          } catch (e) {
            const error = (e as Error).message;
            this.lastError = error;
            await c.query(
              "UPDATE outbox SET status=CASE WHEN attempts+1>=3 THEN 'REVISION' ELSE 'PENDIENTE' END,attempts=attempts+1,last_error=$2,next_attempt=now()+interval '3 seconds' WHERE id=$1",
              [o.id, error],
            );
          }
          return true;
        });
        if (!processed) break;
      }
    } catch (e) {
      this.lastError = String(e);
    } finally {
      this.busy = false;
    }
  }
}
