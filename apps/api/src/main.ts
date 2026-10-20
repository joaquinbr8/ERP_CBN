import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  Module,
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { DatabaseModule, Db } from "./db";
import {
  SecurityModule,
  AuthGuard,
  verifyPassword,
  token,
  permit,
} from "./auth";
import { InventoryService, required, fail } from "./inventory";
import { Commands } from "./commands";
import { OutboxWorker } from "./worker";
import express from "express";
import path from "node:path";
import { ROOT } from "./db";

@Catch()
class ErrorFilter implements ExceptionFilter {
  catch(e: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    let status = e instanceof HttpException ? e.getStatus() : 500;
    let message =
      e instanceof HttpException
        ? e.message
        : "Error interno. Revisa el registro del servidor.";
    if (
      ["23505", "23503", "23514", "22P02", "22007", "22008"].includes(e.code)
    ) {
      status = 409;
      message =
        e.code === "23505"
          ? "La referencia ya existe. Usa un identificador nuevo o reintenta la misma solicitud."
          : e.code === "23503"
            ? "Referencia inexistente o utilizada por otros registros."
            : "Datos inválidos o violación de una regla de integridad.";
    }
    if (status === 500) console.error(e);
    res.status(status).json({ message, statusCode: status });
  }
}

@Controller("api")
class Api {
  private attempts = new Map<string, { count: number; at: number }>();
  constructor(
    private db: Db,
    private commands: Commands,
    private inv: InventoryService,
    private worker: OutboxWorker,
  ) {}
  @Get("health") async health() {
    await this.db.rows("SELECT 1");
    return { ok: true, project: "ERP CBN · prototipo académico" };
  }
  @Post("login") async login(@Body() p: any, @Req() req: any) {
    const username = required(p.username, "Usuario");
    const addr = req.ip + ":" + username;
    const a = this.attempts.get(addr);
    if (a && Date.now() - a.at < 60000 && a.count >= 10)
      throw new UnauthorizedException("Demasiados intentos. Espera un minuto.");
    this.attempts.set(addr, {
      count: a && Date.now() - a.at < 60000 ? a.count + 1 : 1,
      at: a && Date.now() - a.at < 60000 ? a.at : Date.now(),
    });
    if (typeof p.password !== "string" || p.password.length > 100)
      throw new UnauthorizedException("Credenciales inválidas");
    const [u] = await this.db.rows(
      "SELECT u.*,r.permissions FROM users u JOIN roles r ON r.id=u.role_id WHERE username=$1 AND active=true",
      [username],
    );
    if (!u || !verifyPassword(p.password, u.password_hash))
      throw new UnauthorizedException("Credenciales inválidas");
    this.attempts.delete(addr);
    delete u.password_hash;
    return { token: token(u), user: u };
  }
  @UseGuards(AuthGuard) @Get("state") async state(@Req() req: any) {
    const result: any = { user: req.user };
    const queries: Record<string, string> = {
      articles: "SELECT * FROM articles ORDER BY id",
      suppliers: "SELECT * FROM suppliers ORDER BY id",
      warehouses: "SELECT * FROM warehouses ORDER BY id",
      locations: "SELECT * FROM locations ORDER BY id",
      inventory:
        "SELECT * FROM inventory_view ORDER BY article_id,expiry NULLS LAST,lot_id",
      lots: "SELECT * FROM lots ORDER BY received_at DESC",
      documents: "SELECT * FROM documents ORDER BY created_at DESC LIMIT 300",
      reservations: "SELECT * FROM reservations ORDER BY document_id",
      movements: "SELECT * FROM movements ORDER BY created_at DESC LIMIT 500",
      counts: "SELECT * FROM counts ORDER BY created_at DESC",
      genealogy: "SELECT * FROM genealogy",
      suggestions: "SELECT * FROM suggestions ORDER BY created_at DESC",
      qualityHistory:
        "SELECT * FROM audit WHERE action='quality.decision' ORDER BY id DESC LIMIT 200",
      reconciliation:
        "SELECT *,physical-ledger difference,reserved-reservation_total reservation_difference FROM inventory_reconciliation ORDER BY lot_id",
    };
    if (
      req.user.permissions.includes("*") ||
      req.user.permissions.includes("admin")
    )
      Object.assign(queries, {
        users:
          "SELECT id,username,name,role_id,active,version FROM users ORDER BY username",
        roles: "SELECT * FROM roles",
        audit: "SELECT * FROM audit ORDER BY id DESC LIMIT 300",
      });
    if (
      req.user.permissions.includes("*") ||
      req.user.permissions.includes("integraciones")
    )
      Object.assign(queries, {
        inbox:
          "SELECT id,source,event_id,business_key,status,attempts,created_at FROM inbox ORDER BY created_at DESC LIMIT 100",
        outbox: "SELECT * FROM outbox ORDER BY created_at DESC LIMIT 100",
        deliveries:
          "SELECT * FROM deliveries ORDER BY received_at DESC LIMIT 100",
      });
    await this.db.tx(async c => {
      await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      for (const [k, q] of Object.entries(queries)) result[k]=(await c.query(q)).rows;
      result.planning=await this.inv.planning(c);
    });
    result.integration = {
      mode: this.worker.mode,
      simulateFailure: this.worker.simulateFailure,
      lastError: this.worker.lastError,
      external: "Simuladores locales. No conectado a sistemas reales de CBN.",
    };
    return result;
  }
  @UseGuards(AuthGuard) @Post("commands") execute(
    @Req() req: any,
    @Body() body: any,
  ) {
    return this.commands.execute(req.user, body);
  }
  @UseGuards(AuthGuard) @Post("worker") async control(
    @Req() req: any,
    @Body() p: any,
  ) {
    permit(req.user, "integraciones");
    if (typeof p.fail === "boolean") this.worker.simulateFailure = p.fail;
    await this.worker.tick();
    return {
      mode: this.worker.mode,
      failure: this.worker.simulateFailure,
      lastError: this.worker.lastError,
    };
  }
  @UseGuards(AuthGuard) @Get("reports") async reports(@Req() req: any) {
    permit(req.user, "reportes");
    return this.db.rows("SELECT * FROM bi_inventory ORDER BY article_id");
  }
}
@Module({
  imports: [DatabaseModule, SecurityModule],
  controllers: [Api],
  providers: [InventoryService, Commands, OutboxWorker],
})
class AppModule {}
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new ErrorFilter());
  app.enableCors({
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
  });
  app.use(express.json({ limit: "256kb" }));
  app.use(express.static(path.join(ROOT, "apps/web/dist")));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 3100), "127.0.0.1");
  console.log("ERP CBN: http://127.0.0.1:3100 · API local.");
}
void bootstrap();
