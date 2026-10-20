import { spawn, spawnSync } from "node:child_process";
import { Pool } from "pg";
const dbName = "cbn_test_" + Date.now();
const base =
  process.env.TEST_PG_URL || "postgres://cbn_demo@127.0.0.1:55432/postgres";
const admin = new Pool({ connectionString: base });
await admin.query(`CREATE DATABASE "${dbName}"`);
await admin.end();
const url = new URL(base);
url.pathname = "/" + dbName;
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  PORT: "3101",
  INTEGRATION_MODE: "simulator",
  BASE_URL: "http://127.0.0.1:3101",
};
const seed = spawnSync(process.execPath, ["apps/api/dist/seed.js"], {
  env,
  stdio: "inherit",
  windowsHide: true,
});
if (seed.status !== 0) process.exit(1);
const server = spawn(process.execPath, ["apps/api/dist/main.js"], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let logs = "";
server.stdout.on("data", (d) => (logs += d));
server.stderr.on("data", (d) => (logs += d));
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      ready = (await fetch(env.BASE_URL + "/api/health")).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error("API de pruebas no disponible\n" + logs);
  const result = await new Promise((resolve) => {
    const test = spawn(process.execPath, ["--test", "tests/api.test.mjs"], {
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    test.on("exit", resolve);
  });
  if (result) console.error(logs);
  console.log("Base de evidencia conservada: " + dbName);
  process.exitCode = result || 0;
} finally {
  server.kill();
}
