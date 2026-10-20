import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
const root = process.cwd();
const data = path.join(root, ".local", "pgdata");
const bin =
  process.env.PG_BIN ||
  path.join(process.env.USERPROFILE, "scoop/apps/postgresql/current/bin");
const run = (exe, args) =>
  execFileSync(path.join(bin, exe + ".exe"), args, {
    stdio: "inherit",
    windowsHide: true,
  });
mkdirSync(path.join(root, ".local"), { recursive: true });
if (!existsSync(path.join(data, "PG_VERSION")))
  run("initdb", [
    "-D",
    data,
    "-U",
    "cbn_demo",
    "-A",
    "trust",
    "--encoding=UTF8",
    "--locale=C",
  ]);
const status = spawnSync(path.join(bin, "pg_isready.exe"), ["-h", "127.0.0.1", "-p", "55432"], {
  windowsHide: true,
  stdio: "ignore",
});
if (status.status !== 0)
  run("pg_ctl", [
    "start",
    "-D",
    data,
    "-l",
    path.join(root, ".local", "postgres.log"),
    "-o",
    "-p 55432 -h 127.0.0.1",
    "-w",
  ]);
const actualDirectory=execFileSync(path.join(bin,"psql.exe"),["-h","127.0.0.1","-p","55432","-U","cbn_demo","-d","postgres","-tAc","SHOW data_directory"],{windowsHide:true,encoding:"utf8"}).trim();
if(path.resolve(actualDirectory).toLowerCase()!==path.resolve(data).toLowerCase())throw new Error("El puerto 55432 pertenece a otra instalación de PostgreSQL. No se modificó esa base.");
const check = execFileSync(
  path.join(bin, "psql.exe"),
  [
    "-h",
    "127.0.0.1",
    "-p",
    "55432",
    "-U",
    "cbn_demo",
    "-d",
    "postgres",
    "-tAc",
    "SELECT 1 FROM pg_database WHERE datname='cbn_erp'",
  ],
  { windowsHide: true, encoding: "utf8" },
);
if (!check.trim())
  run("createdb", [
    "-h",
    "127.0.0.1",
    "-p",
    "55432",
    "-U",
    "cbn_demo",
    "cbn_erp",
  ]);
console.log(
  "PostgreSQL exclusivo de demo: 127.0.0.1:55432/cbn_erp. Acceso trust solo loopback; no usar en producción.",
);
