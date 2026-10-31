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
  // Scenario design for the executive dashboard:
  // - El Alto: enough ATP/ROP but a material count difference.
  // - Huari: units retained by Quality while ATP and ROP still comply.
  // - Santa Cruz: ATP pressure caused by reservations, not by Quality.
  // These extra lots preserve the same master articles and keep the model in 3NF.
  const supplementalLots = [
    ["EA-PAC-COV", "PAC-0350", "EA-PT-01", 500, "LIBERADO", 110],
    ["EA-BOC-COV", "BOC-0620", "EA-PT-01", 400, "LIBERADO", 125],
    ["HU-COV-01", "HUA-0620", "HU-PT-01", 520, "LIBERADO", 105],
    ["HU-QA-01", "HUA-0620", "HU-PT-01", 60, "CUARENTENA", 140],
    ["TQ-PAC-COV", "PAC-0620", "TQ-PT-01", 800, "LIBERADO", 130],
  ];
  for (const [lot, article, location, physical, quality, expiryIn] of supplementalLots) {
    await c.query(
      `INSERT INTO lots(id,article_id,expiry,received_at,quality)
       VALUES($1,$2,CURRENT_DATE+$4::integer,CURRENT_DATE-29,$3)
       ON CONFLICT(id) DO NOTHING`,
      [lot, article, quality, expiryIn],
    );
    await c.query(
      `INSERT INTO balances(lot_id,location_id,physical,reserved)
       VALUES($1,$2,$3,0) ON CONFLICT(lot_id,location_id) DO NOTHING`,
      [lot, location, physical],
    );
    await c.query(
      `INSERT INTO movements(id,business_key,type,lot_id,location_id,quantity,document_id,reason,actor,created_at)
       VALUES($1,$2,'RECEPCION',$3,$4,$5,$6,'Cobertura histórica ficticia para escenario por planta','demo-dashboard',CURRENT_DATE-29)
       ON CONFLICT(business_key) DO NOTHING`,
      [
        randomUUID(),
        `demo-dashboard:supplemental:${lot}`,
        lot,
        location,
        physical,
        `REC-DASH-${lot}`,
      ],
    );
  }
  await c.query(
    `UPDATE balances SET reserved=550
     WHERE lot_id='SC-261016' AND location_id='SC-PT-01'`,
  );
  await c.query(
    `INSERT INTO documents(id,kind,status,data,created_at)
     VALUES('PED-DASH-SC-ATP','PEDIDO','RESERVADO',$1,CURRENT_DATE-6)
     ON CONFLICT(id) DO NOTHING`,
    [{
      articleId: "PAC-0620",
      quantity: "400",
      customer: "Escenario de presión ATP · DASHBOARD",
      warehouseId: "SANTA-CRUZ",
    }],
  );
  await c.query(
    `INSERT INTO reservations(id,document_id,lot_id,location_id,quantity,status,explanation)
     SELECT $1,'PED-DASH-SC-ATP','SC-261016','SC-PT-01',400,'ACTIVA','FEFO: reserva ficticia que genera presión ATP en Santa Cruz.'
     WHERE NOT EXISTS(SELECT 1 FROM reservations WHERE document_id='PED-DASH-SC-ATP')`,
    [randomUUID()],
  );
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
  const openingBridges = [
    ["HU-261004", "HU-PT-01", 420, 23],
    ["SC-261016", "SC-PT-01", 2400, 11],
    ["TQ-261012", "TQ-PT-01", 1800, 15],
  ] as const;
  for (const [lot, location, physical, receiptDay] of openingBridges) {
    for (const [suffix, quantity, day] of [
      ["open", physical, 29],
      ["close", -physical, receiptDay],
    ] as const) {
      await c.query(
        `INSERT INTO movements(id,business_key,type,lot_id,location_id,quantity,document_id,reason,actor,created_at)
         VALUES($1,$2,'SALDO_HISTORICO',$3,$4,$5,$6,'Puente ficticio de saldo inicial para la serie ejecutiva','demo-dashboard',CURRENT_DATE-$7::integer)
         ON CONFLICT(business_key) DO NOTHING`,
        [
          randomUUID(),
          `demo-dashboard:opening:${lot}:${suffix}`,
          lot,
          location,
          quantity,
          `OPEN-${lot}-${suffix}`,
          day,
        ],
      );
    }
  }
  const movementProfiles = [
    ["EA-261001", "EA-PT-01", [120, -80, 160, -140, 90, -150], [24, 20, 16, 12, 8, 4]],
    ["HU-261004", "HU-PT-01", [80, -45, 110, -95, 70, -120], [20, 17, 14, 11, 8, 4]],
    ["SC-261016", "SC-PT-01", [260, -170, 310, -240, 190, -350], [10, 8, 6, 4, 2, 1]],
    ["TQ-261012", "TQ-PT-01", [180, -120, 230, -160, 140, -270], [14, 12, 10, 8, 6, 4]],
    ["PT-2601", "PT-A1", [45, -25, 60, -50, 35, -65], [24, 20, 16, 12, 8, 4]],
  ] as const;
  for (const [lot, location, changes, profileDays] of movementProfiles) {
    for (const [index, quantity] of changes.entries()) {
      await c.query(
        `INSERT INTO movements(id,business_key,type,lot_id,location_id,quantity,document_id,reason,actor,created_at)
         VALUES($1,$2,'AJUSTE_DEMO',$3,$4,$5,$6,'Variación histórica ficticia para evolución ejecutiva','demo-dashboard',CURRENT_DATE-$7::integer)
         ON CONFLICT(business_key) DO NOTHING`,
        [
          randomUUID(),
          `demo-dashboard:history:${lot}:${index + 1}`,
          lot,
          location,
          quantity,
          `HIST-${lot}-${index + 1}`,
          profileDays[index],
        ],
      );
    }
  }
  const santaCruzVariation = [540, -330, 590, -460, 410, -750];
  const santaCruzDays = [10, 8, 6, 4, 2, 1];
  for (const [index, quantity] of santaCruzVariation.entries()) {
    await c.query(
      `INSERT INTO movements(id,business_key,type,lot_id,location_id,quantity,document_id,reason,actor,created_at)
       VALUES($1,$2,'AJUSTE_DEMO',$3,$4,$5,$6,'Variación adicional ficticia para hacer visible la presión ATP','demo-dashboard',CURRENT_DATE-$7::integer)
       ON CONFLICT(business_key) DO NOTHING`,
      [
        randomUUID(),
        `demo-dashboard:history-v2:SC-261016:${index + 1}`,
        "SC-261016",
        "SC-PT-01",
        quantity,
        `HIST-V2-SC-${index + 1}`,
        santaCruzDays[index],
      ],
    );
  }
  const countProfiles = [
    ["EA-261001", "EA-PT-01", 180, [178, 172, 180, 168, 176, 155], [24, 20, 16, 12, 8, 4]],
    ["HU-261004", "HU-PT-01", 420, [405, 412, 400, 415, 408, 416], [20, 17, 14, 11, 8, 4]],
    ["SC-261016", "SC-PT-01", 2400, [2350, 2300, 2375, 2320, 2360, 2376], [10, 8, 6, 4, 2, 1]],
    ["TQ-261012", "TQ-PT-01", 1800, [1780, 1750, 1785, 1730, 1770, 1788], [14, 12, 10, 8, 6, 4]],
    ["PT-2601", "PT-A1", 200, [196, 192, 199, 190, 197, 197], [24, 20, 16, 12, 8, 4]],
  ] as const;
  for (const [lot, location, theoretical, countedSeries, profileDays] of countProfiles) {
    for (const [index, counted] of countedSeries.entries()) {
      const reason = `Evolución ficticia ${lot} periodo ${index + 1}`;
      await c.query(
        `INSERT INTO counts(id,lot_id,location_id,theoretical,counted,balance_version,status,reason,created_by,approved_by,created_at)
         SELECT $1,$2,$3,$4,$5,1,'APROBADO',$6,'demo-dashboard','demo-supervisor',CURRENT_DATE-$7::integer
         WHERE NOT EXISTS(SELECT 1 FROM counts WHERE reason=$6)`,
        [
          randomUUID(),
          lot,
          location,
          theoretical,
          counted,
          reason,
          profileDays[index],
        ],
      );
    }
  }
  // Keep the already-created local demo aligned with the latest, intentionally
  // small discrepancies. Only rows owned by the dashboard demo are updated;
  // operational counts entered by users are never touched.
  for (const [lot, counted] of [
    ["HU-261004", 416],
    ["TQ-261012", 1788],
    ["PT-2601", 197],
  ] as const) {
    await c.query(
      `UPDATE counts
       SET counted=$2
       WHERE lot_id=$1
         AND reason=$3
         AND created_by='demo-dashboard'`,
      [lot, counted, `Evolución ficticia ${lot} periodo 6`],
    );
  }
  for (const [lot, location, theoretical, counted] of [
    ["HU-261004", "HU-PT-01", 420, 410],
    ["SC-261016", "SC-PT-01", 2400, 2380],
    ["TQ-261012", "TQ-PT-01", 1800, 1775],
  ] as const) {
    const reason = `Apertura histórica ficticia ${lot}`;
    await c.query(
      `INSERT INTO counts(id,lot_id,location_id,theoretical,counted,balance_version,status,reason,created_by,approved_by,created_at)
       SELECT $1,$2,$3,$4,$5,1,'APROBADO',$6,'demo-dashboard','demo-supervisor',CURRENT_DATE-28
       WHERE NOT EXISTS(SELECT 1 FROM counts WHERE reason=$6)`,
      [randomUUID(), lot, location, theoretical, counted, reason],
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
