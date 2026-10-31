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
    .getByRole("heading", {
      name: "Sistema Inteligente de Gestión de Inventarios",
    })
    .waitFor();
  await page.locator('[aria-label="Cervecería Boliviana Nacional"]').waitFor();
  await page.getByRole("alert").waitFor();
  await expect(page.locator(".dashboard-kpis .dashboard-kpi")).toHaveCount(4);
  await expect(
    page.locator(".dashboard-kpis").filter({ hasText: "Exactitud del inventario" }),
  ).toContainText("98,1%");
  await expect(page.locator(".dashboard-trend .trend-series")).toHaveCount(2);
  await expect(page.locator(".chart-legend")).toContainText("Exactitud");
  await expect(page.locator(".chart-legend")).not.toContainText("FEFO");
  await page.getByLabel("Buscar SKU o producto").fill("EN-001");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Limpiar", exact: true }).click();
  await page.getByRole("alert").waitFor();
  await page.getByLabel("Filtrar por almacén").selectOption({ label: "Planta piloto" });
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(
    page.locator(".dashboard-kpis").filter({ hasText: "Exactitud del inventario" }),
  ).toContainText("98,5%");
  await page.getByRole("button", { name: "Limpiar", exact: true }).click();
  await page.getByLabel("Filtrar por almacén").selectOption({ label: "Centro Santa Cruz" });
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(
    page.locator(".dashboard-kpis").filter({ hasText: "SKU que requieren reposición" }),
  ).toContainText("0 de 1");
  await expect(
    page.locator(".dashboard-kpis").filter({ hasText: "Exactitud del inventario" }),
  ).toContainText("99,0%");
  await expect(page.locator(".dashboard-risk-card")).toContainText(
    "0 críticas de 1",
  );
  await expect(
    page.locator(".dashboard-kpis").filter({ hasText: "Disponibilidad ATP" }),
  ).toContainText("77,1%");
  await page.screenshot({
    path: ".local/screenshots/02-dashboard-santa-cruz.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Limpiar", exact: true }).click();
  await page.getByLabel("Filtrar por almacén").selectOption({ label: "Planta Huari" });
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(
    page.locator(".dashboard-kpis").filter({ hasText: "Unidades afectadas" }),
  ).toContainText("6,0%");
  await expect(
    page.locator(".dashboard-kpis").filter({ hasText: "SKU que requieren reposición" }),
  ).toContainText("0 de 1");
  await page.screenshot({
    path: ".local/screenshots/02-dashboard-huari.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Limpiar", exact: true }).click();
  await page.getByLabel("Filtrar por almacén").selectOption({ label: "Planta El Alto" });
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(
    page.locator(".dashboard-kpis").filter({ hasText: "Exactitud del inventario" }),
  ).toContainText("93,1%");
  await page.screenshot({
    path: ".local/screenshots/02-dashboard-el-alto.png",
    fullPage: true,
  });
  const accuracyRow = page.locator(".dashboard-priorities tbody tr").filter({
    hasText: "PAC-0350",
  });
  await accuracyRow.getByRole("button", { name: "Revisar conteo" }).click();
  await expect(page.getByRole("heading", { name: "Conteos y diferencias" })).toBeVisible();
  await expect(page.getByLabel("Filtrar conteos por planta")).toHaveValue("La Paz");
  await expect(page.getByLabel("Filtrar conteos por almacén")).toHaveValue("EL-ALTO");
  await expect(page.locator(".count-table")).toContainText("EA-261001");
  await expect(page.locator(".count-table")).toContainText("-25");
  await page.screenshot({
    path: ".local/screenshots/02-conteos-atencion-el-alto.png",
    fullPage: true,
  });
  await page.locator(".count-table").getByRole("button", { name: "Iniciar reconteo" }).click();
  await expect(page.getByRole("heading", { name: "Registrar reconteo de verificación" })).toBeVisible();
  await expect(page.getByLabel("Lote")).toHaveValue("EA-261001");
  await expect(page.getByLabel("Ubicación")).toHaveValue("EA-PT-01");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Limpiar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Inventario y acciones prioritarias" }),
  ).toBeVisible();
  await expect(page.locator(".dashboard-priorities tbody tr")).toHaveCount(6);
  await expect(
    page.locator(".dashboard-priorities").getByRole("button", { name: "Ver detalle" }).first(),
  ).toBeVisible();
  const affectedRow = page.locator(".dashboard-priorities tbody tr").filter({
    hasText: "72 caja no elegibles",
  });
  await affectedRow.getByRole("button", { name: "Ver detalle" }).click();
  await expect(page.getByText("DETALLE DE LA POSICIÓN SKU–ALMACÉN", { exact: true })).toBeVisible();
  await expect(page.locator(".detail-breakdown")).toContainText("PT-2603");
  await expect(page.locator(".detail-breakdown")).toContainText("CUARENTENA");
  await expect(page.locator(".detail-breakdown")).toContainText("60 caja");
  await expect(page.locator(".detail-breakdown")).toContainText("PT-2604");
  await expect(page.locator(".detail-breakdown")).toContainText("VENCIDO");
  await expect(page.locator(".detail-breakdown footer")).toContainText("72 caja");
  await page.screenshot({
    path: ".local/screenshots/02-dashboard-detalle-no-elegible.png",
    fullPage: true,
  });
  await page.locator(".drawer").getByRole("button").first().click();
  await expect(page.locator(".dashboard-priorities")).toContainText("Resolver cobertura");
  await page.locator(".dashboard-priorities").getByRole("button", { name: "Resolver cobertura" }).click();
  await expect(page.getByText("COBERTURA ATP", { exact: true })).toBeVisible();
  await expect(page.locator(".coverage-options")).toContainText("Traslado entre plantas");
  await expect(page.locator(".coverage-options")).toContainText("Reservas activas");
  await page.screenshot({
    path: ".local/screenshots/02-dashboard-cobertura-atp.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Crear traslado/ }).click();
  await expect(page.getByRole("heading", { name: "Traslado para recuperar cobertura ATP" })).toBeVisible();
  await expect(page.getByLabel("Lote")).toHaveValue("TQ-PAC-COV");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.locator(".dashboard-priorities").getByRole("button", { name: "Resolver cobertura" }).click();
  await page.getByRole("button", { name: "Revisar reservas" }).click();
  await expect(page.getByRole("heading", { name: "Pedidos" })).toBeVisible();
  await expect(page.getByLabel("Filtrar pedidos por planta")).toHaveValue("Santa Cruz");
  await expect(page.getByLabel("Filtrar pedidos por almacén")).toHaveValue("SANTA-CRUZ");
  await expect(page.getByLabel("Filtrar pedidos por artículo")).toHaveValue("PAC-0620");
  await expect(page.getByLabel("Filtrar pedidos por estado")).toHaveValue("RESERVADO");
  await expect(page.locator(".order-filters")).toContainText("550 caja comprometidas");
  await expect(page.locator(".panel tbody tr")).toHaveCount(2);
  await page.screenshot({
    path: ".local/screenshots/02-dashboard-reservas-contextuales.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.screenshot({
    path: ".local/screenshots/02-dashboard.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Ampliar gráfica" }).click();
  await expect(page.locator(".dashboard-trend-card")).toHaveClass(/expanded/);
  await page.getByRole("button", { name: "Restaurar gráfica" }).click();
  await page
    .getByRole("alert")
    .getByRole("button", { name: "Revisar reposición" })
    .click();
  await page.getByRole("heading", { name: "Punto de reorden" }).waitFor();
  await expect(page.getByLabel("Filtrar ROP por planta")).toBeVisible();
  await page.getByLabel("Filtrar ROP por planta").selectOption("Santa Cruz");
  await expect(page.getByLabel("Filtrar ROP por almacén")).toContainText("Centro Santa Cruz");
  await page.screenshot({
    path: ".local/screenshots/02b-reposicion-filtro-santa-cruz.png",
    fullPage: true,
  });
  await page.getByLabel("Filtrar ROP por planta").selectOption("Todas");
  await expect(page.locator(".rop-action-banner")).toContainText(
    "artículos requieren intervención",
  );
  await expect(page.locator(".rop-panel tbody")).not.toContainText("CUBIERTO");
  await page.screenshot({
    path: ".local/screenshots/02b-reposicion.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Preparar solicitud" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("Cantidad mínima sugerida");
  await expect(page.getByRole("dialog").locator('input[name="quantity"]')).not.toHaveValue("");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: /Cubiertos \(/ }).click();
  await expect(page.locator(".rop-panel tbody")).toContainText("CUBIERTO");
  const purchaseGroup = page.locator("nav .nav-item").filter({
    hasText: "Compras y recepción",
  });
  if (!(await purchaseGroup.locator("svg.rotated").count())) await purchaseGroup.click();
  await page.getByRole("button", { name: "Órdenes de compra", exact: true }).click();
  await page.getByRole("heading", { name: "Órdenes de compra", exact: true }).waitFor();
  const receivePurchase = page.getByRole("button", { name: "Recibir", exact: true });
  if (await receivePurchase.count()) {
    await receivePurchase.first().click();
    await expect(page.getByRole("dialog")).toContainText(
      "CUARENTENA",
    );
    await expect(page.getByRole("dialog").locator('input[name="lotId"]')).not.toHaveValue("");
    await page.screenshot({
      path: ".local/screenshots/02c-recepcion-compra.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  }
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  const inventoryGroup = page.locator("nav .nav-item").filter({
    hasText: "Inventario y almacenes",
  });
  if (!(await inventoryGroup.locator("svg.rotated").count())) await inventoryGroup.click();
  await page.getByRole("button", { name: "Existencias", exact: true }).click();
  await page
    .getByRole("heading", { name: "Existencias", exact: true })
    .waitFor();
  await expect(page.getByLabel("Planta o centro operativo")).toHaveValue("Todas");
  await page.screenshot({
    path: ".local/screenshots/03-inventario.png",
    fullPage: true,
  });
  await expect(page.locator("thead")).toContainText("Ubicación / almacén");
  await expect(page.locator("tbody")).toContainText(/Planta|Centro/);
  await expect(page.getByRole("button", { name: "PT-2601", exact: true })).toHaveCount(2);
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
  await expect(page.getByLabel("Planta o centro operativo")).toHaveValue("Todas");
  await expect(page.locator("thead")).toContainText("Documento de origen");
  await expect(page.locator("thead")).toContainText("Versión");
  await expect(page.locator("thead")).not.toContainText("Reservado");
  await expect(page.getByRole("button", { name: "PT-2601", exact: true })).toHaveCount(1);
  await page.screenshot({
    path: ".local/screenshots/03b-lotes.png",
    fullPage: true,
  });
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
