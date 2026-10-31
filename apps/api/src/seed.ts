import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Db, ROOT } from "./db";
import { hashPassword } from "./auth";
async function ensureDashboardDemo(c: any) {
  await c.query(`
    INSERT INTO warehouses(id,name,center) VALUES
      ('EL-ALTO','Planta El Alto','La Paz'),
      ('HUARI','Planta Huari','Oruro'),
      ('TAQUINA','Planta Taquiña','Cochabamba'),
      ('SANTA-CRUZ','Centro Santa Cruz','Santa Cruz')
    ON CONFLICT(id) DO NOTHING;
    INSERT INTO locations(id,name,warehouse_id) VALUES
      ('EA-PT-01','Producto terminado El Alto','EL-ALTO'),
      ('HU-PT-01','Producto terminado Huari','HUARI'),
      ('TQ-PT-01','Producto terminado Taquiña','TAQUINA'),
      ('SC-PT-01','Producto terminado Santa Cruz','SANTA-CRUZ')
    ON CONFLICT(id) DO NOTHING;
  `);
  const rows = [
    {
      article: "PAC-0350",
      name: "Paceña Pilsener · lata 350 ml",
      category: "Producto terminado",
      unit: "caja",
      demand: 80,
      lead: 5,
      safety: 100,
      lot: "EA-261001",
      location: "EA-PT-01",
      physical: 180,
      reserved: 20,
      receivedAgo: 27,
      expiryIn: 65,
    },
    {
      article: "HUA-0620",
      name: "Huari · botella 620 ml",
      category: "Producto terminado",
      unit: "caja",
      demand: 80,
      lead: 5,
      safety: 200,
      lot: "HU-261004",
      location: "HU-PT-01",
      physical: 420,
      reserved: 40,
      receivedAgo: 23,
      expiryIn: 79,
    },
    {
      article: "BOC-0620",
      name: "Bock · botella 620 ml",
      category: "Producto terminado",
      unit: "caja",
      demand: 100,
      lead: 7,
      safety: 300,
      lot: "EA-261008",
      location: "EA-PT-01",
      physical: 760,
      reserved: 80,
      receivedAgo: 19,
      expiryIn: 91,
    },
    {
      article: "TAQ-0620",
      name: "Taquiña Pilsener · botella 620 ml",
      category: "Producto terminado",
      unit: "caja",
      demand: 100,
      lead: 6,
      safety: 300,
      lot: "TQ-261012",
      location: "TQ-PT-01",
      physical: 1800,
      reserved: 120,
      receivedAgo: 15,
      expiryIn: 103,
    },
    {
      article: "PAC-0620",
      name: "Paceña Pilsener · botella 620 ml",
      category: "Producto terminado",
      unit: "caja",
      demand: 100,
      lead: 8,
      safety: 200,
      lot: "SC-261016",
      location: "SC-PT-01",
      physical: 2400,
      reserved: 150,
      receivedAgo: 11,
      expiryIn: 119,
    },
    {
      article: "MAL-0330",
      name: "Maltín · lata 330 ml",
      category: "Producto terminado",
      unit: "caja",
      demand: 100,
      lead: 10,
      safety: 200,
      lot: "TQ-261020",
      location: "TQ-PT-01",
      physical: 3500,
      reserved: 200,
      receivedAgo: 7,
      expiryIn: 135,
    },
  ];
  for (const row of rows) {
    await c.query(
      `INSERT INTO articles(id,name,category,unit,policy,abc,daily_demand,lead_days,safety_stock)
       VALUES($1,$2,$3,$4,'FEFO','A',$5,$6,$7) ON CONFLICT(id) DO NOTHING`,
      [
        row.article,
        row.name,
        row.category,
        row.unit,
        row.demand,
        row.lead,
        row.safety,
      ],
    );
    await c.query(
      `INSERT INTO lots(id,article_id,expiry,received_at,quality)
       VALUES($1,$2,CURRENT_DATE+$3::integer,CURRENT_DATE-$4::integer,'LIBERADO')
       ON CONFLICT(id) DO NOTHING`,
      [row.lot, row.article, row.expiryIn, row.receivedAgo],
    );
    await c.query(
      `INSERT INTO balances(lot_id,location_id,physical,reserved)
       VALUES($1,$2,$3,$4) ON CONFLICT(lot_id,location_id) DO NOTHING`,
      [row.lot, row.location, row.physical, row.reserved],
    );
    await c.query(
      `INSERT INTO movements(id,business_key,type,lot_id,location_id,quantity,document_id,reason,actor,created_at)
       VALUES($1,$2,'RECEPCION',$3,$4,$5,$6,'Recepción histórica ficticia para el dashboard','demo-dashboard',CURRENT_DATE-$7::integer)
       ON CONFLICT(business_key) DO NOTHING`,
      [
        randomUUID(),
        "demo-dashboard:receipt:" + row.lot,
        row.lot,
        row.location,
        row.physical,
        "REC-DASH-" + row.article,
        row.receivedAgo,
      ],
    );
    const document = "PED-DASH-" + row.article;
    await c.query(
      `INSERT INTO documents(id,kind,status,data,created_at)
       VALUES($1,'PEDIDO','RESERVADO',$2,CURRENT_DATE-2)
       ON CONFLICT(id) DO NOTHING`,
      [
        document,
        {
          articleId: row.article,
          quantity: String(row.reserved),
          customer: "Cliente ficticio · DASHBOARD",
          warehouseId: locationWarehouse(row.location),
        },
      ],
    );
    await c.query(
      `INSERT INTO reservations(id,document_id,lot_id,location_id,quantity,status,explanation)
       SELECT $1,$2,$3,$4,$5,'ACTIVA','FEFO: primero vence, primero sale; reserva ficticia para dashboard.'
       WHERE NOT EXISTS(SELECT 1 FROM reservations WHERE document_id=$2)`,
      [randomUUID(), document, row.lot, row.location, row.reserved],
    );
  }
  const countedQuantities = [170, 400, 720, 1740, 2280, 3430];
  for (const [index, row] of rows.entries()) {
    const reason = `Conteo histórico ficticio KPI ${index + 1}`;
    await c.query(
      `INSERT INTO counts(id,lot_id,location_id,theoretical,counted,balance_version,status,reason,created_by,approved_by,created_at)
       SELECT $1,$2,$3,$4,$5,1,'APROBADO',$6,'demo-dashboard','demo-supervisor',CURRENT_DATE-$7::integer
       WHERE NOT EXISTS(SELECT 1 FROM counts WHERE reason=$6)`,
      [
        randomUUID(),
        row.lot,
        row.location,
        row.physical,
        countedQuantities[index],
        reason,
        row.receivedAgo,
      ],
    );
  }
  const historyDays = [27, 23, 19, 15, 11, 7];
  for (const [periodIndex, daysAgo] of historyDays.entries()) {
    for (let eventIndex = 0; eventIndex < 10; eventIndex += 1) {
      const row = rows[(periodIndex + eventIndex) % rows.length];
      const document = `PED-FEFO-H${periodIndex + 1}-${eventIndex + 1}`;
      const isCorrect = !(periodIndex < 3 && eventIndex === 9);
      await c.query(
        `INSERT INTO documents(id,kind,status,data,created_at)
         VALUES($1,'PEDIDO','COMPLETADO',$2,CURRENT_DATE-$3::integer)
         ON CONFLICT(id) DO NOTHING`,
        [
          document,
          {
            articleId: row.article,
            quantity: "1",
            customer: "Histórico ficticio · DASHBOARD",
            warehouseId: locationWarehouse(row.location),
          },
          daysAgo,
        ],
      );
      await c.query(
        `INSERT INTO reservations(id,document_id,lot_id,location_id,quantity,status,explanation)
         SELECT $1,$2,$3,$4,1,'COMPLETADA',$5
         WHERE NOT EXISTS(SELECT 1 FROM reservations WHERE document_id=$2)`,
        [
          randomUUID(),
          document,
          row.lot,
          row.location,
          isCorrect
            ? "FEFO: primero vence, primero sale; evento histórico ficticio."
            : "Excepción histórica ficticia: lote despachado fuera de secuencia FEFO.",
        ],
      );
    }
  }
  await c.query(
    `INSERT INTO audit(actor,action,detail)
     SELECT 'sistema','demo.dashboard.seed',$1
     WHERE NOT EXISTS(SELECT 1 FROM audit WHERE action='demo.dashboard.seed')`,
    [{ note: "Datos ficticios adicionales para visualización ejecutiva" }],
  );
}
function locationWarehouse(location: string) {
  if (location.startsWith("EA-")) return "EL-ALTO";
  if (location.startsWith("HU-")) return "HUARI";
  if (location.startsWith("TQ-")) return "TAQUINA";
  return "SANTA-CRUZ";
}
async function seed() {
  const db = new Db();
  try {
    await db.pool.query(
      readFileSync(path.join(ROOT, "database/001_initial.sql"), "utf8"),
    );
    await db.tx(async (c) => {
      if ((await c.query("SELECT 1 FROM users LIMIT 1")).rowCount) {
        await ensureDashboardDemo(c);
        console.log("La base ya contiene datos. No se sobrescribieron.");
        return;
      }
      const roles: any = {
        admin: ["*"],
        almacen: ["inventario"],
        calidad: ["calidad"],
        compras: ["compras", "maestros"],
        produccion: ["produccion"],
        despacho: ["despacho"],
        supervisor: [
          "inventario",
          "aprobar_ajustes",
          "reportes",
          "integraciones",
        ],
        gerencia: ["reportes"],
      };
      for (const [r, perms] of Object.entries(roles)) {
        await c.query(
          "INSERT INTO roles(id,name,permissions) VALUES($1,$2,$3)",
          [r, r, perms],
        );
        await c.query(
          "INSERT INTO users(id,username,name,password_hash,role_id) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), r, "Equipo " + r, hashPassword("CbnDemo2026!"), r],
        );
      }
      await c.query(
        "INSERT INTO warehouses(id,name) VALUES('PLANTA','Planta piloto'),('CD','Centro de distribución'); INSERT INTO locations(id,name,warehouse_id) VALUES('PT-A1','Producto terminado A1','PLANTA'),('MP-A1','Materia prima A1','PLANTA'),('CD-A1','Distribución A1','CD'); INSERT INTO suppliers(id,name,contact) VALUES('PROV-001','Insumos Andinos · DEMO','Proveedor ficticio'),('PROV-002','Envases del Sur · DEMO','Proveedor ficticio');",
      );
      await c.query(
        "INSERT INTO articles(id,name,category,unit,policy,abc,daily_demand,lead_days,safety_stock) VALUES('PT-001','Pilsen 330 ml · caja x24','Producto terminado','caja','FEFO','A',30,5,60),('MP-001','Malta cervecera','Materia prima','kg','FEFO','A',100,7,200),('EN-001','Botella 330 ml','Envases','unidad','FIFO','B',500,4,800),('RP-001','Junta de línea','Repuestos','unidad','FIFO','C',1,10,5)",
      );
      const lots = [
        ["PT-2601", "PT-001", 90, 30, "LIBERADO", "PT-A1", 200],
        ["PT-2602", "PT-001", 40, 10, "LIBERADO", "PT-A1", 220],
        ["PT-2603", "PT-001", 100, 1, "CUARENTENA", "PT-A1", 80],
        ["PT-2604", "PT-001", -5, 120, "BLOQUEADO", "PT-A1", 12],
        ["MP-2601", "MP-001", 120, 20, "LIBERADO", "MP-A1", 650],
        ["EN-2601", "EN-001", null, 30, "LIBERADO", "MP-A1", 4000],
        ["EN-2602", "EN-001", null, 5, "LIBERADO", "MP-A1", 3000],
        ["RP-2601", "RP-001", null, 20, "LIBERADO", "MP-A1", 8],
        ["PT-CD01", "PT-001", 60, 15, "LIBERADO", "CD-A1", 180],
      ];
      for (const [id, article, days, age, quality, location, amount] of lots) {
        await c.query(
          "INSERT INTO lots(id,article_id,expiry,received_at,quality) VALUES($1,$2,CASE WHEN $3::integer IS NULL THEN NULL ELSE CURRENT_DATE+$3::integer END,now()-$4::integer*interval '1 day',$5)",
          [id, article, days, age, quality],
        );
        await c.query(
          "INSERT INTO balances(lot_id,location_id,physical) VALUES($1,$2,$3)",
          [id, location, amount],
        );
        await c.query(
          "INSERT INTO movements(id,business_key,type,lot_id,location_id,quantity,reason,actor) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            randomUUID(),
            "seed:" + id,
            "APERTURA",
            id,
            location,
            amount,
            "Saldo inicial demostrativo",
            "sistema",
          ],
        );
      }
      // Demonstrate the distinction between a lot and an inventory position:
      // PT-2601 is one lot split across two internal locations. Existencias
      // therefore has two rows, while Lotes consolidates both into one row.
      await c.query(
        "INSERT INTO balances(lot_id,location_id,physical) VALUES('PT-2601','CD-A1',160)",
      );
      await c.query(
        "INSERT INTO movements(id,business_key,type,lot_id,location_id,quantity,reason,actor) VALUES($1,'seed:PT-2601:CD-A1','APERTURA','PT-2601','CD-A1',160,'Saldo inicial demostrativo en segunda ubicación','sistema')",
        [randomUUID()],
      );
      await c.query(
        "INSERT INTO documents(id,kind,status,data) VALUES($1,$2,$3,$4)",
        [
          "OC-DEMO-01",
          "COMPRA",
          "TRANSITO",
          {
            articleId: "MP-001",
            supplierId: "PROV-001",
            quantity: "200",
            received: "0",
          },
        ],
      );
      await c.query(
        "INSERT INTO documents(id,kind,status,data) VALUES($1,$2,$3,$4)",
        [
          "PED-DEMO-01",
          "PEDIDO",
          "PENDIENTE",
          {
            articleId: "PT-001",
            warehouseId: "PLANTA",
            quantity: "40",
            customer: "Distribuidora piloto · DEMO",
            paymentType: "Transferencia (referencia)",
          },
        ],
      );
      await c.query("INSERT INTO audit(actor,action,detail) VALUES($1,$2,$3)", [
        "sistema",
        "demo.seed",
        { note: "Datos ficticios para demostración académica" },
      ]);
      await ensureDashboardDemo(c);
      console.log(
        "Demo creada. Usuarios: " +
          Object.keys(roles).join(", ") +
          ". Contraseña local: CbnDemo2026!",
      );
    });
  } finally {
    await db.pool.end();
  }
}
seed().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
