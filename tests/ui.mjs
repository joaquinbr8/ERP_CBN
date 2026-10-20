import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
const base = process.env.UI_URL || "http://127.0.0.1:3100";
mkdirSync(".local/screenshots", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base);
  await page.getByRole("heading", { name: "Iniciar sesión" }).waitFor();
  await page.screenshot({
    path: ".local/screenshots/01-acceso.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Entrar al ERP" }).click();
  await page
    .getByRole("heading", { name: "Tu inventario, en perspectiva." })
    .waitFor();
  await page.screenshot({
    path: ".local/screenshots/02-dashboard.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Existencias", exact: true }).click();
  await page
    .getByRole("heading", { name: "Existencias", exact: true })
    .waitFor();
  await page.screenshot({
    path: ".local/screenshots/03-inventario.png",
    fullPage: true,
  });
  await page.getByLabel("Buscar registros").fill("PT-2602");
  await page.getByRole("button", { name: "PT-2602", exact: true }).click();
  await page.locator(".drawer").waitFor();
  assert.match(
    await page.locator(".drawer").innerText(),
    /Historial de movimientos/,
  );
  await page.screenshot({
    path: ".local/screenshots/04-lote.png",
    fullPage: true,
  });
  await page.locator(".drawer .close").click();
  await page
    .getByRole("button", { name: "Registrar recepción", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  assert.equal(
    await page.getByRole("dialog").locator("input,select").count(),
    7,
  );
  await page.screenshot({
    path: ".local/screenshots/05-recepcion.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Lotes", exact: true }).click();
  await page
    .getByRole("heading", { name: "Maestro operativo de lotes", exact: true })
    .waitFor();
  await expect(page.locator("thead")).toContainText("Documento de origen");
  await expect(page.locator("thead")).toContainText("Versión");
  await expect(page.locator("thead")).not.toContainText("Reservado");
  const groups = [
    "Administración",
    "Datos maestros",
    "Compras y recepción",
    "Inventario y almacenes",
    "Producción",
    "Calidad",
    "Pedidos y despachos",
    "Trazabilidad",
    "Reportes",
    "Integraciones",
  ];
  let screens = 0;
  for (const name of groups) {
    const g = page.locator("nav .nav-item").filter({ hasText: name });
    if (!(await g.locator("svg.rotated").count())) await g.click();
    const subs = await page.locator("nav .subnav").all();
    for (const sub of subs) {
      const label = (await sub.innerText()).trim();
      await sub.click();
      await page
        .getByRole("heading", { name: label, exact: true })
        .first()
        .waitFor();
      screens++;
    }
  }
  await page.getByRole("button", { name: "Mensajería", exact: true }).click();
  await page.screenshot({
    path: ".local/screenshots/06-integraciones.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const sidebarHidden = () =>
    page
      .locator(".sidebar")
      .evaluate((el) => el.getBoundingClientRect().right <= 0);
  await expect.poll(sidebarHidden).toBe(true);
  await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
  await expect(page.locator(".sidebar")).toHaveClass(/visible/);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect.poll(sidebarHidden).toBe(true);
  await page.screenshot({
    path: ".local/screenshots/07-movil.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    "Desbordamiento horizontal de página móvil",
  );
  assert.deepEqual(errors, []);
  console.log(
    `UI OK: acceso, ${screens} pantallas, filtro, lote, formulario, móvil; sin errores JavaScript.`,
  );
} finally {
  await browser.close();
}
