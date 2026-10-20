import test, { before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
const base = process.env.BASE_URL;
if (!base || !process.env.DATABASE_URL?.includes("cbn_test_"))
  throw new Error(
    "Ejecutar con node tests/run.mjs: nunca probar contra la base de demostración.",
  );
let admin, warehouse, supervisor, viewer;
async function call(path, body, token = admin) {
  const r = await fetch(base + "/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const v = await r.json();
  return { status: r.status, ...v };
}
async function cmd(action, data, token = admin, eventId = randomUUID()) {
  return call("commands", { action, data, source: "ERP_WEB", eventId }, token);
}
async function ok(action, data, token) {
  const r = await cmd(action, data, token);
  assert.ok(r.status < 300, JSON.stringify(r));
  return r;
}
async function state() {
  return call("state");
}
async function doc(id) {
  return (await state()).documents.find((x) => x.id === id);
}
async function makeArticle(id, policy = "FIFO") {
  await ok("article.create", {
    id,
    name: id,
    category: "Repuestos",
    unit: "unidad",
    policy,
    abc: "B",
    dailyDemand: 2,
    leadDays: 4,
    safetyStock: 3,
  });
}
async function receive(article, lot, quantity = 100, expiry = "2035-10-01") {
  await ok("receipt.create", {
    id: "REC-" + lot,
    articleId: article,
    lotId: lot,
    locationId: "MP-A1",
    quantity,
    expiry,
    reason: "Prueba",
  });
}
async function release(lot) {
  const l = (await state()).lots.find((x) => x.id === lot);
  await ok("quality.set", {
    id: lot,
    version: l.version,
    quality: "LIBERADO",
    reason: "Ensayo conforme",
  });
}
async function order(id, article, quantity) {
  await ok("order.create", {
    id,
    articleId: article,
    warehouseId: "PLANTA",
    quantity,
    customer: "Prueba",
  });
}
before(async () => {
  for (const [name, set] of [
    ["admin", (v) => (admin = v)],
    ["almacen", (v) => (warehouse = v)],
    ["supervisor", (v) => (supervisor = v)],
    ["gerencia", (v) => (viewer = v)],
  ]) {
    const r = await call(
      "login",
      { username: name, password: "CbnDemo2026!" },
      null,
    );
    assert.equal(r.status, 201);
    set(r.token);
  }
});

test("26 · administración crea roles, asigna y revoca el acceso", async()=>{
 await ok("role.create",{id:"lector-prueba",name:"Lector de pruebas",permissions:"reportes"});
 await ok("user.create",{id:"nuevo-prueba",name:"Usuario de prueba",roleId:"lector-prueba",password:"PruebaSegura2026!"});
 let login=await call("login",{username:"nuevo-prueba",password:"PruebaSegura2026!"},null);
 assert.equal(login.status,201);
 assert.equal((await cmd("merma.create",{id:"NO-PERMITIDO"},login.token)).status,403);
 await ok("user.update",{id:"nuevo-prueba",version:1,roleId:"lector-prueba",active:false});
 assert.equal((await call("state",null,login.token)).status,401);
 assert.equal((await call("login",{username:"nuevo-prueba",password:"PruebaSegura2026!"},null)).status,401);
});

test("27 · las respuestas no exponen hashes de contraseñas",async()=>{
 const s=await state();assert.ok(s.users.length);
 assert.ok(s.users.every(u=>!("password_hash" in u)));
 assert.ok(!JSON.stringify(s.outbox).includes("PruebaSegura2026!"));
});

test("01 · permisos de escritura se aplican en el backend", async () => {
  const r = await cmd("article.create", { id: "DENIED" }, viewer);
  assert.equal(r.status, 403);
  assert.equal(
    (
      await call(
        "commands",
        { action: "receipt.create", data: { id: "X" }, eventId: randomUUID() },
        null,
      )
    ).status,
    401,
  );
});
test("02 · recepción física en cuarentena no es disponible", async () => {
  await makeArticle("T-Q");
  await receive("T-Q", "T-Q-L");
  const b = (await state()).inventory.find((x) => x.lot_id === "T-Q-L");
  assert.equal(+b.physical, 100);
  assert.equal(+b.available, 0);
});
test("03 · mismo eventId no duplica y payload distinto se rechaza", async () => {
  await makeArticle("T-D");
  const event = randomUUID(),
    p = {
      id: "REC-T-D",
      articleId: "T-D",
      lotId: "T-D-L",
      locationId: "MP-A1",
      quantity: 20,
      reason: "Prueba",
    };
  assert.equal((await cmd("receipt.create", p, admin, event)).status, 201);
  const second = await cmd("receipt.create", p, admin, event);
  assert.equal(second.duplicate, true);
  assert.equal(second.deduplication, "eventId");
  assert.equal(
    (await cmd("receipt.create", { ...p, quantity: 21 }, admin, event)).status,
    409,
  );
  assert.equal(
    (await state()).movements.filter((x) => x.lot_id === "T-D-L").length,
    1,
  );
});
test("04 · distinto eventId mismo hecho se deduplica por negocio", async () => {
  const p = {
    id: "REC-T-D",
    articleId: "T-D",
    lotId: "T-D-L",
    locationId: "MP-A1",
    quantity: 20,
    reason: "Prueba",
  };
  const r = await ok("receipt.create", p);
  assert.equal(r.duplicate, true);
  assert.equal(r.deduplication, "clave de negocio");
  assert.equal(
    (await state()).movements.filter((x) => x.lot_id === "T-D-L").length,
    1,
  );
});
test("05 · FEFO elige el lote que vence antes, no el que ingresó primero", async () => {
  await makeArticle("T-FEFO", "FEFO");
  await receive("T-FEFO", "FEFO-ANTIGUO", 30, "2035-10-01");
  await receive("T-FEFO", "FEFO-PRONTO", 30, "2034-10-01");
  await release("FEFO-ANTIGUO");
  await release("FEFO-PRONTO");
  await order("PED-FEFO", "T-FEFO", 10);
  const r = await ok("order.reserve", { id: "PED-FEFO", version: 1 });
  assert.equal(r.allocations[0].lot, "FEFO-PRONTO");
});
test("06 · FIFO elige por fecha de ingreso", async () => {
  await makeArticle("T-FIFO");
  await receive("T-FIFO", "FIFO-PRIMERO", 30, "2035-10-01");
  await receive("T-FIFO", "FIFO-SEGUNDO", 30, "2034-10-01");
  await release("FIFO-PRIMERO");
  await release("FIFO-SEGUNDO");
  await order("PED-FIFO", "T-FIFO", 10);
  const r = await ok("order.reserve", { id: "PED-FIFO", version: 1 });
  assert.equal(r.allocations[0].lot, "FIFO-PRIMERO");
});
test("07 · dos reservas concurrentes no sobreasignan stock", async () => {
  await makeArticle("T-RACE");
  await receive("T-RACE", "RACE-LOT", 10);
  await release("RACE-LOT");
  await order("RACE-A", "T-RACE", 7);
  await order("RACE-B", "T-RACE", 7);
  const results = await Promise.all([
    cmd("order.reserve", { id: "RACE-A", version: 1 }),
    cmd("order.reserve", { id: "RACE-B", version: 1 }),
  ]);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 400).length, 1);
  const b = (await state()).inventory.find((r) => r.lot_id === "RACE-LOT");
  assert.equal(+b.reserved, 7);
  assert.equal(+b.physical, 10);
  assert.equal(+b.available, 3);
});
test("08 · bloquear un lote reservado impide despacho", async () => {
  const l = (await state()).lots.find((x) => x.id === "FEFO-PRONTO");
  await ok("quality.set", {
    id: l.id,
    version: l.version,
    quality: "BLOQUEADO",
    reason: "Retención de prueba",
  });
  assert.equal(
    (await cmd("order.dispatch", { id: "PED-FEFO", version: 2 })).status,
    400,
  );
  const b = (await state()).inventory.find((r) => r.lot_id === l.id);
  assert.equal(+b.physical, 30);
  assert.equal(+b.reserved, 10);
  await release(l.id);
});
test("09 · despacho descuenta una vez; entrega no toca stock", async () => {
  await ok("order.dispatch", { id: "PED-FEFO", version: 2 });
  const s1 = (await state()).inventory.find((r) => r.lot_id === "FEFO-PRONTO");
  assert.equal(+s1.physical, 20);
  assert.equal(+s1.reserved, 0);
  await ok("order.deliver", {
    id: "PED-FEFO",
    version: 3,
    evidence: "Comprobante simulado",
  });
  const s2 = (await state()).inventory.find((r) => r.lot_id === "FEFO-PRONTO");
  assert.equal(+s2.physical, 20);
  assert.equal(
    (await ok("order.dispatch", { id: "PED-FEFO", version: 2 })).duplicate,
    true,
  );
});
test("10 · lote vencido no entra en reserva", async () => {
  await makeArticle("T-EXP", "FEFO");
  await receive("T-EXP", "EXP-LOT", 30, "2020-01-01");
  await release("EXP-LOT");
  await order("EXP-PED", "T-EXP", 1);
  assert.equal(
    (await cmd("order.reserve", { id: "EXP-PED", version: 1 })).status,
    400,
  );
});
test("11 · traslado mantiene tránsito sin disponibilidad duplicada", async () => {
  await ok("transfer.create", {
    id: "TR-TEST",
    lotId: "FIFO-SEGUNDO",
    fromLocation: "MP-A1",
    toLocation: "CD-A1",
    quantity: 8,
  });
  let s = await state();
  assert.equal(
    +s.inventory.find(
      (r) => r.lot_id === "FIFO-SEGUNDO" && r.location_id === "MP-A1",
    ).physical,
    22,
  );
  assert.equal(
    s.inventory.some(
      (r) => r.lot_id === "FIFO-SEGUNDO" && r.location_id === "CD-A1",
    ),
    false,
  );
  await ok("transfer.receive", { id: "TR-TEST", version: 1 });
  s = await state();
  assert.equal(
    +s.inventory.find(
      (r) => r.lot_id === "FIFO-SEGUNDO" && r.location_id === "CD-A1",
    ).physical,
    8,
  );
});
test("12 · conteo no ajusta solo; segregación y aprobación exacta", async () => {
  const id = randomUUID();
  await ok(
    "count.create",
    {
      id,
      lotId: "FIFO-SEGUNDO",
      locationId: "MP-A1",
      quantity: 20,
      reason: "Diferencia confirmada",
    },
    warehouse,
  );
  assert.equal(
    +(await state()).inventory.find(
      (r) => r.lot_id === "FIFO-SEGUNDO" && r.location_id === "MP-A1",
    ).physical,
    22,
  );
  assert.equal((await cmd("count.approve", { id }, warehouse)).status, 403);
  await ok("count.approve", { id }, supervisor);
  assert.equal(
    +(await state()).inventory.find(
      (r) => r.lot_id === "FIFO-SEGUNDO" && r.location_id === "MP-A1",
    ).physical,
    20,
  );
  assert.equal(
    (await state()).movements.filter((m) => m.type === "AJUSTE_CONTEO").length,
    1,
  );
});
test("13 · conteo obsoleto rechaza aprobación sin cambiar saldo", async () => {
  const id = randomUUID();
  await ok(
    "count.create",
    {
      id,
      lotId: "FIFO-SEGUNDO",
      locationId: "MP-A1",
      quantity: 19,
      reason: "Recuento",
    },
    warehouse,
  );
  await ok("merma.create", {
    id: "MER-STALE",
    lotId: "FIFO-SEGUNDO",
    locationId: "MP-A1",
    quantity: 2,
    reason: "Rotura",
  });
  assert.equal((await cmd("count.approve", { id }, supervisor)).status, 409);
  assert.equal(
    +(await state()).inventory.find(
      (r) => r.lot_id === "FIFO-SEGUNDO" && r.location_id === "MP-A1",
    ).physical,
    18,
  );
});
test("14 · merma excesiva se revierte íntegramente", async () => {
  const before = (await state()).movements.length;
  assert.equal(
    (
      await cmd("merma.create", {
        id: "MER-TOOMUCH",
        lotId: "FIFO-SEGUNDO",
        locationId: "MP-A1",
        quantity: 1000,
        reason: "Prueba rechazo",
      })
    ).status,
    400,
  );
  assert.equal((await state()).movements.length, before);
});
test("15 · producción sin merma, consumo y genealogía atómicos", async () => {
  await makeArticle("T-OUT", "FEFO");
  await ok("production.create", {
    id: "OP-TEST",
    inputArticle: "T-FIFO",
    outputArticle: "T-OUT",
    quantity: 5,
    warehouseId: "PLANTA",
  });
  await ok("production.reserve", { id: "OP-TEST", version: 1 });
  await ok("production.finish", {
    id: "OP-TEST",
    version: 2,
    lotId: "OUT-LOT",
    locationId: "PT-A1",
    quantity: 12,
    loss: 0,
    expiry: "2035-02-01",
  });
  const s = await state();
  assert.equal(
    s.genealogy.filter((g) => g.document_id === "OP-TEST").length,
    1,
  );
  assert.equal(
    s.movements.filter(
      (m) => m.document_id === "OP-TEST" && m.type === "MERMA_PRODUCCION",
    ).length,
    0,
  );
  assert.equal(+s.inventory.find((r) => r.lot_id === "OUT-LOT").physical, 12);
  assert.equal(+s.inventory.find((r) => r.lot_id === "OUT-LOT").available, 0);
});
test("16 · compra parcial reduce pendiente sin duplicar recepción", async () => {
  await ok("purchase.create", {
    id: "OC-TEST",
    supplierId: "PROV-001",
    articleId: "T-FIFO",
    quantity: 10,
  });
  await ok("purchase.approve", { id: "OC-TEST", version: 1 });
  await ok("purchase.ship", { id: "OC-TEST", version: 2 });
  const p = {
    id: "OC-TEST",
    version: 3,
    receiptRef: "REC-PARCIAL",
    lotId: "OC-LOT",
    locationId: "MP-A1",
    quantity: 4,
  };
  await ok("purchase.receive", p);
  assert.equal((await doc("OC-TEST")).status, "PARCIAL");
  assert.equal((await doc("OC-TEST")).data.received, "4");
  assert.equal((await ok("purchase.receive", p)).duplicate, true);
  const plan = (await state()).planning.find((a) => a.id === "T-FIFO");
  assert.equal(+plan.transit, 6);
});
test("17 · ROP y sugerencia única por artículo", async () => {
  await makeArticle("T-ROP");
  await ok("replenishment.evaluate", { id: "EVAL-1" });
  await ok("replenishment.evaluate", { id: "EVAL-2" });
  const s = await state();
  const p = s.planning.find((a) => a.id === "T-ROP");
  assert.equal(+p.rop, 11);
  assert.equal(
    s.suggestions.filter(
      (a) => a.article_id === "T-ROP" && a.status === "ABIERTA",
    ).length,
    1,
  );
});
test("18 · versión antigua de calidad se rechaza", async () => {
  assert.equal(
    (
      await cmd("quality.set", {
        id: "T-Q-L",
        version: 0,
        quality: "LIBERADO",
        reason: "Estado antiguo",
      })
    ).status,
    409,
  );
});
test("19 · historial de movimientos no se puede reescribir", async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await assert.rejects(
      pool.query(
        "UPDATE movements SET reason='alterado' WHERE business_key='seed:PT-2601'",
      ),
      /inmutable/,
    );
  } finally {
    await pool.end();
  }
});
test("21 · solicitud se convierte una sola vez a orden de compra", async () => {
  await ok("request.create", {
    id: "SC-TEST",
    articleId: "T-ROP",
    quantity: 50,
    reason: "Reposición",
  });
  await ok("request.convert", {
    id: "SC-TEST",
    version: 1,
    purchaseId: "OC-SOL",
    supplierId: "PROV-001",
  });
  assert.equal((await doc("SC-TEST")).status, "CONVERTIDA");
  assert.equal((await doc("OC-SOL")).data.requestId, "SC-TEST");
  const duplicate = await ok("request.convert", {
    id: "SC-TEST",
    version: 1,
    purchaseId: "OC-SOL",
    supplierId: "PROV-001",
  });
  assert.equal(duplicate.duplicate, true);
});
test("22 · ATP protege seguridad y promesa incrementa versión", async () => {
  await order("ATP-PED", "T-FIFO", 2);
  let r = await ok("order.promise", {
    id: "ATP-PED",
    version: 1,
    preparationDays: 1,
    transitDays: 2,
  });
  assert.equal(r.promise.version, 1);
  r = await ok("order.promise", {
    id: "ATP-PED",
    version: 2,
    preparationDays: 2,
    transitDays: 2,
  });
  assert.equal(r.promise.version, 2);
  await order("ATP-NO", "T-ROP", 1);
  assert.equal(
    (
      await cmd("order.promise", {
        id: "ATP-NO",
        version: 1,
        preparationDays: 1,
        transitDays: 1,
      })
    ).status,
    400,
  );
});
test("23 · conciliación confirma el libro sin modificar saldos", async () => {
  const s = await state();
  assert.ok(s.reconciliation.length);
  assert.ok(
    s.reconciliation.every(
      (r) =>
        Number(r.difference) === 0 && Number(r.reservation_difference) === 0,
    ),
  );
});
test("24 · producción con merma separa bruto, neto y pérdida", async () => {
  await ok("production.create", {
    id: "OP-MERMA",
    inputArticle: "T-FIFO",
    outputArticle: "T-OUT",
    quantity: 2,
    warehouseId: "PLANTA",
  });
  await ok("production.reserve", { id: "OP-MERMA", version: 1 });
  await ok("production.finish", {
    id: "OP-MERMA",
    version: 2,
    lotId: "OUT-MERMA",
    locationId: "PT-A1",
    quantity: 8,
    loss: 2,
    expiry: "2035-02-01",
    reason: "Rotura del producto",
  });
  const s = await state();
  assert.equal(+s.inventory.find((r) => r.lot_id === "OUT-MERMA").physical, 8);
  assert.equal(
    +s.movements.find(
      (r) => r.document_id === "OP-MERMA" && r.type === "PRODUCCION",
    ).quantity,
    10,
  );
  assert.equal(
    +s.movements.find(
      (r) => r.document_id === "OP-MERMA" && r.type === "MERMA_PRODUCCION",
    ).quantity,
    -2,
  );
});
test("25 · fallo al registrar resultado revierte el consumo de material", async () => {
  await ok("production.create", {
    id: "OP-ROLLBACK",
    inputArticle: "T-FIFO",
    outputArticle: "T-OUT",
    quantity: 2,
    warehouseId: "PLANTA",
  });
  await ok("production.reserve", { id: "OP-ROLLBACK", version: 1 });
  const before = await state();
  const result = await cmd("production.finish", {
    id: "OP-ROLLBACK",
    version: 2,
    lotId: "OUT-LOT",
    locationId: "PT-A1",
    quantity: 3,
    loss: 0,
    expiry: "2035-02-01",
  });
  assert.equal(result.status, 409);
  const after = await state();
  assert.equal(after.movements.length, before.movements.length);
  assert.equal((await doc("OP-ROLLBACK")).status, "RESERVADA");
  assert.equal(
    after.reservations.find((r) => r.document_id === "OP-ROLLBACK").status,
    "ACTIVA",
  );
});
test("20 · worker reintenta, conserva mensajes y entrega sin duplicar", async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  async function until(fn) {
    for (let i = 0; i < 80; i++) {
      await call("worker", {});
      const s = await state();
      if (fn(s)) return s;
      await new Promise((r) => setTimeout(r, 75));
    }
    assert.fail("No terminó el procesamiento esperado de la cola");
  }
  try {
    await call("worker", { fail: false });
    await until((s) => s.outbox.every((o) => o.status !== "PENDIENTE"));
    await call("worker", { fail: true });
    await ok("replenishment.evaluate", { id: "EVENT-RETRY" });
    let o = (await state()).outbox.find(
      (x) => x.payload.reference === "EVENT-RETRY",
    );
    assert.ok(o);
    await until((s) => s.outbox.find((x) => x.id === o.id)?.attempts >= 1);
    for (let i = 0; i < 3; i++) {
      await pool.query("UPDATE outbox SET next_attempt=now() WHERE id=$1", [
        o.id,
      ]);
      await call("worker", {});
      await new Promise((r) => setTimeout(r, 100));
    }
    await until(
      (s) => s.outbox.find((x) => x.id === o.id)?.status === "REVISION",
    );
    await call("worker", { fail: false });
    await ok("outbox.retry", { id: o.id, retryRef: randomUUID() });
    let s = await until(
      (s) => s.outbox.find((x) => x.id === o.id)?.status === "ENVIADO",
    );
    assert.equal(s.deliveries.filter((x) => x.event_id === o.id).length, 1);
    await pool.query(
      "UPDATE outbox SET status='PENDIENTE',next_attempt=now() WHERE id=$1",
      [o.id],
    );
    s = await until(
      (s) => s.outbox.find((x) => x.id === o.id)?.status === "ENVIADO",
    );
    assert.equal(s.deliveries.filter((x) => x.event_id === o.id).length, 1);
  } finally {
    await pool.end();
    await call("worker", { fail: false });
  }
});
