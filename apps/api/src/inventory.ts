import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
export const fail = (message: string): never => {
  throw new BadRequestException(message);
};
export function qty(value: any, allowZero = false) {
  let n: Decimal;
  try {
    n = new Decimal(value);
  } catch {
    return fail("Cantidad inválida");
  }
  if (
    !n.isFinite() ||
    n.lt(0) ||
    (!allowZero && n.eq(0)) ||
    n.decimalPlaces() > 3 ||
    n.gt(1e10)
  )
    return fail(
      "Cantidad positiva, hasta 3 decimales y máximo 10 mil millones",
    );
  return n;
}
export function required(value: any, label: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 180)
    return fail(label + " es obligatorio (máximo 180 caracteres)");
  return value.trim();
}
export async function one(c: PoolClient, sql: string, args: any[] = []) {
  return (await c.query(sql, args)).rows[0];
}
export function version(actual: number, expected: any) {
  if (actual !== Number(expected))
    throw new ConflictException(
      "La versión cambió. Actualiza la pantalla y revisa antes de confirmar.",
    );
}

/** Único módulo autorizado para escribir movimientos y saldos. Sus llamadas comparten la transacción del caso de uso. */
@Injectable()
export class InventoryService {
  async move(
    c: PoolClient,
    p: {
      key: string;
      type: string;
      lot: string;
      location: string;
      quantity: Decimal;
      document?: string;
      reason: string;
      actor: string;
    },
  ) {
    if (p.document) {
      await c.query(
        "INSERT INTO document_headers(id,kind,status) VALUES($1,'OPERACION','REGISTRADA') ON CONFLICT(id) DO NOTHING",
        [p.document],
      );
    }
    await c.query(
      "INSERT INTO inventory_positions(lot_id,location_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [p.lot, p.location],
    );
    const b = await one(
      c,
      `SELECT p.*,COALESCE((SELECT SUM(r.quantity) FROM reservations r WHERE r.lot_id=p.lot_id AND r.location_id=p.location_id AND r.status='ACTIVA'),0) reserved
       FROM inventory_positions p WHERE p.lot_id=$1 AND p.location_id=$2 FOR UPDATE`,
      [p.lot, p.location],
    );
    if (new Decimal(b.physical).plus(p.quantity).lt(b.reserved))
      fail(
        "La salida excede el stock no reservado. Libera las reservas o reduce la cantidad.",
      );
    await c.query(
      "INSERT INTO movements(id,business_key,type,lot_id,location_id,quantity,document_id,reason,actor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        randomUUID(),
        p.key,
        p.type,
        p.lot,
        p.location,
        p.quantity.toString(),
        p.document || null,
        p.reason,
        p.actor,
      ],
    );
    await c.query(
      "UPDATE inventory_positions SET physical=physical+$3,version=version+1 WHERE lot_id=$1 AND location_id=$2",
      [p.lot, p.location, p.quantity.toString()],
    );
  }
  async newLot(c: PoolClient, lot: string, article: string, expiry: any) {
    const a = await one(c, "SELECT * FROM articles WHERE id=$1", [article]);
    if (!a) fail("Artículo inexistente");
    if (a.policy === "FEFO" && !expiry)
      fail("Los artículos FEFO requieren fecha de vencimiento");
    if (
      expiry &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || Number.isNaN(Date.parse(expiry)))
    )
      fail("Vencimiento inválido");
    await c.query("INSERT INTO lots(id,article_id,expiry) VALUES($1,$2,$3)", [
      required(lot, "Lote"),
      article,
      expiry || null,
    ]);
  }
  async reserve(
    c: PoolClient,
    document: string,
    article: string,
    warehouse: string,
    amount: Decimal,
  ) {
    const a = await one(c, "SELECT * FROM articles WHERE id=$1", [article]);
    if (!a) fail("Artículo inexistente");
    const candidates = (
      await c.query(
        `SELECT * FROM inventory_view WHERE article_id=$1 AND warehouse_id=$2 AND available>0 ORDER BY ${a.policy === "FEFO" ? "expiry ASC NULLS LAST," : ""} received_at ASC,lot_id ASC,location_id ASC`,
        [article, warehouse],
      )
    ).rows;
    const localAtp = candidates.reduce(
      (total: Decimal, position: any) => total.plus(position.available),
      new Decimal(0),
    );
    let remaining = amount;
    const allocations = [];
    for (const b of candidates) {
      if (remaining.eq(0)) break;
      const take = Decimal.min(remaining, b.available);
      const explanation =
        a.policy === "FEFO"
          ? "FEFO: primero vence, primero sale; desempate por ingreso y lote."
          : "FIFO: primero ingresa, primero sale; desempate por lote.";
      await c.query(
        "INSERT INTO reservations(id,document_id,lot_id,location_id,quantity,explanation) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          document,
          b.lot_id,
          b.location_id,
          take.toString(),
          explanation,
        ],
      );
      await c.query(
        "UPDATE inventory_positions SET version=version+1 WHERE lot_id=$1 AND location_id=$2",
        [b.lot_id, b.location_id],
      );
      allocations.push({
        lot: b.lot_id,
        quantity: take.toString(),
        policy: a.policy,
      });
      remaining = remaining.minus(take);
    }
    if (remaining.gt(0)) {
      const selectedWarehouse = await one(
        c,
        "SELECT w.name,p.name center FROM warehouses w JOIN plants p ON p.id=w.plant_id WHERE w.id=$1",
        [warehouse],
      );
      const alternatives = (
        await c.query(
          `SELECT w.name,p.name center,SUM(v.available) available
           FROM inventory_view v JOIN warehouses w ON w.id=v.warehouse_id JOIN plants p ON p.id=w.plant_id
           WHERE v.article_id=$1 AND v.warehouse_id<>$2 AND v.available>0
           GROUP BY w.id,w.name,p.name ORDER BY SUM(v.available) DESC`,
          [article, warehouse],
        )
      ).rows;
      fail(
        `Stock elegible insuficiente para ${a.name} en ${selectedWarehouse?.name || warehouse}. Requerido: ${amount.toString()} ${a.unit}; ATP local: ${localAtp.toString()} ${a.unit}; faltante: ${remaining.toString()} ${a.unit}. ${alternatives.length ? `Hay ATP en otros almacenes: ${alternatives.map((item: any) => `${item.name} (${item.available})`).join(", ")}. Realiza un traslado o selecciona el almacén correcto.` : "No existe ATP en otros almacenes."} No se reservó nada: la transacción completa se revirtió.`,
      );
    }
    return allocations;
  }
  async release(
    c: PoolClient,
    document: string,
    consume: boolean,
    key: string,
    actor: string,
    type = "DESPACHO",
  ) {
    const rows = (
      await c.query(
        "SELECT r.*,l.quality,l.expiry FROM reservations r JOIN lots l ON l.id=r.lot_id WHERE document_id=$1 AND status=$2",
        [document, "ACTIVA"],
      )
    ).rows;
    if (!rows.length) fail("No hay reservas activas");
    for (const r of rows) {
      const eligible = await one(
        c,
        "SELECT quality='LIBERADO' AND (expiry IS NULL OR expiry>=CURRENT_DATE) ok FROM lots WHERE id=$1",
        [r.lot_id],
      );
      if (consume && !eligible.ok)
        fail(
          "El lote " +
            r.lot_id +
            " está retenido o vencido. No se puede confirmar la salida.",
        );
      await c.query(
        "UPDATE inventory_positions SET version=version+1 WHERE lot_id=$1 AND location_id=$2",
        [r.lot_id, r.location_id],
      );
      if (consume)
        await this.move(c, {
          key: key + ":" + r.id,
          type,
          lot: r.lot_id,
          location: r.location_id,
          quantity: new Decimal(r.quantity).neg(),
          document,
          reason: "Salida confirmada desde reserva " + r.id,
          actor,
        });
      await c.query("UPDATE reservations SET status=$2 WHERE id=$1", [
        r.id,
        consume ? "CONSUMIDA" : "LIBERADA",
      ]);
    }
    return rows;
  }
  async emit(
    c: PoolClient,
    eventType: string,
    payload: any,
    destination = "Panel de integraciones (simulador)",
  ) {
    await c.query(
      "INSERT INTO outbox(id,event_type,payload,destination) VALUES($1,$2,$3,$4)",
      [randomUUID(), eventType, payload, destination],
    );
  }
  async planning(c: PoolClient) {
    return (
      await c.query(`SELECT a.*,w.warehouse_id,a.daily_demand*a.lead_days+a.safety_stock rop,
 COALESCE(SUM(v.available),0) available,
 COALESCE((SELECT SUM(dl.quantity-dl.received_quantity) FROM document_headers d JOIN document_lines dl ON dl.document_id=d.id WHERE d.kind='COMPRA' AND d.status IN ('APROBADA','TRANSITO','PARCIAL') AND dl.article_id=a.id),0) incoming,
 COALESCE((SELECT SUM(dl.quantity-dl.received_quantity) FROM document_headers d JOIN document_lines dl ON dl.document_id=d.id WHERE d.kind='COMPRA' AND d.status IN ('TRANSITO','PARCIAL') AND dl.article_id=a.id),0) transit
 FROM articles a
 CROSS JOIN LATERAL (
   SELECT DISTINCT iv.warehouse_id FROM inventory_view iv WHERE iv.article_id=a.id
   UNION ALL SELECT 'PLANTA' WHERE NOT EXISTS(SELECT 1 FROM inventory_view ix WHERE ix.article_id=a.id)
 ) w
 LEFT JOIN inventory_view v ON v.article_id=a.id AND v.warehouse_id=w.warehouse_id
 GROUP BY a.id,w.warehouse_id ORDER BY a.id,w.warehouse_id`)
    ).rows;
  }
}
