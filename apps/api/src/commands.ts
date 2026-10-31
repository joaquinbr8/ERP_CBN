import { Injectable, ConflictException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { Db } from "./db";
import { permit, hashPassword } from "./auth";
import {
  InventoryService,
  fail,
  one,
  qty,
  required,
  version,
} from "./inventory";
import { PoolClient } from "pg";

const permissions: Record<string, string> = {
  article: "maestros",
  supplier: "maestros",
  warehouse: "admin",
  location: "maestros",
  user: "admin",
  role: "admin",
  purchase: "compras",
  request: "compras",
  receipt: "inventario",
  quality: "calidad",
  order: "despacho",
  transfer: "inventario",
  count: "inventario",
  merma: "inventario",
  production: "produccion",
  replenishment: "compras",
  outbox: "integraciones",
};
function canonical(v: any): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}

@Injectable()
export class Commands {
  constructor(
    private db: Db,
    private inv: InventoryService,
  ) {}
  async execute(user: any, body: any) {
    const action = required(body.action, "Acción"),
      p = body.data || {},
      source = body.source || "ERP_WEB",
      eventId = required(body.eventId, "ID de solicitud");
    const permission = permissions[action.split(".")[0]];
    if (!permission) fail("Acción no admitida");
    permit(user, permission);
    if (source !== "ERP_WEB") {
      permit(user, "integraciones");
      if (!["MES_SIMULADO", "BEES_SIMULADO", "EPOD_SIMULADO"].includes(source))
        fail("Origen no autorizado");
    }
    if (action === "count.approve") permit(user, "aprobar_ajustes");
    const identity = p.id || p.reference;
    if (!identity) fail("Se requiere una referencia única de la operación");
    const businessKey =
      action +
      ":" +
      identity +
      (action === "purchase.receive"
        ? ":" + required(p.receiptRef, "Referencia de recepción")
        : "") +
      (action === "outbox.retry"
        ? ":" + required(p.retryRef, "Referencia de reintento")
        : "") +
      ([
        "quality.set",
        "article.policy",
        "order.promise",
        "user.update",
      ].includes(action)
        ? ":v" + p.version
        : "");
    // No persistir una huella rápida de contraseñas. Repetir un alta nunca cambia su contraseña.
    const fingerprintData=action==="user.create"?{...p,password:"[REDACTED]"}:p;
    const fingerprint = createHash("sha256")
      .update(canonical({ action, data: fingerprintData }))
      .digest("hex");
    return this.db.tx(async (c) => {
      // El piloto serializa comandos de escritura: evita sobreventa y carreras entre calidad, reserva y salida.
      await c.query("SELECT pg_advisory_xact_lock(724901)");
      const old = await one(
        c,
        "SELECT * FROM inbox WHERE source=$1 AND event_id=$2",
        [source, eventId],
      );
      if (old) {
        if (old.fingerprint !== fingerprint)
          throw new ConflictException(
            "El eventId ya existe con otro contenido",
          );
        await c.query("UPDATE inbox SET attempts=attempts+1 WHERE id=$1", [
          old.id,
        ]);
        return { ...old.result, duplicate: true, deduplication: "eventId" };
      }
      const effect = await one(
        c,
        "SELECT * FROM business_effects WHERE business_key=$1",
        [businessKey],
      );
      if (effect && effect.fingerprint !== fingerprint)
        throw new ConflictException(
          "La referencia de negocio ya existe con datos diferentes",
        );
      const inboxId = randomUUID();
      await c.query(
        "INSERT INTO inbox(id,source,event_id,business_key,fingerprint) VALUES($1,$2,$3,$4,$5)",
        [inboxId, source, eventId, businessKey, fingerprint],
      );
      if (effect) {
        await c.query("UPDATE inbox SET status=$2,result=$3 WHERE id=$1", [
          inboxId,
          "DUPLICADO",
          effect.result,
        ]);
        return {
          ...effect.result,
          duplicate: true,
          deduplication: "clave de negocio",
        };
      }
      const result = await this.apply(c, user, action, p, businessKey);
      await c.query(
        "INSERT INTO business_effects(business_key,fingerprint,result) VALUES($1,$2,$3)",
        [businessKey, fingerprint, result],
      );
      await c.query("UPDATE inbox SET status=$2,result=$3 WHERE id=$1", [
        inboxId,
        "APLICADO",
        result,
      ]);
      // La auditoría no contiene contraseñas ni tokens.
      await c.query("INSERT INTO audit(actor,action,detail) VALUES($1,$2,$3)", [
        user.username,
        action,
        { reference: identity, businessKey, source },
      ]);
      await this.inv.emit(
        c,
        action.startsWith("quality.")
          ? "LotStatusChanged"
          : action.startsWith("order.")
            ? "OrderStatusChanged"
            : "InventoryOperationCommitted",
        { action, reference: identity, actor: user.username, result },
      );
      return { ...result, duplicate: false };
    });
  }
  async doc(c: PoolClient, p: any, kind?: string, status?: string[]) {
    const d = await one(c, "SELECT * FROM documents WHERE id=$1 FOR UPDATE", [
      required(p.id, "Documento"),
    ]);
    if (!d || (kind && d.kind !== kind)) fail("Documento no encontrado");
    version(d.version, p.version);
    if (status && !status.includes(d.status))
      fail("Estado incompatible: " + d.status);
    return d;
  }
  async update(c: PoolClient, id: string, status: string, data?: any) {
    await c.query(
      "UPDATE documents SET status=$2,version=version+1,data=COALESCE($3,data) WHERE id=$1",
      [id, status, data || null],
    );
  }
  async apply(
    c: PoolClient,
    u: any,
    action: string,
    p: any,
    key: string,
  ): Promise<any> {
    const id = required(p.id || p.reference, "Referencia");
    const actor = u.username;
    switch (action) {
      case "article.create": {
        if (
          !["FIFO", "FEFO"].includes(p.policy) ||
          !["A", "B", "C"].includes(p.abc)
        )
          fail("Selecciona política FIFO/FEFO y clasificación ABC");
        const demand = qty(p.dailyDemand || 0, true),
          safety = qty(p.safetyStock || 0, true);
        const lead = Number(p.leadDays || 0);
        if (!Number.isInteger(lead) || lead < 0 || lead > 3650)
          fail("Plazo inválido");
        await c.query(
          "INSERT INTO articles(id,name,category,unit,policy,abc,daily_demand,lead_days,safety_stock) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [
            id,
            required(p.name, "Nombre"),
            required(p.category, "Categoría"),
            required(p.unit, "Unidad"),
            p.policy,
            p.abc,
            demand.toString(),
            lead,
            safety.toString(),
          ],
        );
        break;
      }
      case "article.policy": {
        const a = await one(c, "SELECT * FROM articles WHERE id=$1", [id]);
        if (!a) fail("Artículo no encontrado");
        version(a.version, p.version);
        if (!["FIFO", "FEFO"].includes(p.policy)) fail("Política inválida");
        if (
          p.policy === "FEFO" &&
          (await one(
            c,
            "SELECT id FROM lots WHERE article_id=$1 AND expiry IS NULL LIMIT 1",
            [id],
          ))
        )
          fail(
            "Hay lotes sin vencimiento. Completa la información antes de habilitar FEFO.",
          );
        const lead = Number(p.leadDays);
        if (!Number.isInteger(lead) || lead < 0 || lead > 3650)
          fail("Plazo inválido");
        await c.query(
          "UPDATE articles SET policy=$2,daily_demand=$3,lead_days=$4,safety_stock=$5,version=version+1 WHERE id=$1",
          [
            id,
            p.policy,
            qty(p.dailyDemand, true).toString(),
            lead,
            qty(p.safetyStock, true).toString(),
          ],
        );
        break;
      }
      case "supplier.create":
        await c.query(
          "INSERT INTO suppliers(id,name,contact) VALUES($1,$2,$3)",
          [id, required(p.name, "Nombre"), p.contact || ""],
        );
        break;
      case "warehouse.create":
        await c.query("INSERT INTO warehouses(id,name) VALUES($1,$2)", [
          id,
          required(p.name, "Nombre"),
        ]);
        break;
      case "location.create":
        await c.query(
          "INSERT INTO locations(id,name,warehouse_id) VALUES($1,$2,$3)",
          [id, required(p.name, "Nombre"), p.warehouseId],
        );
        break;
      case "role.create": {
        const valid = [
          "maestros",
          "admin",
          "compras",
          "inventario",
          "calidad",
          "despacho",
          "produccion",
          "aprobar_ajustes",
          "integraciones",
          "reportes",
        ];
        const perms = Array.isArray(p.permissions)
          ? p.permissions
          : String(p.permissions || "")
              .split(",")
              .map((x: string) => x.trim());
        if (perms.some((x: string) => !valid.includes(x)))
          fail("Permiso no admitido");
        await c.query(
          "INSERT INTO roles(id,name,permissions) VALUES($1,$2,$3)",
          [id, required(p.name, "Nombre"), perms],
        );
        break;
      }
      case "user.create":
        if (
          typeof p.password !== "string" ||
          p.password.length < 10 ||
          p.password.length > 100
        )
          fail("Contraseña de 10 a 100 caracteres");
        await c.query(
          "INSERT INTO users(id,username,name,password_hash,role_id) VALUES($1,$2,$3,$4,$5)",
          [
            randomUUID(),
            id,
            required(p.name, "Nombre"),
            hashPassword(p.password),
            p.roleId,
          ],
        );
        break;
      case "user.update": {
        const target = await one(c, "SELECT * FROM users WHERE username=$1", [
          id,
        ]);
        if (!target) fail("Usuario inexistente");
        version(target.version, p.version);
        if (target.id === u.id)
          fail("No puedes cambiar tu propio acceso desde esta operación");
        const active = p.active === true || p.active === "true";
        await c.query(
          "UPDATE users SET role_id=$2,active=$3,version=version+1 WHERE username=$1",
          [id, p.roleId, active],
        );
        break;
      }
      case "request.create": {
        if (
          !(await one(c, "SELECT id FROM articles WHERE id=$1", [p.articleId]))
        )
          fail("Artículo inválido");
        await c.query(
          "INSERT INTO documents(id,kind,status,data) VALUES($1,$2,$3,$4)",
          [
            id,
            "SOLICITUD",
            "PENDIENTE",
            {
              articleId: p.articleId,
              quantity: qty(p.quantity).toString(),
              reason: required(p.reason, "Necesidad de compra"),
            },
          ],
        );
        break;
      }
      case "request.convert": {
        const d = await this.doc(c, p, "SOLICITUD", ["PENDIENTE"]);
        const purchaseId = required(p.purchaseId, "Orden de compra");
        if (
          !(await one(c, "SELECT id FROM suppliers WHERE id=$1", [
            p.supplierId,
          ]))
        )
          fail("Proveedor inválido");
        await c.query(
          "INSERT INTO documents(id,kind,status,data) VALUES($1,$2,$3,$4)",
          [
            purchaseId,
            "COMPRA",
            "BORRADOR",
            {
              articleId: d.data.articleId,
              supplierId: p.supplierId,
              quantity: d.data.quantity,
              received: "0",
              requestId: id,
            },
          ],
        );
        await this.update(c, id, "CONVERTIDA", { ...d.data, purchaseId });
        break;
      }
      case "purchase.create": {
        if (
          !(await one(c, "SELECT id FROM suppliers WHERE id=$1", [
            p.supplierId,
          ]))
        )
          fail("Proveedor inválido");
        if (
          !(await one(c, "SELECT id FROM articles WHERE id=$1", [p.articleId]))
        )
          fail("Artículo inválido");
        await c.query(
          "INSERT INTO documents(id,kind,status,data) VALUES($1,$2,$3,$4)",
          [
            id,
            "COMPRA",
            "BORRADOR",
            {
              articleId: p.articleId,
              supplierId: p.supplierId,
              quantity: qty(p.quantity).toString(),
              received: "0",
            },
          ],
        );
        break;
      }
      case "purchase.approve":
        await this.doc(c, p, "COMPRA", ["BORRADOR"]);
        await this.update(c, id, "APROBADA");
        break;
      case "purchase.ship":
        await this.doc(c, p, "COMPRA", ["APROBADA"]);
        await this.update(c, id, "TRANSITO");
        break;
      case "purchase.receive": {
        const d = await this.doc(c, p, "COMPRA", [
            "TRANSITO",
            "PARCIAL",
          ]),
          q = qty(p.quantity),
          received = new Decimal(d.data.received).plus(q);
        if (received.gt(d.data.quantity))
          fail("La recepción excede la cantidad pendiente");
        if (await one(c, "SELECT id FROM lots WHERE id=$1", [p.lotId]))
          fail(
            `El lote ${p.lotId} ya existe. La recepción debe identificar el lote físico nuevo del proveedor; para corregir un saldo existente utiliza conteo y ajuste autorizado.`,
          );
        await this.inv.newLot(c, p.lotId, d.data.articleId, p.expiry);
        await this.inv.move(c, {
          key,
          type: "RECEPCION",
          lot: p.lotId,
          location: p.locationId,
          quantity: q,
          document: id,
          reason: "Recepción " + p.receiptRef + " en cuarentena",
          actor,
        });
        await this.update(
          c,
          id,
          received.eq(d.data.quantity) ? "RECIBIDA" : "PARCIAL",
          { ...d.data, received: received.toString() },
        );
        return {
          id,
          message: `Recepción registrada: ${q.toString()} unidades en el nuevo lote ${p.lotId}. El lote quedó en CUARENTENA y todavía no aporta ATP; Calidad debe liberarlo. Pendiente de la orden: ${new Decimal(d.data.quantity).minus(received).toString()}.`,
        };
      }
      case "receipt.create":
        await this.inv.newLot(c, p.lotId, p.articleId, p.expiry);
        await this.inv.move(c, {
          key,
          type: "RECEPCION",
          lot: p.lotId,
          location: p.locationId,
          quantity: qty(p.quantity),
          document: id,
          reason: required(p.reason, "Motivo o remito"),
          actor,
        });
        break;
      case "quality.set": {
        const lot = await one(c, "SELECT * FROM lots WHERE id=$1", [id]);
        if (!lot) fail("Lote no encontrado");
        version(lot.version, p.version);
        if (
          !["LIBERADO", "BLOQUEADO", "RECHAZADO", "CUARENTENA"].includes(
            p.quality,
          )
        )
          fail("Estado inválido");
        required(p.reason, "Justificación");
        await c.query(
          "UPDATE lots SET quality=$2,version=version+1 WHERE id=$1",
          [id, p.quality],
        );
        await c.query(
          "INSERT INTO audit(actor,action,detail) VALUES($1,$2,$3)",
          [
            actor,
            "quality.decision",
            {
              lot: id,
              previous: lot.quality,
              quality: p.quality,
              reason: p.reason,
            },
          ],
        );
        break;
      }
      case "order.create": {
        if (
          !(await one(c, "SELECT id FROM articles WHERE id=$1", [p.articleId]))
        )
          fail("Artículo inválido");
        if (
          !(await one(c, "SELECT id FROM warehouses WHERE id=$1", [
            p.warehouseId,
          ]))
        )
          fail("Almacén inválido");
        await c.query(
          "INSERT INTO documents(id,kind,status,data) VALUES($1,$2,$3,$4)",
          [
            id,
            "PEDIDO",
            "PENDIENTE",
            {
              articleId: p.articleId,
              warehouseId: p.warehouseId,
              quantity: qty(p.quantity).toString(),
              customer: required(p.customer, "Cliente"),
              paymentType: p.paymentType || "Referencia externa",
            },
          ],
        );
        break;
      }
      case "order.reserve": {
        const d = await this.doc(c, p, "PEDIDO", ["PENDIENTE"]);
        const allocations = await this.inv.reserve(
          c,
          id,
          d.data.articleId,
          d.data.warehouseId,
          qty(d.data.quantity),
        );
        await this.update(c, id, "RESERVADO");
        return {
          id,
          message: "Reserva confirmada sin descontar existencia física",
          allocations,
        };
      }
      case "order.promise": {
        const d = await this.doc(c, p, "PEDIDO", ["PENDIENTE", "RESERVADO"]);
        const a = await one(c, "SELECT * FROM articles WHERE id=$1", [
          d.data.articleId,
        ]);
        const availability = await one(
          c,
          "SELECT COALESCE(SUM(available),0) available FROM inventory_view WHERE article_id=$1 AND warehouse_id=$2",
          [d.data.articleId, d.data.warehouseId],
        );
        const own = await one(
          c,
          `SELECT COALESCE(SUM(r.quantity),0) q FROM reservations r JOIN inventory_view v ON v.lot_id=r.lot_id AND v.location_id=r.location_id WHERE r.document_id=$1 AND r.status='ACTIVA' AND v.quality='LIBERADO' AND (v.expiry IS NULL OR v.expiry>=CURRENT_DATE)`,
          [id],
        );
        const atp = Decimal.max(
          0,
          new Decimal(availability.available).plus(own.q).minus(a.safety_stock),
        );
        if (atp.lt(d.data.quantity))
          fail(
            "ATP insuficiente al proteger el stock de seguridad. No se puede prometer esta cantidad.",
          );
        const prep = Number(p.preparationDays),
          transit = Number(p.transitDays);
        if (
          ![prep, transit].every(
            (v) => Number.isInteger(v) && v >= 0 && v <= 365,
          )
        )
          fail("Los plazos deben ser días enteros entre 0 y 365");
        const delivery = await one(
          c,
          "SELECT (CURRENT_DATE+$1::integer+$2::integer)::text AS promised_date",
          [prep, transit],
        );
        const promise = {
          version: (d.data.promise?.version || 0) + 1,
          date: delivery.promised_date,
          atp: atp.toString(),
          preparationDays: prep,
          transitDays: transit,
          note: "Estimación académica con plazos declarados, no confirmación TMS",
        };
        await this.update(c, id, d.status, { ...d.data, promise });
        return {
          id,
          message:
            "Promesa v" +
            promise.version +
            ": " +
            promise.date +
            " · estimación, sujeta a reserva y revisión logística",
          promise,
        };
      }
      case "order.dispatch":
        await this.doc(c, p, "PEDIDO", ["RESERVADO"]);
        await this.inv.release(c, id, true, key, actor);
        await this.update(c, id, "DESPACHADO");
        break;
      case "order.deliver": {
        const d = await this.doc(c, p, "PEDIDO", ["DESPACHADO"]);
        await this.update(c, id, "ENTREGADO", {
          ...d.data,
          evidence: required(p.evidence, "Evidencia de entrega"),
        });
        return {
          id,
          message:
            "Entrega registrada. No descuenta inventario por segunda vez.",
        };
      }
      case "order.cancel": {
        const d = await this.doc(c, p, "PEDIDO", ["PENDIENTE", "RESERVADO"]);
        if (d.status === "RESERVADO")
          await this.inv.release(c, id, false, key, actor);
        await this.update(c, id, "CANCELADO");
        break;
      }
      case "order.return": {
        const d = await this.doc(c, p, "PEDIDO", ["DESPACHADO", "ENTREGADO"]);
        const q = qty(p.quantity);
        if (q.gt(d.data.quantity))
          fail("No se puede devolver más de lo despachado");
        await this.inv.newLot(c, p.lotId, d.data.articleId, p.expiry);
        await this.inv.move(c, {
          key,
          type: "DEVOLUCION",
          lot: p.lotId,
          location: p.locationId,
          quantity: q,
          document: id,
          reason: required(p.reason, "Motivo"),
          actor,
        });
        await this.update(c, id, "DEVUELTO", {
          ...d.data,
          returned: q.toString(),
        });
        break;
      }
      case "transfer.create": {
        const q = qty(p.quantity);
        if (p.fromLocation === p.toLocation)
          fail("Origen y destino deben ser distintos");
        const b = await one(
          c,
          "SELECT * FROM inventory_view WHERE lot_id=$1 AND location_id=$2",
          [p.lotId, p.fromLocation],
        );
        if (!b || q.gt(b.available)) fail("Stock elegible insuficiente");
        if (
          !(await one(c, "SELECT id FROM locations WHERE id=$1", [
            p.toLocation,
          ]))
        )
          fail("Destino inválido");
        await c.query(
          "INSERT INTO documents(id,kind,status,data) VALUES($1,$2,$3,$4)",
          [
            id,
            "TRASLADO",
            "TRANSITO",
            {
              lotId: p.lotId,
              fromLocation: p.fromLocation,
              toLocation: p.toLocation,
              quantity: q.toString(),
            },
          ],
        );
        await this.inv.move(c, {
          key,
          type: "TRASLADO_SALIDA",
          lot: p.lotId,
          location: p.fromLocation,
          quantity: q.neg(),
          document: id,
          reason: "Mercancía en tránsito interno; no disponible en destino",
          actor,
        });
        break;
      }
      case "transfer.receive": {
        const d = await this.doc(c, p, "TRASLADO", ["TRANSITO"]);
        await this.inv.move(c, {
          key,
          type: "TRASLADO_ENTRADA",
          lot: d.data.lotId,
          location: d.data.toLocation,
          quantity: qty(d.data.quantity),
          document: id,
          reason: "Recepción de traslado interno",
          actor,
        });
        await this.update(c, id, "RECIBIDO");
        break;
      }
      case "count.create": {
        const b = await one(
          c,
          "SELECT * FROM balances WHERE lot_id=$1 AND location_id=$2",
          [p.lotId, p.locationId],
        );
        if (!b) fail("Existencia no encontrada");
        await c.query(
          "INSERT INTO counts(id,lot_id,location_id,theoretical,counted,balance_version,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            id,
            p.lotId,
            p.locationId,
            b.physical,
            qty(p.quantity, true).toString(),
            b.version,
            required(p.reason, "Motivo"),
            actor,
          ],
        );
        break;
      }
      case "count.approve": {
        const count = await one(c, "SELECT * FROM counts WHERE id=$1", [id]);
        if (!count || count.status !== "PENDIENTE") fail("Conteo no pendiente");
        if (count.created_by === actor)
          fail(
            "La aprobación requiere otro usuario autorizado (separación de funciones)",
          );
        const b = await one(
          c,
          "SELECT * FROM balances WHERE lot_id=$1 AND location_id=$2",
          [count.lot_id, count.location_id],
        );
        version(b.version, count.balance_version);
        const diff = new Decimal(count.counted).minus(count.theoretical);
        if (!diff.eq(0))
          await this.inv.move(c, {
            key,
            type: "AJUSTE_CONTEO",
            lot: count.lot_id,
            location: count.location_id,
            quantity: diff,
            reason: count.reason,
            actor,
          });
        await c.query(
          "UPDATE counts SET status=$2,approved_by=$3 WHERE id=$1",
          [id, "APROBADO", actor],
        );
        return {
          id,
          message:
            "Conteo aprobado. Diferencia: " +
            diff.toString() +
            ". No se clasifica automáticamente como merma.",
        };
      }
      case "merma.create":
        await this.inv.move(c, {
          key,
          type: "MERMA",
          lot: p.lotId,
          location: p.locationId,
          quantity: qty(p.quantity).neg(),
          document: id,
          reason: required(p.reason, "Causa de merma"),
          actor,
        });
        break;
      case "production.create": {
        for (const a of [p.inputArticle, p.outputArticle])
          if (!(await one(c, "SELECT id FROM articles WHERE id=$1", [a])))
            fail("Artículo no encontrado");
        if (p.inputArticle === p.outputArticle)
          fail("Entrada y producto deben ser distintos");
        if (
          !(await one(c, "SELECT id FROM warehouses WHERE id=$1", [
            p.warehouseId,
          ]))
        )
          fail("Almacén inválido");
        await c.query(
          "INSERT INTO documents(id,kind,status,data) VALUES($1,$2,$3,$4)",
          [
            id,
            "PRODUCCION",
            "PLANIFICADA",
            {
              inputArticle: p.inputArticle,
              outputArticle: p.outputArticle,
              inputQuantity: qty(p.quantity).toString(),
              warehouseId: p.warehouseId,
            },
          ],
        );
        break;
      }
      case "production.reserve": {
        const d = await this.doc(c, p, "PRODUCCION", ["PLANIFICADA"]);
        const allocations = await this.inv.reserve(
          c,
          id,
          d.data.inputArticle,
          d.data.warehouseId,
          qty(d.data.inputQuantity),
        );
        await this.update(c, id, "RESERVADA");
        return {
          id,
          message: "Material reservado para producción",
          allocations,
        };
      }
      case "production.finish": {
        const d = await this.doc(c, p, "PRODUCCION", ["RESERVADA"]),
          good = qty(p.quantity),
          loss = qty(p.loss || 0, true);
        if (loss.gt(0)) required(p.reason, "Causa de merma");
        const consumed = await this.inv.release(
          c,
          id,
          true,
          key,
          actor,
          "CONSUMO",
        );
        await this.inv.newLot(c, p.lotId, d.data.outputArticle, p.expiry);
        await this.inv.move(c, {
          key: key + ":alta",
          type: "PRODUCCION",
          lot: p.lotId,
          location: p.locationId,
          quantity: good.plus(loss),
          document: id,
          reason:
            "Producción bruta. Producto en cuarentena hasta decisión de Calidad.",
          actor,
        });
        if (loss.gt(0))
          await this.inv.move(c, {
            key: key + ":merma",
            type: "MERMA_PRODUCCION",
            lot: p.lotId,
            location: p.locationId,
            quantity: loss.neg(),
            document: id,
            reason: p.reason,
            actor,
          });
        const totals = new Map<string, Decimal>();
        for (const r of consumed)
          totals.set(
            r.lot_id,
            (totals.get(r.lot_id) || new Decimal(0)).plus(r.quantity),
          );
        for (const [parent, q] of totals)
          await c.query(
            "INSERT INTO genealogy(parent_lot,child_lot,document_id,quantity) VALUES($1,$2,$3,$4)",
            [parent, p.lotId, id, q.toString()],
          );
        await this.update(c, id, "CERRADA", {
          ...d.data,
          good: good.toString(),
          loss: loss.toString(),
          lotId: p.lotId,
        });
        return {
          id,
          message:
            "Producción cerrada: " +
            good +
            " unidades de salida pendientes de calidad. Merma: " +
            loss,
        };
      }
      case "replenishment.evaluate": {
        const planning = await this.inv.planning(c);
        const rows = p.articleId
          ? planning.filter((article: any) => article.id === p.articleId)
          : planning;
        if (p.articleId && rows.length === 0)
          fail("El artículo indicado no existe");
        let opened = 0;
        for (const a of rows) {
          const position = new Decimal(a.available).plus(a.incoming);
          if (position.lte(a.rop)) {
            await c.query(
              `INSERT INTO suggestions(id,article_id,position,rop) VALUES($1,$2,$3,$4) ON CONFLICT(article_id) WHERE status='ABIERTA' DO UPDATE SET position=EXCLUDED.position,rop=EXCLUDED.rop,version=suggestions.version+1`,
              [randomUUID(), a.id, position.toString(), a.rop],
            );
            opened++;
          } else
            await c.query(
              "UPDATE suggestions SET status=$2,version=version+1 WHERE article_id=$1 AND status=$3",
              [a.id, "RESUELTA", "ABIERTA"],
            );
        }
        return {
          id,
          message:
            opened +
            " artículos con sugerencia de reposición. No se crean compras automáticas.",
        };
      }
      case "outbox.retry": {
        const o = await one(c, "SELECT * FROM outbox WHERE id=$1", [id]);
        if (!o || o.status !== "REVISION")
          fail("Solo se reintentan mensajes en revisión");
        await c.query(
          "UPDATE outbox SET status=$2,attempts=0,next_attempt=now(),last_error=null WHERE id=$1",
          [id, "PENDIENTE"],
        );
        break;
      }
      default:
        fail("Operación no implementada: " + action);
    }
    return { id, message: "Operación confirmada: " + action };
  }
}
