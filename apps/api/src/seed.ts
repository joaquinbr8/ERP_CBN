import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Db, ROOT } from "./db";
import { hashPassword } from "./auth";
async function seed() {
  const db = new Db();
  try {
    await db.pool.query(
      readFileSync(path.join(ROOT, "database/001_initial.sql"), "utf8"),
    );
    await db.tx(async (c) => {
      if ((await c.query("SELECT 1 FROM users LIMIT 1")).rowCount) {
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
        ["PT-2601", "PT-001", 90, 30, "LIBERADO", "PT-A1", 360],
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
