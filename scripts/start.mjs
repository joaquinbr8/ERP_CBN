import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const run = (script) =>
  execFileSync(process.execPath, [script], {
    stdio: "inherit",
    windowsHide: true,
    cwd: root,
  });
try {
  run("scripts/database.mjs");
  run("apps/api/dist/seed.js");
} catch {
  console.error("No se pudo preparar la demo. Revisa README.md.");
  process.exit(1);
}
const server = spawn(process.execPath, ["apps/api/dist/main.js"], {
  stdio: "inherit",
  windowsHide: true,
  cwd: root,
});
console.log("Abre http://127.0.0.1:3100 · Ctrl+C para detener la aplicación.");
process.on("SIGINT", () => {
  server.kill();
  process.exit();
});
server.on("exit", (code) => (process.exitCode = code || 0));
