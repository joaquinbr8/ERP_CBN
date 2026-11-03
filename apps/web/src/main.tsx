import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Boxes,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Database,
  Download,
  Factory,
  Filter,
  Layers3,
  LayoutDashboard,
  LogOut,
  Maximize2,
  Menu,
  Minimize2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
  Users,
  Warehouse,
  X,
  Zap,
} from "lucide-react";
import "./style.css";
type Row = Record<string, any>;
type Field = {
  key: string;
  label: string;
  type?: string;
  options?: { value: string; label: string }[];
  value?: any;
  optional?: boolean;
  hint?: string;
  min?: number;
  max?: number;
};
type Dialog = {
  action: string;
  title: string;
  description: string;
  fields: Field[];
  initial?: Row;
  source?: string;
  insights?: { label: string; value: string; note?: string; tone?: string }[];
  warning?: string;
  blocked?: boolean;
};
type DashboardFilters = {
  start: string;
  end: string;
  plant: string;
  warehouse: string;
  category: string;
  sku: string;
};
const isoDay = (value: Date) => value.toISOString().slice(0, 10);
const initialDashboardFilters = (): DashboardFilters => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 27);
  return {
    start: isoDay(start),
    end: isoDay(end),
    plant: "Todas",
    warehouse: "Todos",
    category: "Todas",
    sku: "",
  };
};
const number = (value: any) => Number(value || 0);
const percent = (value: number, digits = 1) =>
  value.toLocaleString("es-BO", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }) + "%";
const shortDay = (value: Date) =>
  value.toLocaleDateString("es-BO", { day: "2-digit", month: "short" });
function CbnBrand({ product = "" }: { product?: string }) {
  return (
    <div className="cbn-brand-lockup" aria-label="Cervecería Boliviana Nacional">
      <span className="cbn-wordmark">CBN</span>
      <i />
      <span className="cbn-company">
        Cervecería
        <br />
        Boliviana
        <br />
        Nacional
      </span>
      {product && <b>{product}</b>}
    </div>
  );
}
const icons: any = {
  Dashboard: LayoutDashboard,
  Administración: ShieldCheck,
  "Datos maestros": Database,
  "Compras y recepción": ShoppingCart,
  "Inventario y almacenes": Boxes,
  Producción: Factory,
  Calidad: ClipboardCheck,
  "Pedidos y despachos": Truck,
  Trazabilidad: Layers3,
  Reportes: BarChart3,
  Integraciones: Zap,
};
const sections: Record<string, string[]> = {
  Dashboard: [],
  Administración: ["Usuarios", "Roles y permisos", "Almacenes", "Auditoría"],
  "Datos maestros": [
    "Artículos",
    "Proveedores",
    "Ubicaciones",
    "Políticas FIFO/FEFO",
  ],
  "Compras y recepción": [
    "Solicitudes de compra",
    "Órdenes de compra",
    "Stock en tránsito",
    "Punto de reorden",
  ],
  "Inventario y almacenes": [
    "Existencias",
    "Lotes",
    "Reservas",
    "Movimientos",
    "Traslados",
    "Conteos y diferencias",
    "Mermas y ajustes",
  ],
  Producción: ["Órdenes de producción"],
  Calidad: ["Lotes pendientes", "Historial de decisiones"],
  "Pedidos y despachos": [
    "Pedidos",
    "Preparación FIFO/FEFO",
    "Salidas y entregas",
  ],
  Trazabilidad: ["Consulta por lote"],
  Reportes: ["Indicadores"],
  Integraciones: ["Mensajería", "Conciliación"],
};
const fmt = (v: any) =>
  Number(v || 0).toLocaleString("es-BO", { maximumFractionDigits: 3 });
const date = (v: any) => {
  if (!v) return "—";
  const source = String(v);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(source)
    ? new Date(source + "T12:00:00")
    : new Date(source);
  return parsed.toLocaleDateString("es-BO");
};
const points = (value: number) =>
  `${value > 0 ? "+" : ""}${value.toLocaleString("es-BO", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} pp`;
const statusLabel = (s: any) => String(s || "—").replaceAll("_", " ");
function Badge({ value }: { value: any }) {
  const s = String(value || "");
  return (
    <span
      className={
        "badge " +
        (/LIBERADO|APROBADO|RECIBID|ENVIADO|APLICADO|ENTREGADO|CERRADA|CONSUMIDA/.test(
          s,
        )
          ? "green"
          : /BLOQUEADO|RECHAZADO|REVISION|MERMA/.test(s)
            ? "red"
            : /PENDIENTE|CUARENTENA|TRANSITO|PARCIAL|BORRADOR/.test(s)
              ? "amber"
              : "blue")
      }
    >
      {statusLabel(s)}
    </span>
  );
}
async function api(path: string, token: string, body?: any) {
  const r = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const v = await r.json();
  if (!r.ok) throw new Error(v.message || "No se pudo completar la solicitud");
  return v;
}
function App() {
  const [token, setToken] = useState(sessionStorage.getItem("cbn-token") || "");
  const [snapshot, setData] = useState<Row | null>(null);
  const data: Row = snapshot || {};
  const [page, setPage] = useState("Dashboard");
  const [open, setOpen] = useState("Inventario y almacenes");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const [plantFilter, setPlantFilter] = useState("Todas");
  const [wh, setWh] = useState("Todos");
  const [quality, setQuality] = useState("Todos");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [coverage, setCoverage] = useState<Row | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [lastEvent, setLastEvent] = useState<Row | null>(null);
  const [dashboardDraft, setDashboardDraft] = useState<DashboardFilters>(() =>
    initialDashboardFilters(),
  );
  const [dashboardFilters, setDashboardFilters] = useState<DashboardFilters>(
    () => initialDashboardFilters(),
  );
  const [dismissedAlert, setDismissedAlert] = useState("");
  const [expandedPanel, setExpandedPanel] = useState("");
  const [replenishmentView, setReplenishmentView] = useState("attention");
  const [countPlant, setCountPlant] = useState("Todas");
  const [countWarehouse, setCountWarehouse] = useState("Todos");
  const [countStatus, setCountStatus] = useState("Todos");
  const [countView, setCountView] = useState("attention");
  const [orderPlant, setOrderPlant] = useState("Todas");
  const [orderWarehouse, setOrderWarehouse] = useState("Todos");
  const [orderArticle, setOrderArticle] = useState("Todos");
  const [orderStatus, setOrderStatus] = useState("Todos");
  const [ropPlant, setRopPlant] = useState("Todas");
  const [ropWarehouse, setRopWarehouse] = useState("Todos");
  const [ropArticle, setRopArticle] = useState("Todos");
  const can = (p: string) =>
    data?.user?.permissions.includes("*") ||
    data?.user?.permissions.includes(p);
  async function refresh() {
    if (!token) return;
    try {
      setData(await api("state", token));
    } catch (e) {
      setNotice({ text: (e as Error).message, error: true });
    }
  }
  useEffect(() => {
    void refresh();
  }, [token]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);
  function navigate(p: string) {
    setPage(p);
    setQuery("");
    setCategory("Todas");
    setPlantFilter("Todas");
    setWh("Todos");
    setQuality(p === "Lotes pendientes" ? "CUARENTENA" : "Todos");
    setCountPlant("Todas");
    setCountWarehouse("Todos");
    setCountStatus("Todos");
    setCountView("attention");
    setOrderPlant("Todas");
    setOrderWarehouse("Todos");
    setOrderArticle("Todos");
    setOrderStatus("Todos");
    setRopPlant("Todas");
    setRopWarehouse("Todos");
    setRopArticle("Todos");
    if (p === "Punto de reorden" || p === "Indicadores")
      setReplenishmentView("attention");
    setMobile(false);
  }
  async function send(
    action: string,
    values: Row,
    source = "ERP_WEB",
    eventId = crypto.randomUUID(),
  ) {
    setBusy(true);
    const body = { action, data: values, source, eventId };
    try {
      const r = await api("commands", token, body);
      setLastEvent(body);
      setDialog(null);
      setNotice({
        text: r.duplicate
          ? "Solicitud repetida detectada (" +
            r.deduplication +
            "). El stock no se volvió a modificar."
          : r.message,
      });
      await refresh();
      return r;
    } catch (e) {
      setNotice({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }
  const options = (name: string, label = "name") =>
    (data?.[name] || []).map((r: Row) => {
      const warehouse =
        name === "locations"
          ? (data.warehouses || []).find(
              (item: Row) => item.id === r.warehouse_id,
            )
          : null;
      const description =
        name === "locations"
          ? `${r.name} — ${warehouse?.name || r.warehouse_id}${warehouse?.center ? ` / ${warehouse.center}` : ""}`
          : name === "warehouses" && r.center
            ? `${r[label] || r.id} — ${r.center}`
            : r[label] || r.id;
      return { value: r.id, label: `${r.id} · ${description}` };
    });
  const field = (
    key: string,
    label: string,
    type = "text",
    value?: any,
  ): Field => ({ key, label, type, value });
  const select = (key: string, label: string, collection: string): Field => ({
    key,
    label,
    type: "select",
    options: options(collection),
  });
  const list = (key: string, label: string, values: string[]): Field => ({
    key,
    label,
    type: "select",
    options: values.map((v) => ({ value: v, label: v })),
  });
  const reference = (prefix: string) =>
    prefix + "-" + Date.now().toString().slice(-8);
  function show(
    action: string,
    title: string,
    fields: Field[],
    initial: Row = {},
    description = "La operación se valida y registra en una transacción. Repetir la misma referencia no duplica el efecto.",
    source = "ERP_WEB",
    insights?: Dialog["insights"],
    warning?: string,
    blocked = false,
  ) {
    setDialog({
      action,
      title,
      fields,
      initial,
      description,
      source,
      insights,
      warning,
      blocked,
    });
  }
  function suggestedLotId(articleId: string) {
    const day = isoDay(new Date()).replaceAll("-", "");
    const base = `${articleId}-${day}`;
    const existing = new Set((data.lots || []).map((lot: Row) => lot.id));
    let sequence = 1;
    let candidate = `${base}-${String(sequence).padStart(2, "0")}`;
    while (existing.has(candidate)) {
      sequence += 1;
      candidate = `${base}-${String(sequence).padStart(2, "0")}`;
    }
    return candidate;
  }
  function prepareReplenishmentRequest(row: Row) {
    const articleId = row.articleId || row.article_id || row.id;
    const warehouseName = row.warehouseName || warehouseById.get(row.warehouse_id)?.name;
    show(
      "request.create",
      "Solicitud de compra sugerida",
      [
        field("id", "Solicitud", "text", reference("SC")),
        { ...select("articleId", "Artículo", "articles"), value: articleId },
        {
          ...field("quantity", "Cantidad mínima sugerida", "number", row.gap),
          min: 0.001,
          hint: "Brecha actual para recuperar el ROP. Compras puede ajustarla por empaque, EOQ o condiciones del proveedor.",
        },
        field(
          "reason",
          "Necesidad / justificación",
          "text",
          `Reposición para ${warehouseName || "el alcance seleccionado"} por brecha ROP: posición ${fmt(row.position)}, ROP ${fmt(row.rop)}, brecha ${fmt(row.gap)}.`,
        ),
      ],
      {},
      `La brecha mínima actual de ${row.name} en ${warehouseName || "el alcance seleccionado"} es ${fmt(row.gap)} ${row.unit}. Esta cantidad recupera el umbral ROP; no reemplaza la decisión de lote económico ni las restricciones de compra.`,
    );
  }
  function openRopForRow(row: Row) {
    const warehouse = warehouseById.get(row.warehouse_id);
    navigate("Punto de reorden");
    setRopPlant(warehouse?.center || "Todas");
    setRopWarehouse(row.warehouse_id || "Todos");
    setRopArticle(row.article_id || row.articleId || row.id || "Todos");
    setReplenishmentView("attention");
  }
  function create(kind: string) {
    switch (kind) {
      case "article":
        show("article.create", "Nuevo artículo", [
          field("id", "Código", "text", reference("ART")),
          field("name", "Nombre del artículo"),
          list("category", "Categoría", [
            "Producto terminado",
            "Materia prima",
            "Envases",
            "Repuestos",
          ]),
          field("unit", "Unidad base", "text", "unidad"),
          list("policy", "Rotación", ["FEFO", "FIFO"]),
          list("abc", "Clasificación ABC", ["A", "B", "C"]),
          field("dailyDemand", "Demanda diaria", "number", 0),
          field("leadDays", "Plazo de reposición (días)", "number", 0),
          field("safetyStock", "Stock de seguridad", "number", 0),
        ]);
        break;
      case "supplier":
        show("supplier.create", "Nuevo proveedor", [
          field("id", "Código", "text", reference("PROV")),
          field("name", "Razón social"),
          field("contact", "Contacto"),
        ]);
        break;
      case "warehouse":
        show("warehouse.create", "Nuevo almacén", [
          field("id", "Código", "text", reference("ALM")),
          field("name", "Nombre"),
        ]);
        break;
      case "location":
        show("location.create", "Nueva ubicación", [
          field("id", "Código", "text", reference("UB")),
          field("name", "Nombre"),
          select("warehouseId", "Almacén", "warehouses"),
        ]);
        break;
      case "user":
        show("user.create", "Crear usuario", [
          field("id", "Nombre de usuario"),
          field("name", "Nombre visible"),
          select("roleId", "Rol", "roles"),
          field("password", "Contraseña (mínimo 10 caracteres)", "password"),
        ]);
        break;
      case "role":
        show(
          "role.create",
          "Crear rol",
          [
            field("id", "Código del rol"),
            field("name", "Nombre"),
            field(
              "permissions",
              "Permisos separados por coma",
              "text",
              "inventario,reportes",
            ),
          ],
          {},
          "Permisos: maestros, admin, compras, inventario, calidad, despacho, produccion, aprobar_ajustes, integraciones, reportes.",
        );
        break;
      case "request":
        show("request.create", "Solicitud de compra", [
          field("id", "Solicitud", "text", reference("SC")),
          select("articleId", "Artículo", "articles"),
          field("quantity", "Cantidad solicitada", "number"),
          field("reason", "Necesidad / justificación"),
        ]);
        break;
      case "purchase":
        show("purchase.create", "Nueva orden de compra", [
          field("id", "Orden", "text", reference("OC")),
          select("supplierId", "Proveedor", "suppliers"),
          select("articleId", "Artículo", "articles"),
          field("quantity", "Cantidad", "number"),
        ]);
        break;
      case "receipt":
        show(
          "receipt.create",
          "Registrar recepción",
          [
            field("id", "Remito o referencia", "text", reference("REC")),
            select("articleId", "Artículo", "articles"),
            field("lotId", "Nuevo lote"),
            select("locationId", "Ubicación", "locations"),
            field("quantity", "Cantidad", "number"),
            { ...field("expiry", "Vencimiento", "date"), optional: true },
            field("reason", "Motivo / documento de origen"),
          ],
          {},
          "Ingresa existencia física en CUARENTENA. Calidad debe liberar el lote antes de reservarlo.",
        );
        break;
      case "order":
        show("order.create", "Nuevo pedido", [
          field("id", "Pedido", "text", reference("PED")),
          field("customer", "Cliente"),
          select("articleId", "Artículo", "articles"),
          select("warehouseId", "Almacén de preparación", "warehouses"),
          field("quantity", "Cantidad", "number"),
          list("paymentType", "Tipo de pago (solo referencia)", [
            "Transferencia",
            "QR",
            "Efectivo",
            "Crédito externo",
          ]),
        ]);
        break;
      case "transfer":
        show(
          "transfer.create",
          "Crear traslado",
          [
            field("id", "Referencia", "text", reference("TR")),
            select("lotId", "Lote", "lots"),
            select("fromLocation", "Origen", "locations"),
            select("toLocation", "Destino", "locations"),
            field("quantity", "Cantidad", "number"),
          ],
          {},
          "La salida pasa a tránsito interno. Solo la recepción incrementa el saldo del destino.",
        );
        break;
      case "count":
        show(
          "count.create",
          "Registrar conteo físico",
          [
            field("id", "Identificador", "text", crypto.randomUUID()),
            select("lotId", "Lote", "lots"),
            select("locationId", "Ubicación", "locations"),
            field("quantity", "Cantidad contada", "number"),
            field("reason", "Observación"),
          ],
          {},
          "Se guarda el saldo y su versión. No ajusta existencias hasta que otro usuario autorizado lo apruebe.",
        );
        break;
      case "merma":
        show(
          "merma.create",
          "Registrar merma",
          [
            field("id", "Referencia", "text", reference("MER")),
            select("lotId", "Lote", "lots"),
            select("locationId", "Ubicación", "locations"),
            field("quantity", "Cantidad perdida", "number"),
            field("reason", "Causa de merma"),
          ],
          {},
          "Descuenta una pérdida real identificada. No se permite consumir cantidades reservadas.",
        );
        break;
      case "production":
        show(
          "production.create",
          "Orden de producción",
          [
            field("id", "Orden", "text", reference("OP")),
            select("inputArticle", "Material de entrada", "articles"),
            field(
              "quantity",
              "Consumo planificado (unidad del material)",
              "number",
            ),
            select("outputArticle", "Producto de salida", "articles"),
            select(
              "warehouseId",
              "Almacén que abastecerá el material",
              "warehouses",
            ),
          ],
          {},
          "Prototipo: una materia prima por orden. La reserva solo utiliza ATP elegible del almacén seleccionado; no toma stock automáticamente de otras plantas.",
        );
        break;
    }
  }
  function action(name: string, row: Row) {
    const initial = { id: row.id, version: row.version };
    switch (name) {
      case "convert":
        show(
          "request.convert",
          "Convertir solicitud en orden",
          [
            field("purchaseId", "Orden de compra", "text", reference("OC")),
            select("supplierId", "Proveedor", "suppliers"),
          ],
          initial,
        );
        break;
      case "promise":
        show(
          "order.promise",
          "Estimar promesa de entrega",
          [
            field(
              "preparationDays",
              "Preparación / espera hasta despacho (días)",
              "number",
              1,
            ),
            field("transitDays", "Tránsito estimado (días)", "number", 1),
          ],
          initial,
          "Primero valida ATP: stock elegible, reservas y seguridad. Plazos declarados para el piloto; no calcula rutas ni ventanas del cliente. Cada recálculo incrementa promiseVersion.",
        );
        break;
      case "user":
        show(
          "user.update",
          "Rol y acceso del usuario",
          [
            { ...select("roleId", "Rol", "roles"), value: row.role_id },
            {
              key: "active",
              label: "Acceso",
              type: "select",
              value: String(row.active),
              options: [
                { value: "true", label: "Habilitado" },
                { value: "false", label: "Deshabilitado" },
              ],
            },
          ],
          { id: row.username, version: row.version },
        );
        break;
      case "receive":
        {
        const article = (data.articles || []).find(
          (item: Row) => item.id === row.data.articleId,
        );
        const planning = (data.planning || []).find(
          (item: Row) => item.id === row.data.articleId,
        );
        const pending = Math.max(
          0,
          number(row.data.quantity) - number(row.data.received),
        );
        const currentAtp = number(planning?.available);
        const otherIncoming = Math.max(0, number(planning?.incoming) - pending);
        const minimumEligible = Math.max(
          0,
          number(planning?.rop) - currentAtp - otherIncoming,
        );
        show(
          "purchase.receive",
          "Recepción de compra",
          [
            field(
              "receiptRef",
              "Referencia de recepción",
              "text",
              reference("REC"),
            ),
            {
              ...field(
                "lotId",
                "Lote recibido (nuevo y único)",
                "text",
                suggestedLotId(row.data.articleId),
              ),
              hint: "Usa el lote impreso por el proveedor. No se suma a un lote anterior porque debe conservar su propia trazabilidad.",
            },
            select("locationId", "Ubicación", "locations"),
            {
              ...field("quantity", "Cantidad realmente recibida", "number", pending),
              min: 0.001,
              max: pending,
              hint: `Pendiente en la orden: ${fmt(pending)} ${article?.unit || "u."}. Se permiten entregas parciales; nunca registres más de lo que llegó físicamente.`,
            },
            {
              ...field("expiry", "Vencimiento del nuevo lote", "date"),
              optional: article?.policy !== "FEFO",
              hint:
                article?.policy === "FEFO"
                  ? "Obligatorio para aplicar primero vence, primero sale."
                  : "Opcional para artículos FIFO sin vencimiento.",
            },
          ],
          initial,
          `Orden ${row.id} · ${article?.name || row.data.articleId}. Registra la entrega real del proveedor; la recepción reduce el tránsito pendiente.`,
          "ERP_WEB",
          [
            { label: "ATP actual", value: `${fmt(currentAtp)} ${article?.unit || ""}` },
            { label: "ROP", value: `${fmt(planning?.rop)} ${article?.unit || ""}` },
            {
              label: "Mínimo a liberar",
              value: `${fmt(minimumEligible)} ${article?.unit || ""}`,
              note: "Para recuperar el ROP con la fotografía actual",
              tone: minimumEligible > 0 ? "warning" : "good",
            },
            { label: "Pendiente de la orden", value: `${fmt(pending)} ${article?.unit || ""}` },
          ],
          "La recepción crea existencia física en CUARENTENA: su ATP seguirá en 0 hasta que Calidad libere el nuevo lote. Después de liberarlo, el ATP y el diagnóstico ROP se recalculan automáticamente.",
        );
        }
        break;
      case "quality":
        show(
          "quality.set",
          "Decisión del equipo de Calidad",
          [
            list("quality", "Decisión", [
              "LIBERADO",
              "BLOQUEADO",
              "RECHAZADO",
              "CUARENTENA",
            ]),
            field("reason", "Justificación"),
          ],
          { id: row.lot_id || row.id, version: row.lot_version || row.version },
          "Cambia la elegibilidad, no la cantidad física. Un lote bloqueado no puede despacharse aunque tenga reservas.",
        );
        break;
      case "recount":
        show(
          "count.create",
          "Registrar reconteo de verificación",
          [
            field("id", "Identificador", "text", crypto.randomUUID()),
            { ...select("lotId", "Lote", "lots"), value: row.lot_id },
            {
              ...select("locationId", "Ubicación", "locations"),
              value: row.location_id,
            },
            field("quantity", "Cantidad contada nuevamente", "number"),
            field(
              "reason",
              "Observación",
              "text",
              `Reconteo de control por diferencia de ${fmt(Math.abs(number(row.counted) - number(row.theoretical)))}`,
            ),
          ],
          {},
          "El reconteo debe realizarlo una persona distinta cuando sea posible. Se registra como PENDIENTE y otro usuario autorizado decide si aprueba el ajuste.",
        );
        break;
      case "policy":
        show(
          "article.policy",
          "Política y reposición",
          [
            {
              ...list("policy", "Rotación", ["FIFO", "FEFO"]),
              value: row.policy,
            },
            field("dailyDemand", "Demanda diaria", "number", row.daily_demand),
            field("leadDays", "Plazo (días)", "number", row.lead_days),
            field(
              "safetyStock",
              "Stock de seguridad",
              "number",
              row.safety_stock,
            ),
          ],
          initial,
          "Punto de reorden = demanda diaria × plazo + stock de seguridad. La política no reordena reservas ya confirmadas.",
        );
        break;
      case "deliver":
        show(
          "order.deliver",
          "Confirmar entrega",
          [field("evidence", "Evidencia / referencia ePOD")],
          initial,
          "No vuelve a descontar inventario. La salida física ya se registró al despachar.",
        );
        break;
      case "return":
        show(
          "order.return",
          "Registrar devolución",
          [
            field("lotId", "Nuevo lote de retorno"),
            select("locationId", "Ubicación", "locations"),
            field("quantity", "Cantidad devuelta", "number"),
            { ...field("expiry", "Vencimiento", "date"), optional: true },
            field("reason", "Motivo"),
          ],
          initial,
          "Una devolución por pedido en este piloto. Regresa en cuarentena y requiere nueva revisión de Calidad.",
        );
        break;
      case "production.reserve": {
        const warehouse = (data.warehouses || []).find(
          (item: Row) => item.id === row.data.warehouseId,
        );
        const article = (data.articles || []).find(
          (item: Row) => item.id === row.data.inputArticle,
        );
        const requiredQuantity = number(row.data.inputQuantity);
        const localAtp = (data.inventory || [])
          .filter(
            (item: Row) =>
              item.article_id === row.data.inputArticle &&
              item.warehouse_id === row.data.warehouseId,
          )
          .reduce(
            (total: number, item: Row) => total + number(item.available),
            0,
          );
        const alternatives = (data.warehouses || [])
          .map((candidate: Row) => ({
            ...candidate,
            atp: (data.inventory || [])
              .filter(
                (item: Row) =>
                  item.article_id === row.data.inputArticle &&
                  item.warehouse_id === candidate.id,
              )
              .reduce(
                (total: number, item: Row) => total + number(item.available),
                0,
              ),
          }))
          .filter(
            (candidate: Row) =>
              candidate.id !== row.data.warehouseId && candidate.atp > 0,
          )
          .sort((a: Row, b: Row) => b.atp - a.atp);
        show(
          "production.reserve",
          "Reservar material para producción",
          [],
          initial,
          `Orden ${row.id} · ${article?.name || row.data.inputArticle}. La reserva se realizará únicamente en ${warehouse?.name || row.data.warehouseId}.`,
          "ERP_WEB",
          [
            {
              label: "Material requerido",
              value: `${fmt(requiredQuantity)} ${article?.unit || ""}`,
            },
            {
              label: "ATP en el almacén",
              value: `${fmt(localAtp)} ${article?.unit || ""}`,
              tone: localAtp >= requiredQuantity ? "good" : "warning",
            },
            {
              label: "Almacén seleccionado",
              value: warehouse?.name || row.data.warehouseId,
              note: warehouse?.center || row.data.warehouseId,
            },
            {
              label: "Faltante",
              value: `${fmt(Math.max(0, requiredQuantity - localAtp))} ${article?.unit || ""}`,
              tone: localAtp >= requiredQuantity ? "good" : "warning",
            },
          ],
          localAtp >= requiredQuantity
            ? `Hay ATP suficiente. El sistema asignará lotes ${article?.policy || "FIFO/FEFO"} del almacén seleccionado y aumentará su cantidad reservada; el físico se descuenta al registrar el resultado de producción.`
            : `ATP local insuficiente. Stock elegible en otros almacenes: ${alternatives.length ? alternatives.map((item: Row) => `${item.name}: ${fmt(item.atp)}`).join("; ") : "ninguno"}. Crea y recibe un traslado hacia ${warehouse?.name || row.data.warehouseId}, o planifica una nueva orden en un almacén que sí tenga ATP.`,
          localAtp < requiredQuantity,
        );
        break;
      }
      case "finish":
        show(
          "production.finish",
          "Conciliar resultado y cerrar",
          [
            field("lotId", "Lote producido"),
            select("locationId", "Ubicación de salida", "locations"),
            field(
              "quantity",
              "Cantidad obtenida neta (unidad del producto)",
              "number",
            ),
            field("loss", "Merma del producto (0 si no existe)", "number", 0),
            { ...field("expiry", "Vencimiento", "date"), optional: true },
            {
              ...field("reason", "Causa de merma (obligatoria si mayor a 0)"),
              optional: true,
            },
          ],
          initial,
          "Consume las reservas y registra producción en cuarentena en una sola transacción. No registra merma si su cantidad es cero.",
        );
        break;
      default:
        show(
          name,
          "Confirmar operación",
          [],
          initial,
          "Confirma " +
            name +
            " para " +
            row.id +
            ". Se verifica el estado y la versión antes de aplicarla.",
        );
    }
  }
  function download(rows: Row[], filename: string) {
    if (!rows.length) {
      setNotice({ text: "No hay datos para exportar" });
      return;
    }
    const cols = Object.keys(rows[0]);
    const clean = (v: any) =>
      '"' +
      String(typeof v === "object" ? JSON.stringify(v) : (v ?? ""))
        .replaceAll('"', '""')
        .replace(/^[=+@-]/, "'") +
      '"';
    const blob = new Blob(
      [
        "\uFEFF" +
          [
            cols.map(clean).join(";"),
            ...rows.map((r) => cols.map((k) => clean(r[k])).join(";")),
          ].join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!token)
    return (
      <Login
        onLogin={(v) => {
          sessionStorage.setItem("cbn-token", v);
          setToken(v);
        }}
      />
    );
  if (!snapshot)
    return (
      <div className="loading">
        <Boxes size={36} />
        <h2>Preparando tu espacio de trabajo</h2>
        <p>{notice?.text || "Conectando al ERP CBN…"}</p>
        <button
          onClick={() => {
            sessionStorage.removeItem("cbn-token");
            setToken("");
          }}
        >
          Volver al acceso
        </button>
      </div>
    );
  const group =
    Object.keys(sections).find(
      (k) => k === page || sections[k].includes(page),
    ) || "Dashboard";
  const inv: Row[] = data.inventory || [];
  const warehouseMatchesPlant = (warehouseId: string) => {
    if (plantFilter === "Todas") return true;
    return warehouseId === plantFilter;
  };
  const filtered = inv.filter(
    (r) =>
      warehouseMatchesPlant(r.warehouse_id) &&
      (wh === "Todos" || r.warehouse_id === wh) &&
      (quality === "Todos" || r.quality === quality) &&
      (category === "Todas" || r.category === category) &&
      JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
  );
  const lotRows: Row[] = (data.lots || []).map((lot: Row) => {
    const positions = inv.filter((r) => r.lot_id === lot.id);
    const article = data.articles.find((a: Row) => a.id === lot.article_id);
    const origin = [...data.movements]
      .filter((m: Row) => m.lot_id === lot.id && Number(m.quantity) > 0)
      .sort(
        (a: Row, b: Row) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      )[0];
    const unique = (key: string) => [
      ...new Set(positions.map((r: Row) => r[key]).filter(Boolean)),
    ];
    const sum = (key: string) =>
      positions.reduce((total: number, r: Row) => total + Number(r[key]), 0);
    const positionDescriptions = positions.map((position: Row) => {
      const location = (data.locations || []).find(
        (item: Row) => item.id === position.location_id,
      );
      const warehouse = (data.warehouses || []).find(
        (item: Row) => item.id === position.warehouse_id,
      );
      return {
        id: position.location_id,
        location: location?.name || position.location_id,
        warehouse: warehouse?.name || position.warehouse_id,
        center: warehouse?.center || "",
      };
    });
    return {
      ...lot,
      lot_id: lot.id,
      article: article?.name || lot.article_id,
      category: article?.category,
      unit: article?.unit,
      policy: article?.policy,
      physical: sum("physical"),
      reserved: sum("reserved"),
      available: sum("available"),
      blocked: sum("blocked"),
      locations: unique("location_id").join(", ") || "Sin existencia",
      location_descriptions: positionDescriptions,
      warehouses: unique("warehouse_id"),
      position_count: positions.length,
      origin: origin?.document_id || origin?.type || "Sin referencia",
      origin_type: origin?.type || "—",
      lot_version: lot.version,
    };
  });
  const filteredLots = lotRows.filter(
    (r) =>
      r.warehouses.some((warehouseId: string) =>
        warehouseMatchesPlant(warehouseId),
      ) &&
      (wh === "Todos" || r.warehouses.includes(wh)) &&
      (quality === "Todos" || r.quality === quality) &&
      (category === "Todas" || r.category === category) &&
      JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
  );
  const low = data.planning.filter(
    (a: Row) => Number(a.available) + Number(a.incoming) <= Number(a.rop),
  );
  const held = inv.filter((r) => Number(r.blocked) > 0);
  const warehouseById = new Map<string, Row>(
    (data.warehouses || []).map(
      (warehouse: Row) => [warehouse.id, warehouse] as [string, Row],
    ),
  );
  const locationById = new Map<string, Row>(
    (data.locations || []).map(
      (location: Row) => [location.id, location] as [string, Row],
    ),
  );
  const lotById = new Map<string, Row>(
    (data.lots || []).map((lot: Row) => [lot.id, lot] as [string, Row]),
  );
  const articleById = new Map<string, Row>(
    (data.articles || []).map(
      (article: Row) => [article.id, article] as [string, Row],
    ),
  );
  const documentById = new Map<string, Row>(
    (data.documents || []).map(
      (document: Row) => [document.id, document] as [string, Row],
    ),
  );
  const dashboardPlants = [
    ...new Set(
      (data.warehouses || [])
        .map((warehouse: Row) => warehouse.center)
        .filter(Boolean),
    ),
  ] as string[];
  const dashboardDraftWarehouseIds = new Set(
    (data.warehouses || [])
      .filter(
        (warehouse: Row) =>
          (dashboardDraft.plant === "Todas" || warehouse.center === dashboardDraft.plant) &&
          (dashboardDraft.warehouse === "Todos" || warehouse.id === dashboardDraft.warehouse),
      )
      .map((warehouse: Row) => warehouse.id),
  );
  const dashboardDraftArticleIds = new Set(
    inv
      .filter((row: Row) => dashboardDraftWarehouseIds.has(row.warehouse_id))
      .map((row: Row) => row.article_id),
  );
  const dashboardDraftCategories = [
    ...new Set(
      (data.articles || [])
        .filter((article: Row) => dashboardDraftArticleIds.has(article.id))
        .map((article: Row) => article.category),
    ),
  ] as string[];
  const countRows: Row[] = (data.counts || []).map((count: Row) => {
    const location = locationById.get(count.location_id) || {};
    const warehouse = warehouseById.get(location.warehouse_id) || {};
    const lot = lotById.get(count.lot_id) || {};
    const article = articleById.get(lot.article_id) || {};
    const difference = number(count.counted) - number(count.theoretical);
    const accuracy = number(count.theoretical)
      ? Math.max(0, 100 - (Math.abs(difference) / number(count.theoretical)) * 100)
      : 100;
    return {
      ...count,
      article_id: lot.article_id,
      article_name: article.name || lot.article_id,
      unit: article.unit || "u.",
      warehouse_id: location.warehouse_id,
      warehouse_name: warehouse.name || location.warehouse_id,
      plant_name: warehouse.center || warehouse.name || location.warehouse_id,
      location_name: location.name || count.location_id,
      difference,
      absoluteDifference: Math.abs(difference),
      accuracy,
    };
  });
  const latestCountByPosition = countRows.reduce(
    (latest: Map<string, Row>, row: Row) => {
      const key = `${row.lot_id}:${row.location_id}`;
      const current = latest.get(key);
      if (
        !current ||
        new Date(row.created_at).getTime() > new Date(current.created_at).getTime()
      )
        latest.set(key, row);
      return latest;
    },
    new Map<string, Row>(),
  );
  const currentCountIds = new Set(
    [...latestCountByPosition.values()].map((row: Row) => row.id),
  );
  const countBaseRows = countRows.filter((row: Row) =>
    countView === "history"
      ? true
      : countView === "current"
        ? currentCountIds.has(row.id)
        : currentCountIds.has(row.id) &&
          (number(row.absoluteDifference) > 0 || row.status === "PENDIENTE"),
  );
  const filteredCountRows = countBaseRows
    .filter(
      (row: Row) =>
        (countPlant === "Todas" || row.plant_name === countPlant) &&
        (countWarehouse === "Todos" || row.warehouse_id === countWarehouse) &&
        (countStatus === "Todos" || row.status === countStatus) &&
        JSON.stringify(row).toLowerCase().includes(query.toLowerCase()),
    )
    .sort(
      (a: Row, b: Row) =>
        (a.status === "PENDIENTE" ? -1 : 0) -
          (b.status === "PENDIENTE" ? -1 : 0) ||
        number(b.absoluteDifference) - number(a.absoluteDifference) ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  const orderRows: Row[] = (data.documents || []).filter(
    (row: Row) => row.kind === "PEDIDO",
  );
  const filteredOrderRows = orderRows.filter((row: Row) => {
    const warehouse = warehouseById.get(row.data?.warehouseId) || {};
    return (
      (orderPlant === "Todas" || warehouse.center === orderPlant) &&
      (orderWarehouse === "Todos" || row.data?.warehouseId === orderWarehouse) &&
      (orderArticle === "Todos" || row.data?.articleId === orderArticle) &&
      (orderStatus === "Todos" || row.status === orderStatus) &&
      JSON.stringify(row).toLowerCase().includes(query.toLowerCase())
    );
  });
  const visibleOrderIds = new Set(filteredOrderRows.map((row: Row) => row.id));
  const visibleCommitted = (data.reservations || [])
    .filter(
      (row: Row) =>
        visibleOrderIds.has(row.document_id) && row.status === "ACTIVA",
    )
    .reduce((sum: number, row: Row) => sum + number(row.quantity), 0);
  const dashboardWarehouseIds = new Set(
    (data.warehouses || [])
      .filter(
        (warehouse: Row) =>
          (dashboardFilters.plant === "Todas" ||
            warehouse.center === dashboardFilters.plant) &&
          (dashboardFilters.warehouse === "Todos" ||
            warehouse.id === dashboardFilters.warehouse),
      )
      .map((warehouse: Row) => warehouse.id),
  );
  const dashboardArticleMatches = (article: Row) => {
    const needle = dashboardFilters.sku.trim().toLowerCase();
    return (
      (dashboardFilters.category === "Todas" ||
        article.category === dashboardFilters.category) &&
      (!needle ||
        article.id.toLowerCase().includes(needle) ||
        article.name.toLowerCase().includes(needle))
    );
  };
  const dashboardArticles: Row[] = (data.articles || []).filter(
    dashboardArticleMatches,
  ) as Row[];
  const dashboardArticleIds = new Set(
    dashboardArticles.map((article: Row) => article.id),
  );
  const dashboardSnapshotEnd = new Date(
    dashboardFilters.end + "T23:59:59.999",
  );
  const dashboardSnapshotEndTime = dashboardSnapshotEnd.getTime();
  const lotQualityAt = (lotId: string, pointTime: number) => {
    const lot = lotById.get(lotId) || {};
    const decisions = (data.qualityHistory || data.audit || [])
      .filter(
        (event: Row) =>
          event.action === "quality.decision" && event.detail?.lot === lotId,
      )
      .sort(
        (a: Row, b: Row) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
    let quality = decisions[0]?.detail?.previous || lot.quality || "CUARENTENA";
    for (const decision of decisions) {
      if (new Date(decision.created_at).getTime() > pointTime) break;
      quality = decision.detail?.quality || quality;
    }
    return quality;
  };
  const reservedAt = (lotId: string, locationId: string, pointTime: number) =>
    (data.reservations || [])
      .filter((reservation: Row) => {
        const document = documentById.get(reservation.document_id);
        return (
          reservation.status === "ACTIVA" &&
          reservation.lot_id === lotId &&
          reservation.location_id === locationId &&
          document &&
          new Date(document.created_at).getTime() <= pointTime
        );
      })
      .reduce(
        (total: number, reservation: Row) =>
          total + number(reservation.quantity),
        0,
      );
  const dashboardInventory: Row[] = inv
    .filter(
      (row) =>
        dashboardArticleIds.has(row.article_id) &&
        dashboardWarehouseIds.has(row.warehouse_id),
    )
    .map((row: Row): Row => {
      const physical = (data.movements || [])
        .filter(
          (movement: Row) =>
            movement.lot_id === row.lot_id &&
            movement.location_id === row.location_id &&
            new Date(movement.created_at).getTime() <= dashboardSnapshotEndTime,
        )
        .reduce(
          (total: number, movement: Row) =>
            total + number(movement.quantity),
          0,
        );
      const lot = lotById.get(row.lot_id) || {};
      const qualityAtClose = lotQualityAt(
        row.lot_id,
        dashboardSnapshotEndTime,
      );
      const reserved = Math.min(
        Math.max(0, physical),
        reservedAt(row.lot_id, row.location_id, dashboardSnapshotEndTime),
      );
      const eligible =
        qualityAtClose === "LIBERADO" &&
        (!lot.expiry ||
          new Date(
            String(lot.expiry).slice(0, 10) + "T23:59:59.999",
          ).getTime() >=
            dashboardSnapshotEndTime);
      return {
        ...row,
        quality: qualityAtClose,
        physical: Math.max(0, physical),
        reserved,
        available: eligible ? Math.max(0, physical - reserved) : 0,
        blocked: eligible ? 0 : Math.max(0, physical),
      };
    })
    .filter((row: Row) => number(row.physical) > 0);
  const dashboardLotIds = new Set(
    dashboardInventory.map((row) => row.lot_id),
  );
  const dashboardPhysical = dashboardInventory.reduce(
    (total, row) => total + number(row.physical),
    0,
  );
  const inventoryHasData = dashboardPhysical > 0;
  const dashboardAvailable = dashboardInventory.reduce(
    (total, row) => total + number(row.available),
    0,
  );
  const dashboardBlocked = dashboardInventory.reduce(
    (total, row) => total + number(row.blocked),
    0,
  );
  const affectedUnitsPct = dashboardPhysical
    ? (dashboardBlocked / dashboardPhysical) * 100
    : 0;
  const atpPct = dashboardPhysical
    ? (dashboardAvailable / dashboardPhysical) * 100
    : 0;
  const dashboardPlanning = Array.from(
    dashboardInventory
      .reduce((groups: Map<string, Row>, position: Row) => {
        const key = `${position.article_id}:${position.warehouse_id}`;
        const group = groups.get(key) || {
          id: key,
          article_id: position.article_id,
          warehouse_id: position.warehouse_id,
          available: 0,
        };
        group.available += number(position.available);
        groups.set(key, group);
        return groups;
      }, new Map<string, Row>())
      .values(),
  ).map((group: Row) => {
    const article = articleById.get(group.article_id) || {};
    const rop =
      number(article.daily_demand) * number(article.lead_days) +
      number(article.safety_stock);
    return {
      ...group,
      article,
      rop,
      position: number(group.available),
      underRop: number(group.available) <= rop,
    };
  });
  const dashboardLow = dashboardPlanning
    .filter((row: Row) => row.underRop)
    .sort(
      (a: Row, b: Row) =>
        number(b.rop) - number(b.position) -
        (number(a.rop) - number(a.position)),
    );
  const lowPct = dashboardPlanning.length
    ? (dashboardLow.length / dashboardPlanning.length) * 100
    : 0;
  const dashboardReconciliation = (data.reconciliation || []).filter(
    (row: Row) =>
      dashboardLotIds.has(row.lot_id) &&
      dashboardWarehouseIds.has(locationById.get(row.location_id)?.warehouse_id),
  );
  const reconciliationDifference = dashboardReconciliation.reduce(
    (total: number, row: Row) =>
      total +
      Math.abs(number(row.difference)) +
      Math.abs(number(row.reservation_difference)),
    0,
  );
  const dashboardCountHistory = (data.counts || []).filter((row: Row) => {
    const location = locationById.get(row.location_id);
    return (
      row.status === "APROBADO" &&
      new Date(row.created_at).getTime() <= dashboardSnapshotEndTime &&
      dashboardLotIds.has(row.lot_id) &&
      location &&
      dashboardWarehouseIds.has(location.warehouse_id)
    );
  });
  const dashboardCounts = Array.from(
    dashboardCountHistory.reduce((latest: Map<string, Row>, row: Row) => {
      const key = `${row.lot_id}:${row.location_id}`;
      const previous = latest.get(key);
      if (
        !previous ||
        new Date(row.created_at).getTime() > new Date(previous.created_at).getTime()
      )
        latest.set(key, row);
      return latest;
    }, new Map<string, Row>()).values(),
  ) as Row[];
  const countedTheoretical = dashboardCounts.reduce(
    (total: number, row: Row) => total + number(row.theoretical),
    0,
  );
  const countedDifference = dashboardCounts.reduce(
    (total: number, row: Row) =>
      total + Math.abs(number(row.counted) - number(row.theoretical)),
    0,
  );
  const accuracyHasData = countedTheoretical > 0;
  const accuracyPct = accuracyHasData
    ? Math.max(0, 100 - (countedDifference / countedTheoretical) * 100)
    : 0;
  const dashboardWarehouseRisk: Row[] = (data.warehouses || [])
    .filter((warehouse: Row) => dashboardWarehouseIds.has(warehouse.id))
    .map((warehouse: Row) => {
      const positions = dashboardInventory.filter(
        (row) => row.warehouse_id === warehouse.id,
      );
      // Evaluate only the SKUs that actually have an inventory position in this
      // warehouse. Counting the complete catalogue made every warehouse look as
      // though it was responsible for SKUs it never stores.
      const positionedArticleIds = new Set(
        positions.map((position: Row) => position.article_id),
      );
      const evaluatedArticles = dashboardArticles.filter((article: Row) =>
        positionedArticleIds.has(article.id),
      );
      const articlePlanning = evaluatedArticles.map((article: Row) => {
        const available = positions
          .filter((row) => row.article_id === article.id)
          .reduce((total, row) => total + number(row.available), 0);
        const rop =
          number(article.daily_demand) * number(article.lead_days) +
          number(article.safety_stock);
        return {
          underRop: available <= rop,
          gap: Math.max(0, rop - available),
        };
      });
      const belowRop = articlePlanning.filter((article) => article.underRop).length;
      const evaluated = evaluatedArticles.length;
      return {
        id: warehouse.id,
        plant: warehouse.center || warehouse.name,
        name: warehouse.name,
        belowRop,
        evaluated,
        riskPct: evaluated ? (belowRop / evaluated) * 100 : 0,
        gap: articlePlanning.reduce(
          (total, article) => total + article.gap,
          0,
        ),
      };
    })
    .filter((warehouse: Row) => warehouse.evaluated > 0)
    .sort(
      (a: Row, b: Row) =>
        b.riskPct - a.riskPct || b.gap - a.gap,
    );
  const dashboardRisk = Array.from(
    dashboardWarehouseRisk.reduce((plants: Map<string, Row>, warehouse: Row) => {
      const plant = warehouse.plant || warehouse.name;
      const current = plants.get(plant) || {
        id: plant,
        plant,
        name: plant === "CBN-PILOTO" ? "Planta piloto / CD" : plant,
        belowRop: 0,
        evaluated: 0,
        gap: 0,
      };
      current.belowRop += number(warehouse.belowRop);
      current.evaluated += number(warehouse.evaluated);
      current.gap += number(warehouse.gap);
      current.riskPct = current.evaluated
        ? (current.belowRop / current.evaluated) * 100
        : 0;
      plants.set(plant, current);
      return plants;
    }, new Map<string, Row>()).values(),
  ).sort(
    (a: Row, b: Row) => b.riskPct - a.riskPct || b.gap - a.gap,
  );
  const dashboardRiskGapMax = Math.max(
    1,
    ...dashboardRisk.map((row: Row) => row.gap),
  );
  const dashboardRiskBelowTotal = dashboardRisk.reduce(
    (total: number, row: Row) => total + number(row.belowRop),
    0,
  );
  const dashboardRiskEvaluatedTotal = dashboardRisk.reduce(
    (total: number, row: Row) => total + number(row.evaluated),
    0,
  );
  const dashboardRiskGapTotal = dashboardRisk.reduce(
    (total: number, row: Row) => total + number(row.gap),
    0,
  );
  const trendStart = new Date(dashboardFilters.start + "T00:00:00");
  const trendEnd = new Date(dashboardFilters.end + "T23:59:59");
  const trendSpan = Math.max(1, trendEnd.getTime() - trendStart.getTime());
  const trendMovements = (data.movements || []).filter((movement: Row) => {
    const lot = lotById.get(movement.lot_id);
    const location = locationById.get(movement.location_id);
    return (
      lot &&
      location &&
      dashboardArticleIds.has(lot.article_id) &&
      dashboardWarehouseIds.has(location.warehouse_id)
    );
  });
  const trendPoints = Array.from({ length: 7 }, (_, index) => {
    const pointDate = new Date(
      trendStart.getTime() + (trendSpan * index) / 6,
    );
    const physicalAt = trendMovements
      .filter(
        (movement: Row) =>
          new Date(movement.created_at).getTime() <= pointDate.getTime(),
      )
      .reduce((total: number, movement: Row) => total + number(movement.quantity), 0);
    const eligibleAt = trendMovements
      .filter((movement: Row) => {
        if (new Date(movement.created_at).getTime() > pointDate.getTime())
          return false;
        const lot = lotById.get(movement.lot_id) || {};
        return (
          lotQualityAt(movement.lot_id, pointDate.getTime()) === "LIBERADO" &&
          (!lot.expiry || new Date(lot.expiry).getTime() >= pointDate.getTime())
        );
      })
      .reduce((total: number, movement: Row) => total + number(movement.quantity), 0);
    const presentLots = new Set(
      trendMovements
        .filter(
          (movement: Row) =>
            new Date(movement.created_at).getTime() <= pointDate.getTime(),
        )
        .map((movement: Row) => movement.lot_id),
    );
    const reservedAtPoint = inv
      .filter(
        (row: Row) =>
          presentLots.has(row.lot_id) &&
          dashboardArticleIds.has(row.article_id) &&
          dashboardWarehouseIds.has(row.warehouse_id),
      )
      .reduce(
        (total: number, row: Row) =>
          total + reservedAt(row.lot_id, row.location_id, pointDate.getTime()),
        0,
      );
    const countHistoryAt = dashboardCountHistory.filter(
      (row: Row) =>
        new Date(row.created_at).getTime() <= pointDate.getTime(),
    );
    const countsAt = Array.from(
      countHistoryAt.reduce((latest: Map<string, Row>, row: Row) => {
        const key = `${row.lot_id}:${row.location_id}`;
        const previous = latest.get(key);
        if (
          !previous ||
          new Date(row.created_at).getTime() > new Date(previous.created_at).getTime()
        )
          latest.set(key, row);
        return latest;
      }, new Map<string, Row>()).values(),
    ) as Row[];
    const theoreticalAt = countsAt.reduce(
      (total: number, row: Row) => total + number(row.theoretical),
      0,
    );
    const countDifferenceAt = countsAt.reduce(
      (total: number, row: Row) =>
        total + Math.abs(number(row.counted) - number(row.theoretical)),
      0,
    );
    return {
      label: shortDay(pointDate),
      atp: physicalAt
        ? Math.max(
            0,
            Math.min(100, ((eligibleAt - reservedAtPoint) / physicalAt) * 100),
          )
        : null,
      accuracy: theoreticalAt
        ? Math.max(0, 100 - (countDifferenceAt / theoreticalAt) * 100)
        : null,
    };
  });
  const dashboardPositionGroups = Array.from(
    dashboardInventory
      .reduce((groups: Map<string, Row>, position: Row) => {
        const key = `${position.article_id}:${position.warehouse_id}`;
        const group = groups.get(key) || {
          id: key,
          article_id: position.article_id,
          warehouse_id: position.warehouse_id,
          positions: [],
        };
        group.positions.push(position);
        groups.set(key, group);
        return groups;
      }, new Map<string, Row>())
      .values(),
  ) as Row[];
  const dashboardRowsAll: Row[] = dashboardPositionGroups.map((group: Row) => {
    const article = articleById.get(group.article_id) || {};
    const positions = group.positions as Row[];
    const physical = positions.reduce((sum, row) => sum + number(row.physical), 0);
    const reserved = positions.reduce((sum, row) => sum + number(row.reserved), 0);
    const available = positions.reduce((sum, row) => sum + number(row.available), 0);
    const blocked = positions.reduce((sum, row) => sum + number(row.blocked), 0);
    const rop =
      number(article.daily_demand) * number(article.lead_days) +
      number(article.safety_stock);
    const nearest = [...positions].sort((a: Row, b: Row) => {
      if (!a.expiry) return 1;
      if (!b.expiry) return -1;
      return new Date(a.expiry).getTime() - new Date(b.expiry).getTime();
    })[0];
    const positionKeys = new Set(
      positions.map((row: Row) => `${row.lot_id}:${row.location_id}`),
    );
    const counts = dashboardCounts.filter((row: Row) =>
      positionKeys.has(`${row.lot_id}:${row.location_id}`),
    );
    const countTheoretical = counts.reduce(
      (sum: number, row: Row) => sum + number(row.theoretical),
      0,
    );
    const countDifference = counts.reduce(
      (sum: number, row: Row) =>
        sum + Math.abs(number(row.counted) - number(row.theoretical)),
      0,
    );
    const countAccuracy = countTheoretical
      ? Math.max(0, 100 - (countDifference / countTheoretical) * 100)
      : 100;
    const countPositions = counts
      .map((row: Row) => ({
        ...row,
        difference: number(row.counted) - number(row.theoretical),
      }))
      .filter((row: Row) => Math.abs(number(row.difference)) > 0)
      .sort(
        (a: Row, b: Row) =>
          Math.abs(number(b.difference)) - Math.abs(number(a.difference)),
      );
    const primaryCount = countPositions[0];
    const atpRatio = physical ? (available / physical) * 100 : 100;
    const blockedRatio = physical ? (blocked / physical) * 100 : 0;
    const daysToExpiry = nearest?.expiry
      ? Math.ceil((new Date(nearest.expiry).getTime() - Date.now()) / 86400000)
      : null;
    const countIssue = counts.length > 0 && countAccuracy < 95;
    const affectedIssue = blocked > 0;
    const atpIssue = !affectedIssue && atpRatio < 90;
    const ropIssue = available <= rop;
    const expiryIssue =
      !countIssue && !affectedIssue && !atpIssue && !ropIssue &&
      daysToExpiry !== null && daysToExpiry <= 30;
    const issue = countIssue
      ? "accuracy"
      : affectedIssue
        ? "affected"
        : atpIssue
          ? "atp"
          : ropIssue
            ? "rop"
            : expiryIssue
              ? "expiry"
              : "ok";
    const severity =
      countIssue && countAccuracy < 90 ||
      affectedIssue && blockedRatio > 8 ||
      atpIssue && atpRatio < 85 ||
      ropIssue
        ? 2
        : issue === "ok"
          ? 0
          : 1;
    const pendingCount = (data.counts || []).find(
      (row: Row) =>
        positionKeys.has(`${row.lot_id}:${row.location_id}`) &&
        row.status === "PENDIENTE",
    );
    const openSuggestion = (data.suggestions || []).find(
      (row: Row) =>
        row.article_id === group.article_id && row.status === "ABIERTA",
    );
    const activeCoverage = (data.documents || []).find(
      (row: Row) =>
        ["TRASLADO", "COMPRA"].includes(row.kind) &&
        !["CERRADA", "RECIBIDA", "CANCELADA"].includes(row.status) &&
        row.data?.articleId === group.article_id,
    );
    const workflow =
      issue === "accuracy"
        ? pendingCount
          ? "Reconteo pendiente"
          : "Reconteo por iniciar"
        : issue === "affected"
          ? "Decisión de calidad pendiente"
          : issue === "atp"
            ? activeCoverage
              ? `${activeCoverage.kind === "TRASLADO" ? "Traslado" : "Compra"} ${statusLabel(activeCoverage.status).toLowerCase()}`
              : "Cobertura por resolver"
            : issue === "rop"
              ? openSuggestion
                ? "Sugerencia abierta"
                : "Solicitud por preparar"
              : issue === "expiry"
                ? "Secuencia FEFO pendiente"
                : "Sin acción pendiente";
    const owner =
      issue === "accuracy"
        ? "Jefatura de Almacén"
        : issue === "affected"
          ? "Equipo de Calidad"
          : issue === "atp"
            ? "Planificación y Almacenes"
            : issue === "rop"
              ? "Compras y Almacén"
              : issue === "expiry"
                ? "Despacho"
                : "—";
    return {
      ...nearest,
      id: group.id,
      article,
      positions,
      physical,
      reserved,
      available,
      blocked,
      rop,
      atpRatio,
      blockedRatio,
      countAccuracy,
      countDifference,
      countTheoretical,
      countPositions,
      primaryCount,
      daysToExpiry,
      issue,
      severity,
      workflow,
      owner,
      statusText:
        issue === "accuracy"
          ? `Diferencia de conteo · ${percent(countAccuracy)}`
          : issue === "affected"
            ? `${fmt(blocked)} ${article.unit || "u."} no elegibles`
            : issue === "atp"
              ? `ATP insuficiente · ${percent(atpRatio)}`
              : issue === "rop"
                ? `Bajo ROP · brecha ${fmt(Math.max(0, rop - available))}`
                : issue === "expiry"
                  ? `Lote vence en ${daysToExpiry} días`
                  : "Cumple",
      actionLabel:
        issue === "accuracy"
          ? "Revisar conteo"
          : issue === "affected"
            ? "Revisar calidad"
            : issue === "atp"
              ? "Resolver cobertura"
              : issue === "rop"
                ? "Preparar reposición"
                : issue === "expiry"
                  ? "Priorizar FEFO"
                  : "",
      actionPage:
        issue === "accuracy"
          ? "Conteos y diferencias"
          : issue === "affected"
            ? "Lotes pendientes"
            : issue === "rop"
              ? "Punto de reorden"
              : issue === "expiry"
                ? "Preparación FIFO/FEFO"
                : "",
    };
  });
  const dashboardRowsSorted = [...dashboardRowsAll].sort(
    (a: Row, b: Row) =>
      number(b.severity) - number(a.severity) ||
      number(a.atpRatio) - number(b.atpRatio) ||
      number(b.countDifference) - number(a.countDifference),
  );
  const dashboardIsConsolidated =
    dashboardFilters.plant === "Todas" &&
    dashboardFilters.warehouse === "Todos" &&
    dashboardFilters.category === "Todas" &&
    !dashboardFilters.sku.trim();
  const dashboardRowCandidates = dashboardIsConsolidated
    ? dashboardRowsSorted.filter((row: Row) => row.severity > 0)
    : dashboardRowsSorted;
  const dashboardRows: Row[] = [];
  for (const issue of ["accuracy", "affected", "atp", "rop"]) {
    const row = dashboardRowCandidates.find((item: Row) => item.issue === issue);
    if (row) dashboardRows.push(row);
  }
  for (const row of dashboardRowCandidates) {
    if (dashboardRows.length >= 6) break;
    if (!dashboardRows.some((item) => item.id === row.id)) dashboardRows.push(row);
  }
  const reviewDashboardCount = (row: Row) => {
    const focus = row.primaryCount || {};
    const warehouse = warehouseById.get(row.warehouse_id) || {};
    navigate("Conteos y diferencias");
    setCountPlant(warehouse.center || warehouse.name || "Todas");
    setCountWarehouse(row.warehouse_id || "Todos");
    setCountStatus("Todos");
    setCountView("attention");
    setQuery(focus.lot_id || row.article_id || "");
  };
  // The banner surfaces only the most urgent breached KPI. Local exceptions
  // remain visible in the decision centre without falsely presenting the whole
  // portfolio as failed.
  const dashboardLowPriority = dashboardLow.slice(0, 2).map((row: Row) => {
    const article = row.article || articleById.get(row.article_id) || {};
    const warehouse = warehouseById.get(row.warehouse_id) || {};
    return `${article.name || "Producto sin nombre"} en ${warehouse.name || "almacén sin identificar"}`;
  });
  const dashboardLowRemaining = Math.max(
    0,
    dashboardLow.length - dashboardLowPriority.length,
  );
  const dashboardAlert = ([
    accuracyHasData && accuracyPct < 95
      ? {
          key: "accuracy",
          severity: accuracyPct < 90 ? 2 : 1,
          score: 95 - accuracyPct,
          level: accuracyPct < 90 ? "critical" : "warning",
          title: "Exactitud del inventario por debajo de la meta",
          detail: `La exactitud es ${percent(accuracyPct)} y la meta es 95%. Revisa las diferencias de conteo antes de prometer inventario.`,
          gap: `BRECHA: ${points(accuracyPct - 95)}`,
          action: "Revisar conteos",
          page: "Conteos y diferencias",
          owner: "Jefatura de Almacén",
          tracking: "Reconteo y autorización del ajuste",
        }
      : null,
    inventoryHasData && atpPct < 90
      ? {
          key: "atp",
          severity: atpPct < 85 ? 2 : 1,
          score: 90 - atpPct,
          level: atpPct < 85 ? "critical" : "warning",
          title: "Disponibilidad ATP por debajo de la meta",
          detail: `El ATP es ${percent(atpPct)} frente a la meta de 90%. Hay riesgo de prometer unidades que no están libres.`,
          gap: `BRECHA: ${points(atpPct - 90)}`,
          action: "Revisar existencias",
          page: "Existencias",
          owner: "Planificación y Almacenes",
          tracking: "Cobertura, reservas y traslados",
        }
      : null,
    dashboardPlanning.length > 0 && lowPct > 10
      ? {
          key: "rop-" + dashboardLow.map((row: Row) => row.id).join("-"),
          severity: lowPct > 20 ? 2 : 1,
          score: lowPct - 10,
          level: lowPct > 20 ? "critical" : "warning",
          title: "Reposición requerida para evitar quiebres",
          detail: `${dashboardLow.length} de ${dashboardPlanning.length} productos evaluados por almacén necesitan reposición. Atiende primero: ${dashboardLowPriority.join("; ")}${dashboardLowRemaining ? `; y ${dashboardLowRemaining} casos adicionales` : ""}.`,
          gap: `${percent(lowPct)} DEL PORTAFOLIO`,
          action: "Revisar reposición",
          page: "Punto de reorden",
          owner: "Compras y Almacén",
          tracking: "Sugerencia y solicitud de compra",
        }
      : null,
    inventoryHasData && affectedUnitsPct > 5
      ? {
          key: "affected",
          severity: affectedUnitsPct > 8 ? 2 : 1,
          score: affectedUnitsPct - 5,
          level: affectedUnitsPct > 8 ? "critical" : "warning",
          title: "Unidades retenidas por encima del límite",
          detail: `${percent(affectedUnitsPct)} del stock está bloqueado o no es elegible. La meta máxima es 5%.`,
          gap: `EXCESO: ${points(affectedUnitsPct - 5)}`,
          action: "Revisar calidad",
          page: "Lotes pendientes",
          owner: "Equipo de Calidad",
          tracking: "Liberación, bloqueo o rechazo",
        }
      : null,
  ]
    .filter(Boolean) as Row[])
    .sort(
      (a: Row, b: Row) =>
        number(b.severity) - number(a.severity) ||
        number(b.score) - number(a.score),
    )[0] || null;
  const pending =
    data.outbox?.filter((r: Row) => r.status !== "ENVIADO").length || 0;
  const permission =
    group === "Administración"
      ? "admin"
      : group === "Datos maestros"
        ? "maestros"
        : group === "Compras y recepción"
          ? "compras"
          : group === "Producción"
            ? "produccion"
            : group === "Calidad"
              ? "calidad"
              : group === "Pedidos y despachos"
                ? "despacho"
                : "inventario";
  function prepareCoverageTransfer(target: Row, source: Row, quantity: number) {
    const destination = (data.locations || []).find(
      (location: Row) => location.warehouse_id === target.warehouse_id,
    );
    setCoverage(null);
    show(
      "transfer.create",
      "Traslado para recuperar cobertura ATP",
      [
        field("id", "Referencia", "text", reference("TR")),
        { ...select("lotId", "Lote", "lots"), value: source.lot_id },
        { ...select("fromLocation", "Origen", "locations"), value: source.location_id },
        { ...select("toLocation", "Destino", "locations"), value: destination?.id },
        field(
          "quantity",
          "Cantidad",
          "number",
          Math.max(1, Math.floor(quantity)),
        ),
      ],
      {},
      `Cobertura sugerida para ${target.article_id}. El traslado queda en tránsito hasta que el almacén destino confirme la recepción.`,
    );
  }
  function btn(label: string, fn: () => void, primary = false) {
    return (
      <button disabled={busy} className={primary ? "primary" : ""} onClick={fn}>
        {primary ? <Plus size={15} /> : null}
        {label}
      </button>
    );
  }
  function table(
    rows: Row[],
    cols: {
      key: string;
      label: string;
      render?: (r: Row) => React.ReactNode;
    }[],
    actions?: (r: Row) => React.ReactNode,
  ) {
    const listRows = rows.filter((r) =>
      JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
    );
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              {actions && <th className="right">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {listRows.slice(0, 200).map((r, i) => (
              <tr key={r.id || i}>
                {cols.map((c) => (
                  <td key={c.key}>
                    {c.render
                      ? c.render(r)
                      : typeof r[c.key] === "object"
                        ? JSON.stringify(r[c.key])
                        : String(r[c.key] ?? "—")}
                  </td>
                ))}
                {actions && (
                  <td>
                    <div className="row-actions">{actions(r)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!listRows.length && (
          <div className="empty">
            <Package size={30} />
            <h3>No hay registros aquí todavía</h3>
            <p>Cambia los filtros o registra la primera operación.</p>
          </div>
        )}
        <div className="table-footer">
          {Math.min(listRows.length, 200)} de {listRows.length} registros{" "}
          <span>
            Datos del ERP · actualización manual{" "}
            <button onClick={refresh} aria-label="Actualizar tabla">
              <RefreshCw size={13} />
            </button>
          </span>
        </div>
      </div>
    );
  }
  const generic = (
    rows: Row[],
    cols: string[],
    acts?: (r: Row) => React.ReactNode,
  ) =>
    table(
      rows,
      cols.map((k) => ({
        key: k,
        label:
          (
            {
              id: "Referencia",
              name: "Nombre",
              article_id: "Artículo",
              lot_id: "Lote",
              location_id: "Ubicación",
              quantity: "Cantidad",
              type: "Tipo",
              status: "Estado",
              created_at: "Fecha",
              reason: "Motivo",
              username: "Usuario",
              role_id: "Rol",
              permissions: "Permisos",
              warehouse_id: "Almacén",
              unit: "Unidad",
              category: "Categoría",
              policy: "Política",
              abc: "ABC",
              contact: "Contacto",
              actor: "Responsable",
              source: "Origen",
              event_id: "Evento",
              business_key: "Clave de negocio",
              attempts: "Intentos",
              event_type: "Evento de dominio",
              destination: "Destino",
              theoretical: "Teórico",
              counted: "Contado",
              parent_lot: "Lote de entrada",
              child_lot: "Lote de salida",
              document_id: "Documento",
              explanation: "Criterio",
              received_at: "Recepción",
              detail: "Detalle",
            } as any
          )[k] || k,
        render: ["status", "policy", "type"].includes(k)
          ? (r: Row) => <Badge value={r[k]} />
          : k.endsWith("_at")
            ? (r: Row) => date(r[k])
            : undefined,
      })),
      acts,
    );
  const compact = (label: string, fn: () => void) => (
    <button className="mini" onClick={fn} disabled={busy}>
      {label}
    </button>
  );
  function exportPage() {
    const map: Record<string, Row[]> = {
      Usuarios: data.users || [],
      "Roles y permisos": data.roles || [],
      Almacenes: data.warehouses,
      Artículos: data.articles,
      "Políticas FIFO/FEFO": data.articles,
      Proveedores: data.suppliers,
      Ubicaciones: data.locations,
      Auditoría: data.audit || [],
      Indicadores: data.planning,
      "Punto de reorden": data.planning,
      Existencias: filtered,
      Lotes: filteredLots,
      "Lotes pendientes": filteredLots,
      "Consulta por lote": filteredLots,
      Reservas: data.reservations,
      "Preparación FIFO/FEFO": data.reservations,
      Movimientos: data.movements,
      "Mermas y ajustes": data.movements.filter((m: Row) =>
        /MERMA|AJUSTE/.test(m.type),
      ),
      "Conteos y diferencias": data.counts,
      "Historial de decisiones": data.qualityHistory,
      Mensajería: data.outbox || [],
      Conciliación: data.reconciliation,
    };
    const kinds: Record<string, string> = {
      "Solicitudes de compra": "SOLICITUD",
      "Órdenes de compra": "COMPRA",
      "Órdenes de producción": "PRODUCCION",
      Pedidos: "PEDIDO",
      "Salidas y entregas": "PEDIDO",
      Traslados: "TRASLADO",
    };
    const rows = (
      map[page] ||
      data.documents.filter((d: Row) =>
        kinds[page]
          ? d.kind === kinds[page]
          : ["TRANSITO", "PARCIAL"].includes(d.status),
      )
    ).filter((r: Row) =>
      JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
    );
    download(rows, page.replaceAll(" ", "_"));
  }
  function inventoryTable() {
    return table(
      filtered,
      [
        {
          key: "article_id",
          label: "Artículo / SKU",
          render: (r) => (
            <div className="article-cell">
              <span className="item-icon">
                <Package size={17} />
              </span>
              <div>
                <strong>{r.article}</strong>
                <small>
                  {r.article_id} · {r.unit}
                </small>
              </div>
            </div>
          ),
        },
        {
          key: "lot_id",
          label: "Lote",
          render: (r) => (
            <button className="text-link" onClick={() => setDetail(r)}>
              {r.lot_id}
            </button>
          ),
        },
        {
          key: "location_id",
          label: "Ubicación / almacén",
          render: (r) => {
            const location = locationById.get(r.location_id);
            const warehouse = warehouseById.get(r.warehouse_id);
            return (
              <div>
                <strong>{location?.name || r.location_id}</strong>
                <small>
                  {r.location_id} · {warehouse?.name || r.warehouse_id}
                  {warehouse?.center ? ` / ${warehouse.center}` : ""}
                </small>
              </div>
            );
          },
        },
        {
          key: "quality",
          label: "Calidad",
          render: (r) => <Badge value={r.quality} />,
        },
        { key: "expiry", label: "Vencimiento", render: (r) => date(r.expiry) },
        {
          key: "policy",
          label: "Regla",
          render: (r) => <Badge value={r.policy} />,
        },
        { key: "physical", label: "Físico", render: (r) => fmt(r.physical) },
        { key: "reserved", label: "Reservado", render: (r) => fmt(r.reserved) },
        {
          key: "available",
          label: "Disponible",
          render: (r) => (
            <strong className={Number(r.available) ? "number-green" : "muted"}>
              {fmt(r.available)}
            </strong>
          ),
        },
      ],
      (r) => (
        <>
          {compact("Ver", () => setDetail(r))}
          {can("calidad") && compact("Calidad", () => action("quality", r))}
        </>
      ),
    );
  }
  function lotsTable() {
    return table(
      filteredLots,
      [
        {
          key: "lot_id",
          label: "Lote",
          render: (r) => (
            <button className="text-link" onClick={() => setDetail(r)}>
              {r.lot_id}
            </button>
          ),
        },
        {
          key: "article_id",
          label: "Artículo / SKU",
          render: (r) => (
            <div className="article-cell">
              <span className="item-icon">
                <Package size={17} />
              </span>
              <div>
                <strong>{r.article}</strong>
                <small>
                  {r.article_id} · {r.unit}
                </small>
              </div>
            </div>
          ),
        },
        {
          key: "quality",
          label: "Estado del lote",
          render: (r) => <Badge value={r.quality} />,
        },
        {
          key: "received_at",
          label: "Ingreso / fabricación",
          render: (r) => date(r.received_at),
        },
        { key: "expiry", label: "Vencimiento", render: (r) => date(r.expiry) },
        {
          key: "origin",
          label: "Documento de origen",
          render: (r) => (
            <div>
              <strong>{r.origin}</strong>
              <small>{statusLabel(r.origin_type)}</small>
            </div>
          ),
        },
        {
          key: "locations",
          label: "Ubicación / planta",
          render: (r) => (
            <div>
              <strong>
                {r.location_descriptions?.length
                  ? [...new Set(r.location_descriptions.map((item: Row) => item.location))].join(", ")
                  : "Sin existencia"}
              </strong>
              <small>
                {r.location_descriptions?.length
                  ? [...new Set(
                      r.location_descriptions.map(
                        (item: Row) => `${item.id} · ${item.warehouse}${item.center ? ` / ${item.center}` : ""}`,
                      ),
                    )].join("; ")
                  : `${r.position_count} posición(es)`}
              </small>
            </div>
          ),
        },
        {
          key: "physical",
          label: "Total físico",
          render: (r) => `${fmt(r.physical)} ${r.unit}`,
        },
        { key: "lot_version", label: "Versión" },
      ],
      (r) => (
        <>
          {compact("Trazabilidad", () => setDetail(r))}
          {can("calidad") &&
            compact("Decidir calidad", () => action("quality", r))}
        </>
      ),
    );
  }
  function documents(kind: string, sourceRows?: Row[]) {
    const rows = sourceRows || data.documents.filter((r: Row) => r.kind === kind);
    return table(
      rows,
      [
        {
          key: "id",
          label: "Documento",
          render: (r) => <strong>{r.id}</strong>,
        },
        {
          key: "data",
          label: "Detalle",
          render: (r) => {
            if (r.kind === "PRODUCCION") {
              const warehouse = (data.warehouses || []).find(
                (item: Row) => item.id === r.data.warehouseId,
              );
              return (
                <div>
                  <strong>Salida: {r.data.outputArticle}</strong>
                  <small>
                    Material: {r.data.inputArticle} · {r.data.inputQuantity}
                  </small>
                  <small>
                    Abastece: {warehouse?.name || r.data.warehouseId}
                    {warehouse?.center ? ` · ${warehouse.center}` : ""}
                  </small>
                </div>
              );
            }
            if (r.kind === "PEDIDO") {
              const article = articleById.get(r.data.articleId) || {};
              const warehouse = warehouseById.get(r.data.warehouseId) || {};
              return (
                <div>
                  <strong>{article.name || r.data.articleId}</strong>
                  <small>{r.data.articleId} · {fmt(r.data.quantity)} {article.unit || "u."}</small>
                  <small>{r.data.customer} · {warehouse.name || r.data.warehouseId}</small>
                  {r.data.promise && (
                    <small>Promesa v{r.data.promise.version}: {r.data.promise.date} · estimada</small>
                  )}
                </div>
              );
            }
            return (
              <div>
                <strong>
                  {r.data.customer || r.data.articleId || r.data.lotId}
                </strong>
                <small>
                  {r.data.quantity}{" "}
                  {r.data.supplierId ? " · " + r.data.supplierId : ""}
                </small>
                {r.data.promise && (
                  <small>
                    Promesa v{r.data.promise.version}: {r.data.promise.date} ·
                    estimada
                  </small>
                )}
              </div>
            );
          },
        },
        {
          key: "status",
          label: "Estado",
          render: (r) => <Badge value={r.status} />,
        },
        { key: "version", label: "Versión" },
        {
          key: "created_at",
          label: "Creación",
          render: (r) => date(r.created_at),
        },
      ],
      (r) => (
        <>
          {kind === "SOLICITUD" &&
            r.status === "PENDIENTE" &&
            can("compras") &&
            compact("Crear orden", () => action("convert", r))}
          {kind === "COMPRA" && can("compras") && (
            <>
              {r.status === "BORRADOR" &&
                compact("Aprobar", () => action("purchase.approve", r))}
              {r.status === "APROBADA" &&
                compact("En tránsito", () => action("purchase.ship", r))}
              {["TRANSITO", "PARCIAL"].includes(r.status) &&
                compact("Recibir", () => action("receive", r))}
            </>
          )}
          {kind === "PEDIDO" && can("despacho") && (
            <>
              {["PENDIENTE", "RESERVADO"].includes(r.status) &&
                compact("Promesa", () => action("promise", r))}
              {r.status === "PENDIENTE" &&
                compact("Reservar", () => action("order.reserve", r))}
              {r.status === "RESERVADO" &&
                compact("Confirmar salida", () => action("order.dispatch", r))}
              {["PENDIENTE", "RESERVADO"].includes(r.status) &&
                compact("Cancelar", () => action("order.cancel", r))}
              {r.status === "DESPACHADO" &&
                compact("Entregar", () => action("deliver", r))}
              {["DESPACHADO", "ENTREGADO"].includes(r.status) &&
                compact("Devolver", () => action("return", r))}
            </>
          )}
          {kind === "TRASLADO" &&
            r.status === "TRANSITO" &&
            can("inventario") &&
            compact("Recibir traslado", () => action("transfer.receive", r))}
          {kind === "PRODUCCION" && can("produccion") && (
            <>
              {r.status === "PLANIFICADA" &&
                compact("Reservar material", () =>
                  action("production.reserve", r),
                )}
              {r.status === "RESERVADA" &&
                compact("Registrar resultado", () => action("finish", r))}
            </>
          )}
        </>
      ),
    );
  }
  function content() {
    if (page === "Dashboard")
      return (
        <div className="executive-dashboard">
          {expandedPanel && (
            <button
              className="dashboard-expand-backdrop"
              aria-label="Cerrar vista ampliada"
              onClick={() => setExpandedPanel("")}
            />
          )}
          <form
            className="dashboard-filters"
            onSubmit={(event) => {
              event.preventDefault();
              const startTime = new Date(
                dashboardDraft.start + "T00:00:00",
              ).getTime();
              const endTime = new Date(
                dashboardDraft.end + "T23:59:59.999",
              ).getTime();
              const todayEnd = new Date(
                isoDay(new Date()) + "T23:59:59.999",
              ).getTime();
              if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
                setNotice({ text: "Selecciona dos fechas válidas.", error: true });
                return;
              }
              if (startTime > endTime) {
                setNotice({
                  text: "La fecha inicial no puede ser posterior a la fecha final.",
                  error: true,
                });
                return;
              }
              if (endTime > todayEnd) {
                setNotice({
                  text: "La fecha de cierre no puede estar en el futuro.",
                  error: true,
                });
                return;
              }
              if (endTime - startTime > 366 * 86400000) {
                setNotice({
                  text: "El periodo máximo permitido es de 366 días.",
                  error: true,
                });
                return;
              }
              setDashboardFilters(dashboardDraft);
              setDismissedAlert("");
            }}
          >
            <label className="date-filter">
              Periodo de análisis
              <span>
                <CalendarDays size={14} />
                <input
                  aria-label="Fecha inicial del dashboard"
                  type="date"
                  required
                  max={isoDay(new Date())}
                  value={dashboardDraft.start}
                  onChange={(event) =>
                    setDashboardDraft({
                      ...dashboardDraft,
                      start: event.target.value,
                    })
                  }
                />
                <b>–</b>
                <input
                  aria-label="Fecha final del dashboard"
                  type="date"
                  required
                  max={isoDay(new Date())}
                  value={dashboardDraft.end}
                  onChange={(event) =>
                    setDashboardDraft({
                      ...dashboardDraft,
                      end: event.target.value,
                    })
                  }
                />
              </span>
            </label>
            <label>
              Planta
              <select
                aria-label="Filtrar por planta"
                value={dashboardDraft.plant}
                onChange={(event) =>
                  setDashboardDraft({
                    ...dashboardDraft,
                    plant: event.target.value,
                    warehouse: "Todos",
                    category: "Todas",
                    sku: "",
                  })
                }
              >
                <option value="Todas">Todas las plantas</option>
                {dashboardPlants.map((plant) => (
                  <option key={plant} value={plant}>
                    {plant}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Almacén
              <select
                aria-label="Filtrar por almacén"
                value={dashboardDraft.warehouse}
                onChange={(event) =>
                  setDashboardDraft({
                    ...dashboardDraft,
                    warehouse: event.target.value,
                    category: "Todas",
                    sku: "",
                  })
                }
              >
                <option value="Todos">Todos los almacenes</option>
                {(data.warehouses || [])
                  .filter(
                    (warehouse: Row) =>
                      dashboardDraft.plant === "Todas" ||
                      warehouse.center === dashboardDraft.plant,
                  )
                  .map((warehouse: Row) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Categoría
              <select
                aria-label="Filtrar por categoría"
                value={dashboardDraft.category}
                onChange={(event) =>
                  setDashboardDraft({
                    ...dashboardDraft,
                    category: event.target.value,
                  })
                }
              >
                <option value="Todas">Todas las categorías</option>
                {dashboardDraftCategories.map(
                  (item: string) => (
                    <option key={item}>{item}</option>
                  ),
                )}
              </select>
            </label>
            <label className="dashboard-search-filter">
              SKU
              <span>
                <Search size={14} />
                <input
                  aria-label="Buscar SKU o producto"
                  placeholder="Buscar SKU o producto"
                  value={dashboardDraft.sku}
                  onChange={(event) =>
                    setDashboardDraft({
                      ...dashboardDraft,
                      sku: event.target.value,
                    })
                  }
                />
              </span>
            </label>
            <button className="dashboard-apply" type="submit">
              Aplicar
            </button>
            <button
              type="button"
              onClick={() => {
                const reset = initialDashboardFilters();
                setDashboardDraft(reset);
                setDashboardFilters(reset);
                setDismissedAlert("");
              }}
            >
              Limpiar filtros
            </button>
          </form>

          {dashboardAlert && dismissedAlert !== dashboardAlert.key && (
            <section
              className={`dashboard-alert ${dashboardAlert.level}`}
              role="alert"
            >
              <span className="dashboard-alert-icon">
                <Bell size={18} />
              </span>
              <div>
                <strong>ATENCIÓN · {dashboardAlert.title}</strong>
                <p>{dashboardAlert.detail}</p>
                <small className="dashboard-alert-followup">
                  Responsable: {dashboardAlert.owner} · Seguimiento: {dashboardAlert.tracking}
                </small>
              </div>
              <span className="dashboard-alert-gap">{dashboardAlert.gap}</span>
              <span className="dashboard-alert-priority">
                {dashboardAlert.level === "critical"
                  ? "PRIORIDAD ALTA"
                  : "PRIORIDAD MEDIA"}
              </span>
              <button onClick={() => navigate(dashboardAlert.page)}>
                {dashboardAlert.action}
              </button>
              <button
                className="dashboard-alert-close"
                aria-label="Ocultar alerta"
                onClick={() => setDismissedAlert(dashboardAlert.key)}
              >
                <X size={15} />
              </button>
            </section>
          )}

          <div className="dashboard-kpis">
            <DashboardKpi
              label="Unidades afectadas"
              value={inventoryHasData ? percent(affectedUnitsPct) : "Sin datos"}
              goal="Meta ≤ 5%"
              comparison={inventoryHasData ? `${points(affectedUnitsPct - 5)} vs. meta` : "Sin inventario al cierre"}
              status={!inventoryHasData ? "neutral" : affectedUnitsPct <= 5 ? "good" : "warning"}
              icon={Package}
              help="Porcentaje del stock físico que está bloqueado, vencido o retenido y no puede utilizarse."
              progress={Math.min(100, (affectedUnitsPct / 5) * 100)}
              inverse
            />
            <DashboardKpi
              label="Disponibilidad ATP"
              value={inventoryHasData ? percent(atpPct) : "Sin datos"}
              goal="Meta ≥ 90%"
              comparison={inventoryHasData ? `${points(atpPct - 90)} vs. meta` : "Sin inventario al cierre"}
              status={!inventoryHasData ? "neutral" : atpPct >= 90 ? "good" : "warning"}
              icon={Boxes}
              help="ATP es el inventario liberado y vigente que queda disponible después de descontar las reservas activas."
              progress={atpPct}
              target={90}
            />
            <DashboardKpi
              label="SKU que requieren reposición"
              value={`${dashboardLow.length} de ${dashboardPlanning.length}`}
              secondary={`SKU · ${percent(lowPct)}`}
              goal="Meta ≤ 10% de SKU evaluados"
              comparison={dashboardPlanning.length ? `${points(lowPct - 10)} vs. meta` : "Sin posiciones al cierre"}
              status={!dashboardPlanning.length ? "neutral" : lowPct <= 10 ? "good" : "warning"}
              icon={Activity}
              help="ROP es el punto de reorden: demanda diaria × plazo de reposición + stock de seguridad."
              progress={Math.min(100, lowPct)}
              target={10}
              inverse
            />
            <DashboardKpi
              label="Exactitud del inventario"
              value={accuracyHasData ? percent(accuracyPct) : "Sin datos"}
              goal="Meta ≥ 95%"
              comparison={accuracyHasData ? `${points(accuracyPct - 95)} vs. meta` : "Sin conteos aprobados al cierre"}
              status={!accuracyHasData ? "neutral" : accuracyPct >= 95 ? "good" : "warning"}
              icon={ShieldCheck}
              help="Exactitud = 100% menos la diferencia absoluta entre el saldo teórico y el último conteo aprobado."
              progress={accuracyPct}
              target={95}
            />
          </div>

          <div className="dashboard-analytics">
            <section
              className={`dashboard-card dashboard-trend-card ${expandedPanel === "trend" ? "expanded" : ""}`}
            >
              <div className="dashboard-card-heading">
                <div>
                  <h3>Evolución de indicadores</h3>
                  <p>
                    {date(dashboardFilters.start)} – {date(dashboardFilters.end)}
                    {' · '}porcentaje de cumplimiento
                  </p>
                </div>
                <div className="dashboard-card-meta">
                  <div className="chart-legend">
                    <span><i className="legend-atp" /> ATP</span>
                    <span><i className="legend-accuracy" /> Exactitud</span>
                    <span><i className="legend-target" /> Metas 90% / 95%</span>
                  </div>
                  <button
                    className="dashboard-detail-link"
                    onClick={() => navigate("Indicadores")}
                  >
                    Ver detalle
                  </button>
                  <button
                    className="dashboard-expand-button"
                    aria-label={expandedPanel === "trend" ? "Restaurar gráfica" : "Ampliar gráfica"}
                    onClick={() =>
                      setExpandedPanel(expandedPanel === "trend" ? "" : "trend")
                    }
                  >
                    {expandedPanel === "trend" ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </button>
                </div>
              </div>
              {dashboardInventory.length ? (
                <DashboardTrend points={trendPoints} />
              ) : (
                <div className="dashboard-chart-empty">
                  <Boxes size={24} />
                  <strong>Sin inventario en este alcance</strong>
                  <span>Prueba otra planta, almacén, categoría o SKU.</span>
                </div>
              )}
              <small className="dashboard-chart-note">
                ATP se reconstruye con movimientos confirmados y exactitud usa
                conteos aprobados. Metas: ATP 90% y exactitud 95%. El control
                FEFO permanece en Reservas y Preparación FIFO/FEFO.
              </small>
            </section>

            <section
              className={`dashboard-card dashboard-risk-card ${expandedPanel === "risk" ? "expanded" : ""}`}
            >
              <div className="dashboard-card-heading">
                <div>
                  <h3>Riesgo por planta</h3>
                  <p>Resumen consolidado de sus almacenes seleccionados.</p>
                </div>
                <div className="dashboard-card-meta">
                  <button
                    className="dashboard-detail-link"
                    onClick={() => navigate("Punto de reorden")}
                  >
                    Ver detalle <ArrowUpRight size={13} />
                  </button>
                  <button
                    className="dashboard-expand-button"
                    aria-label={expandedPanel === "risk" ? "Restaurar riesgo por planta" : "Ampliar riesgo por planta"}
                    onClick={() =>
                      setExpandedPanel(expandedPanel === "risk" ? "" : "risk")
                    }
                  >
                    {expandedPanel === "risk" ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </button>
                </div>
              </div>
              <div className="risk-legend">
                <span><i className="risk-rop" /> SKU–almacén bajo ROP / evaluados</span>
                <span><i className="risk-affected" /> Brecha hasta ROP (u.)</span>
              </div>
              <div className="risk-bars">
                {dashboardRisk.map((row: Row) => (
                  <button
                    type="button"
                    className="risk-row"
                    key={row.id}
                    title={`Filtrar el tablero por la planta ${row.name}`}
                    aria-label={`Filtrar el tablero por la planta ${row.name}`}
                    onClick={() => {
                      const next = {
                        ...dashboardFilters,
                        plant: row.plant,
                        warehouse: "Todos",
                      };
                      setDashboardDraft(next);
                      setDashboardFilters(next);
                      setDismissedAlert("");
                    }}
                  >
                    <strong>{row.name}</strong>
                    <div>
                      <span
                        className="risk-rop"
                        style={{
                          width: `${row.riskPct}%`,
                        }}
                      />
                    </div>
                    <b title={`${row.belowRop} SKU bajo ROP de ${row.evaluated} evaluados`}>
                      {row.belowRop}/{row.evaluated}
                    </b>
                    <div>
                      <span
                        className="risk-affected"
                        style={{
                          width: `${(row.gap / dashboardRiskGapMax) * 100}%`,
                        }}
                      />
                    </div>
                    <b>{fmt(row.gap)}</b>
                  </button>
                ))}
                {!dashboardRisk.length && (
                  <div className="dashboard-empty">Sin plantas para los filtros aplicados.</div>
                )}
              </div>
              <small className="dashboard-chart-note">
                Bajo ROP es una alerta: ATP local ≤ punto de reorden. En las posiciones
                posiciones SKU–almacén evaluadas hay {dashboardRiskBelowTotal} críticas de {dashboardRiskEvaluatedTotal};
                faltan {fmt(dashboardRiskGapTotal)} unidades para alcanzar sus ROP.
              </small>
            </section>
          </div>

          <section
            className={`dashboard-card dashboard-priorities ${expandedPanel === "priorities" ? "expanded" : ""}`}
          >
            <div className="dashboard-card-heading">
              <div>
                <h3>Inventario y acciones prioritarias</h3>
                <p>
                  {dashboardIsConsolidated
                    ? `${dashboardRows.length} prioridades visibles de ${dashboardRowsAll.filter((row: Row) => row.severity > 0).length} pendientes`
                    : `${dashboardRowsAll.length} posiciones del alcance · ${dashboardRowsAll.filter((row: Row) => row.severity > 0).length} requieren atención`}
                </p>
              </div>
              <div className="dashboard-card-meta">
                <span className="dashboard-order"><Filter size={13} /> Orden: criticidad</span>
                <button
                  className="dashboard-expand-button"
                  aria-label={expandedPanel === "priorities" ? "Restaurar tabla" : "Ampliar tabla"}
                  onClick={() =>
                    setExpandedPanel(
                      expandedPanel === "priorities" ? "" : "priorities",
                    )
                  }
                >
                  {expandedPanel === "priorities" ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Planta / centro</th>
                    <th>Disponibilidad</th>
                    <th>Diagnóstico</th>
                    <th>Seguimiento</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardRows.map((row) => (
                    <tr
                      key={row.id}
                      className={row.severity === 2 ? "dashboard-critical-row" : ""}
                    >
                      <td>
                        <strong>{row.article?.name || row.article}</strong>
                        <small>{row.article_id} · {row.article?.unit || row.unit}</small>
                      </td>
                      <td>{warehouseById.get(row.warehouse_id)?.name || row.warehouse_id}</td>
                      <td className={number(row.atpRatio) < 90 ? "metric-danger" : ""}>
                        <strong>ATP {fmt(row.available)} · {percent(row.atpRatio)}</strong>
                        <small>Físico {fmt(row.physical)} · ROP {fmt(row.rop)}</small>
                      </td>
                      <td>
                        <span className={`dashboard-status severity-${row.severity}`}>
                          {row.statusText}
                        </span>
                      </td>
                      <td>
                        <strong>{row.workflow}</strong>
                        <small>{row.owner}</small>
                      </td>
                      <td>
                        <div className="dashboard-row-actions">
                          <button onClick={() => setDetail(row)}>Ver detalle</button>
                          {row.issue !== "ok" ? (
                            <button
                              className="dashboard-recommendation"
                              onClick={() =>
                                row.issue === "atp"
                                  ? setCoverage(row)
                                  : row.issue === "accuracy"
                                    ? reviewDashboardCount(row)
                                  : row.issue === "rop"
                                    ? openRopForRow(row)
                                    : navigate(row.actionPage)
                              }
                            >
                              {row.actionLabel}
                            </button>
                          ) : (
                            <span>Sin acción requerida</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!dashboardRows.length && (
                    <tr>
                      <td colSpan={6} className="dashboard-empty">
                        No hay inventario para los filtros aplicados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="dashboard-method-note">
            Datos del prototipo · métricas calculadas desde artículos, lotes,
            ubicaciones, saldos, reservas y movimientos sin duplicar el dato
            maestro.
          </div>
        </div>
      );
    if (page === "Existencias")
      return (
        <>
          <div className="notice-strip">
            <ShieldCheck size={17} />
            <span>
              <b>Existencias = saldos por ubicación.</b> Cada fila muestra un
              lote en una ubicación concreta. Si el mismo lote está en dos
              ubicaciones, aquí aparece dos veces.
              <small>
                Ejemplo: PT-2601 identifica una partida o lote; PT-A1 y CD-A1
                identifican posiciones internas. Solo los lotes liberados y no
                vencidos aportan ATP.
              </small>
            </span>
          </div>
          <div className="filters">
            <label>
              Planta o centro operativo
              <select
                value={plantFilter}
                onChange={(event) => {
                  setPlantFilter(event.target.value);
                  setWh("Todos");
                }}
              >
                <option value="Todas">Todas las plantas</option>
                {(data.warehouses || []).map((warehouse: Row) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}{warehouse.center ? ` — ${warehouse.center}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Calidad
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
              >
                {[
                  "Todos",
                  "LIBERADO",
                  "CUARENTENA",
                  "BLOQUEADO",
                  "RECHAZADO",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <span className="muted">
              {filtered.length} posiciones · {new Set(filtered.map((row: Row) => row.lot_id)).size} lotes · {new Set(filtered.map((row: Row) => row.article_id)).size} SKU
            </span>
          </div>
          <section className="panel">
            <div className="tabs">
              {[
                "Todas",
                "Materia prima",
                "Envases",
                "Producto terminado",
                "Repuestos",
              ].map((x) => (
                <button
                  key={x}
                  className={category === x ? "active" : ""}
                  onClick={() => setCategory(x)}
                >
                  {x}
                </button>
              ))}
            </div>
            {inventoryTable()}
          </section>
          <div className="footnote">
            Las reservas sobre un lote retenido se mantienen identificadas, pero
            no pueden despacharse. No sumes unidades de artículos distintos.
          </div>
        </>
      );
    if (["Lotes", "Lotes pendientes", "Consulta por lote"].includes(page))
      return (
        <>
          <div className="notice-strip">
            <Layers3 size={17} />
            <span>
              <b>Lotes = identidad y trazabilidad de la partida.</b> Cada fila
              identifica un lote único, aunque esté repartido entre varias
              ubicaciones; sus cantidades se consolidan aquí.
              <small>
                Ejemplo: PT-2601 permanece como un solo lote aunque una parte
                esté en Producto terminado A1 y otra en Distribución A1.
              </small>
            </span>
          </div>
          <div className="filters">
            <label>
              Planta o centro operativo
              <select
                value={plantFilter}
                onChange={(event) => {
                  setPlantFilter(event.target.value);
                  setWh("Todos");
                }}
              >
                <option value="Todas">Todas las plantas</option>
                {(data.warehouses || []).map((warehouse: Row) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}{warehouse.center ? ` — ${warehouse.center}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Estado del lote
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
              >
                {[
                  "Todos",
                  "LIBERADO",
                  "CUARENTENA",
                  "BLOQUEADO",
                  "RECHAZADO",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <span className="muted">
              {filteredLots.length} lotes · {filteredLots.reduce((total: number, row: Row) => total + number(row.position_count), 0)} posiciones · {new Set(filteredLots.map((row: Row) => row.article_id)).size} SKU
            </span>
          </div>
          <section className="panel">
            <div className="panel-heading lot-summary">
              <div>
                <h3>Maestro operativo de lotes</h3>
                <p>
                  Una fila por lote; el total físico agrega sus posiciones sin
                  perder la separación por artículo. Un lote puede aparecer en
                  varias ubicaciones sin convertirse en varios lotes.
                </p>
              </div>
              <div className="summary-pills">
                <Badge
                  value={`${filteredLots.filter((r) => r.quality === "LIBERADO").length} LIBERADOS`}
                />
                <Badge
                  value={`${filteredLots.filter((r) => r.quality !== "LIBERADO").length} RETENIDOS`}
                />
              </div>
            </div>
            {lotsTable()}
          </section>
          <div className="footnote">
            Para consultar cuánto queda en una ubicación concreta utiliza
            Existencias. Para revisar la identidad, procedencia y ciclo de vida
            utiliza Lotes.
          </div>
          {page === "Consulta por lote" && (
            <section className="panel">
              <div className="panel-heading">
                <h3>Genealogía de producción</h3>
              </div>
              {generic(data.genealogy, [
                "parent_lot",
                "child_lot",
                "document_id",
                "quantity",
              ])}
            </section>
          )}
        </>
      );
    if (page === "Artículos" || page === "Políticas FIFO/FEFO")
      return (
        <section className="panel">
          {generic(
            data.articles,
            ["id", "name", "category", "unit", "policy", "abc"],
            (r) =>
              can("maestros") &&
              compact("Política / ROP", () => action("policy", r)),
          )}
        </section>
      );
    if (page === "Proveedores")
      return (
        <section className="panel">
          {generic(data.suppliers, ["id", "name", "contact"])}
        </section>
      );
    if (page === "Ubicaciones")
      return (
        <section className="panel">
          {generic(data.locations, ["id", "name", "warehouse_id"])}
        </section>
      );
    if (page === "Almacenes")
      return (
        <section className="panel">
          {generic(data.warehouses, ["id", "name"])}
        </section>
      );
    if (page === "Usuarios")
      return (
        <section className="panel">
          {generic(
            data.users || [],
            ["username", "name", "role_id", "active"],
            (r) => compact("Editar acceso", () => action("user", r)),
          )}
        </section>
      );
    if (page === "Roles y permisos")
      return (
        <section className="panel">
          {generic(data.roles || [], ["id", "name", "permissions"])}
        </section>
      );
    if (page === "Auditoría")
      return (
        <section className="panel">
          {generic(data.audit || [], [
            "created_at",
            "actor",
            "action",
            "detail",
          ])}
        </section>
      );
    if (page === "Solicitudes de compra")
      return <section className="panel">{documents("SOLICITUD")}</section>;
    if (page === "Órdenes de compra")
      return <section className="panel">{documents("COMPRA")}</section>;
    if (page === "Traslados")
      return <section className="panel">{documents("TRASLADO")}</section>;
    if (page === "Órdenes de producción")
      return (
        <>
          <div className="notice-strip">
            <Factory size={18} />
            La producción consume material reservado. El producto queda en
            cuarentena. La merma es opcional y separada.
          </div>
          <section className="panel">{documents("PRODUCCION")}</section>
        </>
      );
    if (page === "Pedidos" || page === "Salidas y entregas")
      return (
        <>
          <div className="notice-strip">
            <Truck size={18} />
            <span>
              <b>Una reserva compromete ATP, pero todavía no descuenta el físico.</b>
              <small>
                Confirmar salida consume la reserva y descuenta el inventario; cancelar el pedido libera la cantidad comprometida. La promesa solo calcula una fecha estimada.
              </small>
            </span>
          </div>
          <div className="filters order-filters">
            <label>
              Planta o centro
              <select
                aria-label="Filtrar pedidos por planta"
                value={orderPlant}
                onChange={(event) => {
                  setOrderPlant(event.target.value);
                  setOrderWarehouse("Todos");
                }}
              >
                <option value="Todas">Todas las plantas</option>
                {dashboardPlants.map((plant) => <option key={plant}>{plant}</option>)}
              </select>
            </label>
            <label>
              Almacén
              <select
                aria-label="Filtrar pedidos por almacén"
                value={orderWarehouse}
                onChange={(event) => setOrderWarehouse(event.target.value)}
              >
                <option value="Todos">Todos los almacenes</option>
                {(data.warehouses || [])
                  .filter((warehouse: Row) => orderPlant === "Todas" || warehouse.center === orderPlant)
                  .map((warehouse: Row) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </label>
            <label>
              Artículo
              <select
                aria-label="Filtrar pedidos por artículo"
                value={orderArticle}
                onChange={(event) => setOrderArticle(event.target.value)}
              >
                <option value="Todos">Todos los artículos</option>
                {(data.articles || []).map((article: Row) => <option key={article.id} value={article.id}>{article.id} · {article.name}</option>)}
              </select>
            </label>
            <label>
              Estado
              <select
                aria-label="Filtrar pedidos por estado"
                value={orderStatus}
                onChange={(event) => setOrderStatus(event.target.value)}
              >
                {["Todos", "PENDIENTE", "RESERVADO", "DESPACHADO", "ENTREGADO", "CANCELADO"].map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <span className="muted">
              {filteredOrderRows.length} pedidos · {fmt(visibleCommitted)} {orderArticle === "Todos" ? "unidades" : articleById.get(orderArticle)?.unit || "u."} comprometidas
            </span>
          </div>
          <section className="panel">{documents("PEDIDO", filteredOrderRows)}</section>
        </>
      );
    if (page === "Reservas" || page === "Preparación FIFO/FEFO")
      return (
        <section className="panel">
          {generic(data.reservations, [
            "document_id",
            "lot_id",
            "location_id",
            "quantity",
            "status",
            "explanation",
          ])}
        </section>
      );
    if (page === "Movimientos" || page === "Mermas y ajustes")
      return (
        <section className="panel">
          {generic(
            data.movements.filter(
              (r: Row) => page === "Movimientos" || /MERMA|AJUSTE/.test(r.type),
            ),
            [
              "created_at",
              "type",
              "lot_id",
              "location_id",
              "quantity",
              "document_id",
              "reason",
              "actor",
            ],
          )}
        </section>
      );
    if (page === "Conteos y diferencias")
      return (
        <>
          <div className="notice-strip">
            <ClipboardCheck size={18} />
            <span>
              <b>El conteo vigente identifica la diferencia; el historial conserva la auditoría.</b>
              <small>
                Ante una diferencia aprobada, inicia un reconteo independiente para verificar el saldo actual. El nuevo registro queda pendiente hasta que otro usuario autorice el ajuste.
              </small>
            </span>
          </div>
          <div className="filters count-filters">
            <label>
              Planta o centro
              <select
                aria-label="Filtrar conteos por planta"
                value={countPlant}
                onChange={(event) => {
                  setCountPlant(event.target.value);
                  setCountWarehouse("Todos");
                }}
              >
                <option value="Todas">Todas las plantas</option>
                {[...new Set(countRows.map((row: Row) => row.plant_name).filter(Boolean))].map(
                  (plant) => <option key={plant} value={plant}>{plant}</option>,
                )}
              </select>
            </label>
            <label>
              Almacén
              <select
                aria-label="Filtrar conteos por almacén"
                value={countWarehouse}
                onChange={(event) => setCountWarehouse(event.target.value)}
              >
                <option value="Todos">Todos los almacenes</option>
                {(data.warehouses || [])
                  .filter(
                    (warehouse: Row) =>
                      countPlant === "Todas" || warehouse.center === countPlant,
                  )
                  .map((warehouse: Row) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                  ))}
              </select>
            </label>
            <label>
              Estado
              <select
                aria-label="Filtrar conteos por estado"
                value={countStatus}
                onChange={(event) => setCountStatus(event.target.value)}
              >
                {[
                  "Todos",
                  "PENDIENTE",
                  "APROBADO",
                  "RECHAZADO",
                ].map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <span className="muted">
              {filteredCountRows.length} conteos visibles · {filteredCountRows.filter((row: Row) => number(row.absoluteDifference) > 0).length} con diferencia
            </span>
          </div>
          <section className="panel count-panel">
            <div className="tabs count-tabs">
              {[
                ["attention", "Requieren atención"],
                ["current", "Conteos vigentes"],
                ["history", "Historial completo"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={countView === value ? "active" : ""}
                  onClick={() => setCountView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="table-wrap count-table-wrap">
              <table className="count-table">
                <thead>
                  <tr>
                    <th>Lote / artículo</th>
                    <th>Planta y almacén</th>
                    <th>Ubicación</th>
                    <th>Teórico</th>
                    <th>Contado</th>
                    <th>Diferencia</th>
                    <th>Exactitud</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCountRows.map((row: Row) => (
                    <tr key={row.id} className={number(row.absoluteDifference) > 0 ? "count-difference-row" : ""}>
                      <td>
                        <strong>{row.lot_id}</strong>
                        <small>{row.article_name} · {row.unit}</small>
                      </td>
                      <td>
                        <strong>{row.plant_name}</strong>
                        <small>{row.warehouse_name}</small>
                      </td>
                      <td>{row.location_name}</td>
                      <td>{fmt(row.theoretical)}</td>
                      <td>{fmt(row.counted)}</td>
                      <td className={number(row.absoluteDifference) > 0 ? "metric-danger" : ""}>
                        <strong>{number(row.difference) > 0 ? "+" : ""}{fmt(row.difference)}</strong>
                      </td>
                      <td>{percent(row.accuracy)}</td>
                      <td><Badge value={row.status} /></td>
                      <td>
                        {row.status === "PENDIENTE" && can("aprobar_ajustes")
                          ? compact("Aprobar ajuste", () => action("count.approve", row))
                          : number(row.absoluteDifference) > 0
                            ? compact("Iniciar reconteo", () => action("recount", row))
                            : <span className="muted">Sin acción requerida</span>}
                      </td>
                    </tr>
                  ))}
                  {!filteredCountRows.length && (
                    <tr><td colSpan={9} className="dashboard-empty">No hay conteos que coincidan con los filtros.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      );
    if (page === "Historial de decisiones")
      return (
        <section className="panel">
          {generic(
            (data.qualityHistory || data.audit || []).filter(
              (r: Row) => r.action === "quality.decision",
            ),
            ["created_at", "actor", "detail"],
          )}
        </section>
      );
    if (page === "Stock en tránsito")
      return (
        <>
          <div className="notice-strip">
            <Truck size={18} />
            Tránsito no es disponibilidad para despacho. La compra pendiente no
            se suma al físico hasta su recepción.
          </div>
          <section className="panel">
            {table(
              data.documents.filter((d: Row) =>
                ["TRANSITO", "PARCIAL"].includes(d.status),
              ),
              [
                { key: "id", label: "Documento" },
                { key: "kind", label: "Origen" },
                {
                  key: "status",
                  label: "Estado",
                  render: (r) => <Badge value={r.status} />,
                },
                {
                  key: "quantity",
                  label: "Pendiente",
                  render: (r) =>
                    fmt(Number(r.data.quantity) - Number(r.data.received || 0)),
                },
                {
                  key: "data",
                  label: "Referencia",
                  render: (r) => r.data.articleId || r.data.lotId,
                },
              ],
            )}
          </section>
        </>
      );
    if (page === "Punto de reorden" || page === "Indicadores") {
      const ropWarehouseIds = new Set(
        (data.warehouses || [])
          .filter(
            (warehouse: Row) =>
              (ropPlant === "Todas" || warehouse.center === ropPlant) &&
              (ropWarehouse === "Todos" || warehouse.id === ropWarehouse),
          )
          .map((warehouse: Row) => warehouse.id),
      );
      const scopedInventory = (data.inventory || []).filter((row: Row) =>
        ropWarehouseIds.has(row.warehouse_id),
      );
      const replenishmentGroups = Array.from(
        scopedInventory
          .reduce((groups: Map<string, Row>, item: Row) => {
            const key = `${item.article_id}:${item.warehouse_id}`;
            const group = groups.get(key) || {
              id: key,
              articleId: item.article_id,
              warehouse_id: item.warehouse_id,
              positions: [],
            };
            group.positions.push(item);
            groups.set(key, group);
            return groups;
          }, new Map<string, Row>())
          .values(),
      ) as Row[];
      const replenishmentRows = replenishmentGroups
        .filter((group: Row) => ropArticle === "Todos" || group.articleId === ropArticle)
        .map((group: Row) => {
          const article = articleById.get(group.articleId) || {};
          const warehouse = warehouseById.get(group.warehouse_id) || {};
          const available = (group.positions || []).reduce(
            (sum: number, item: Row) => sum + number(item.available),
            0,
          );
          // El documento de compra actual no identifica almacén destino. No se
          // atribuye tránsito global a una planta para evitar una cobertura falsa.
          const incoming = 0;
          const rop =
            number(article.daily_demand) * number(article.lead_days) +
            number(article.safety_stock);
          const position = available + incoming;
          const noAtp = available <= 0;
          const underRop = position <= rop;
          const gap = Math.max(0, rop - position);
          const suggestion = (data.suggestions || []).find(
            (item: Row) => item.article_id === group.articleId && item.status === "ABIERTA",
          );
          const recommendation =
            noAtp && !underRop && incoming > 0
              ? "Acelerar la recepción confirmada"
              : noAtp && underRop
                ? "Priorizar compra y recuperar ATP"
                : underRop
                  ? "Generar sugerencia de reposición"
                  : "Sin acción requerida";
          return {
            ...article,
            id: group.id,
            articleId: group.articleId,
            warehouse_id: group.warehouse_id,
            warehouseName: warehouse.name || group.warehouse_id,
            plant: warehouse.center || "—",
            available,
            incoming,
            position,
            rop,
            gap,
            noAtp,
            underRop,
            suggestion,
            recommendation,
            priority: noAtp ? 2 : underRop ? 1 : 0,
          };
        })
        .sort(
          (a: Row, b: Row) =>
            b.priority - a.priority || b.gap - a.gap ||
            a.name.localeCompare(b.name) || a.warehouseName.localeCompare(b.warehouseName),
        );
      const noAtpCount = replenishmentRows.filter((row: Row) => row.noAtp).length;
      const lowWithAtpCount = replenishmentRows.filter(
        (row: Row) => row.underRop && !row.noAtp,
      ).length;
      const underRopCount = replenishmentRows.filter((row: Row) => row.underRop).length;
      const coveredCount = replenishmentRows.filter(
        (row: Row) => !row.noAtp && !row.underRop,
      ).length;
      const attentionCount = replenishmentRows.filter(
        (row: Row) => row.noAtp || row.underRop,
      ).length;
      const visibleRows = replenishmentRows.filter((row: Row) => {
        if (replenishmentView === "no-atp") return row.noAtp;
        if (replenishmentView === "low-rop") return row.underRop && !row.noAtp;
        if (replenishmentView === "covered") return !row.noAtp && !row.underRop;
        if (replenishmentView === "all") return true;
        return row.noAtp || row.underRop;
      });
      const openSuggestions = (data.suggestions || []).filter(
        (row: Row) =>
          row.status === "ABIERTA" &&
          replenishmentRows.some((item: Row) => item.articleId === row.article_id),
      );
      return (
        <>
          <div className="filters rop-filters">
            <label>
              Planta o centro
              <select
                aria-label="Filtrar ROP por planta"
                value={ropPlant}
                onChange={(event) => {
                  setRopPlant(event.target.value);
                  setRopWarehouse("Todos");
                  setRopArticle("Todos");
                }}
              >
                <option value="Todas">Todas las plantas</option>
                {dashboardPlants.map((plant) => <option key={plant}>{plant}</option>)}
              </select>
            </label>
            <label>
              Almacén
              <select
                aria-label="Filtrar ROP por almacén"
                value={ropWarehouse}
                onChange={(event) => {
                  setRopWarehouse(event.target.value);
                  setRopArticle("Todos");
                }}
              >
                <option value="Todos">Todos los almacenes</option>
                {(data.warehouses || [])
                  .filter((warehouse: Row) => ropPlant === "Todas" || warehouse.center === ropPlant)
                  .map((warehouse: Row) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </label>
            <label>
              Artículo
              <select
                aria-label="Filtrar ROP por artículo"
                value={ropArticle}
                onChange={(event) => setRopArticle(event.target.value)}
              >
                <option value="Todos">Todos los artículos</option>
                {(data.articles || [])
                  .filter((article: Row) =>
                    scopedInventory.some((item: Row) => item.article_id === article.id),
                  )
                  .map((article: Row) => (
                    <option key={article.id} value={article.id}>
                      {article.id} · {article.name}
                    </option>
                  ))}
              </select>
            </label>
            <span className="muted">
              {replenishmentRows.length} SKU evaluados en el alcance seleccionado
            </span>
          </div>
          <section className="rop-action-banner">
            <div className="rop-action-icon"><Activity size={22} /></div>
            <div>
              <span className="eyebrow">ACCIÓN REQUERIDA</span>
              <h2>{attentionCount} artículos requieren intervención</h2>
              <p>
                {noAtpCount} sin ATP y {lowWithAtpCount} con ATP pero bajo ROP.
                Atiende primero la falta inmediata y luego recupera la cobertura.
              </p>
            </div>
            {can("compras") && attentionCount > 0 &&
              btn(
                "Preparar prioridad principal",
                () => prepareReplenishmentRequest(replenishmentRows[0] as Row),
                true,
              )}
          </section>

          <div className="rop-kpis">
            <article className="rop-kpi critical">
              <span>Sin ATP</span><strong>{noAtpCount}</strong>
              <small>Disponibilidad prometible igual a cero</small>
            </article>
            <article className="rop-kpi warning">
              <span>Bajo ROP</span><strong>{underRopCount}</strong>
              <small>Posición ≤ punto de reorden; incluye los sin ATP</small>
            </article>
            <article className="rop-kpi neutral">
              <span>Sugerencias abiertas</span><strong>{openSuggestions.length}</strong>
              <small>Recomendaciones pendientes de decisión de Compras</small>
            </article>
            <article className="rop-kpi good">
              <span>Cubiertos</span><strong>{coveredCount}</strong>
              <small>ATP disponible y posición por encima del ROP</small>
            </article>
          </div>

          <section className="panel rop-panel">
            <div className="panel-heading rop-heading">
              <div>
                <h3>Prioridades de reposición</h3>
                <p>Ordenadas por urgencia y brecha. La vista inicial oculta lo cubierto.</p>
              </div>
              <div className="rop-status-guide">
                <span className="critical">Sin ATP: urgencia inmediata</span>
                <span className="warning">Bajo ROP: recuperar cobertura</span>
                <span className="good">Cubierto: sin acción</span>
              </div>
            </div>
            <div className="tabs rop-tabs">
              {[
                ["attention", `Atención requerida (${attentionCount})`],
                ["no-atp", `Sin ATP (${noAtpCount})`],
                ["low-rop", `Bajo ROP con ATP (${lowWithAtpCount})`],
                ["covered", `Cubiertos (${coveredCount})`],
                ["all", `Todos (${replenishmentRows.length})`],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={replenishmentView === value ? "active" : ""}
                  onClick={() => setReplenishmentView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {table(
              visibleRows,
              [
                {
                  key: "name",
                  label: "Artículo / SKU",
                  render: (r) => <><strong>{r.name}</strong><small>{r.articleId} · {r.unit}</small></>,
                },
                {
                  key: "warehouseName",
                  label: "Planta / almacén",
                  render: (r) => <><strong>{r.warehouseName}</strong><small>{r.plant}</small></>,
                },
                { key: "available", label: "ATP", render: (r) => <strong>{fmt(r.available)}</strong> },
                { key: "incoming", label: "Por recibir", render: (r) => fmt(r.incoming) },
                { key: "position", label: "Posición", render: (r) => fmt(r.position) },
                { key: "rop", label: "ROP", render: (r) => <strong>{fmt(r.rop)}</strong> },
                {
                  key: "gap",
                  label: "Brecha",
                  render: (r) => <span className={r.gap > 0 ? "metric-danger" : ""}>{fmt(r.gap)}</span>,
                },
                {
                  key: "state",
                  label: "Diagnóstico",
                  render: (r) => (
                    <div className="rop-diagnosis">
                      <span className={r.noAtp ? "critical" : "good"}>
                        {r.noAtp ? "SIN ATP" : "ATP DISPONIBLE"}
                      </span>
                      <span className={r.underRop ? "warning" : "good"}>
                        {r.underRop ? "BAJO ROP" : "CUBIERTO"}
                      </span>
                    </div>
                  ),
                },
                { key: "recommendation", label: "Acción recomendada" },
              ],
              (r) =>
                r.noAtp && !r.underRop && r.incoming > 0 ? (
                  compact("Revisar recepción", () => navigate("Órdenes de compra"))
                ) : r.underRop ? (
                  compact("Preparar solicitud", () => prepareReplenishmentRequest(r))
                ) : (
                  <span className="rop-no-action">Sin acción</span>
                ),
            )}
          </section>

          <details className="rop-method">
            <summary>Cómo se calcula y por qué ATP no es lo mismo que ROP</summary>
            <div>
              <p><strong>ATP</strong> es la cantidad libre que puede prometerse hoy.</p>
              <p><strong>Posición</strong> = ATP + compras confirmadas pendientes.</p>
              <p><strong>ROP</strong> = demanda diaria × plazo + stock de seguridad.</p>
              <p>Sin ATP exige recuperar disponibilidad inmediata. Bajo ROP exige reponer. Si una compra confirmada cubre el ROP, no se duplica la compra: se acelera su recepción.</p>
            </div>
          </details>
        </>
      );
    }
    if (page === "Conciliación")
      return (
        <>
          <div className="notice-strip">
            <ShieldCheck size={18} />
            Compara saldo físico contra suma de movimientos y reservas contra
            asignaciones activas. Detecta diferencias: no genera ajustes
            automáticos.
          </div>
          <section className="panel">
            {generic(data.reconciliation || [], [
              "lot_id",
              "location_id",
              "physical",
              "ledger",
              "difference",
              "reserved",
              "reservation_total",
              "reservation_difference",
            ])}
          </section>
        </>
      );
    if (page === "Mensajería")
      return (
        <>
          <div className="notice-strip">
            <Zap size={18} />
            <span>
              Modo{" "}
              <b>
                {data.integration.mode === "rabbitmq"
                  ? "RabbitMQ local"
                  : "cola PostgreSQL + destino simulado"}
              </b>
              . No hay conexión real con MES, BEES o ePOD.
            </span>
          </div>
          <div className="flow-strip">
            {[
              "Entrada validada",
              "Inbox · deduplicación",
              "Inventario · transacción",
              "Outbox · pendiente",
              "Worker · entrega",
            ].map((x, i) => (
              <React.Fragment key={x}>
                <div>
                  <span>0{i + 1}</span>
                  {x}
                </div>
                {i < 4 && <ArrowRight size={18} />}
              </React.Fragment>
            ))}
          </div>
          <div className="integration-actions">
            {btn(
              data.integration.simulateFailure
                ? "Restaurar destino"
                : "Simular caída del destino",
              async () => {
                await api("worker", token, {
                  fail: !data.integration.simulateFailure,
                });
                await refresh();
              },
            )}
            {btn("Procesar pendientes", async () => {
              await api("worker", token, {});
              await refresh();
            })}
            {btn("Simular pedido BEES", () =>
              show(
                "order.create",
                "Pedido desde BEES simulado",
                [
                  field("id", "Pedido externo", "text", reference("BEES")),
                  field(
                    "customer",
                    "Cliente",
                    "text",
                    "Cliente demostrativo BEES",
                  ),
                  select("articleId", "Artículo", "articles"),
                  select("warehouseId", "Almacén", "warehouses"),
                  field("quantity", "Cantidad", "number", 10),
                ],
                {},
                "Simulador local que usa el mismo contrato validado y la misma deduplicación que una integración.",
                "BEES_SIMULADO",
              ),
            )}
            {lastEvent &&
              btn("Reenviar último evento", () =>
                send(
                  lastEvent.action,
                  lastEvent.data,
                  lastEvent.source,
                  lastEvent.eventId,
                ),
              )}
          </div>
          {data.integration.lastError && (
            <div className="error-inline">{data.integration.lastError}</div>
          )}
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h3>Outbox · mensajes de salida</h3>
                <p>
                  El worker comunica hechos ya confirmados. No vuelve a
                  descontar existencias.
                </p>
              </div>
              <Badge value={pending + " PENDIENTES"} />
            </div>
            {generic(
              data.outbox || [],
              ["event_type", "destination", "status", "attempts", "last_error"],
              (r) =>
                r.status === "REVISION" &&
                compact("Reintentar", () =>
                  send("outbox.retry", {
                    id: r.id,
                    retryRef: crypto.randomUUID(),
                  }),
                ),
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h3>Inbox · mensajes recibidos</h3>
            </div>
            {generic(data.inbox || [], [
              "source",
              "event_id",
              "business_key",
              "status",
              "attempts",
            ])}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h3>Confirmaciones del consumidor simulado</h3>
            </div>
            {generic(data.deliveries || [], [
              "event_id",
              "destination",
              "received_at",
            ])}
          </section>
        </>
      );
    return null;
  }
  const creation: Record<string, [string, string]> = {
    Usuarios: ["user", "Crear usuario"],
    "Roles y permisos": ["role", "Crear rol"],
    Almacenes: ["warehouse", "Nuevo almacén"],
    Artículos: ["article", "Nuevo artículo"],
    Proveedores: ["supplier", "Nuevo proveedor"],
    Ubicaciones: ["location", "Nueva ubicación"],
    "Solicitudes de compra": ["request", "Nueva solicitud"],
    "Órdenes de compra": ["purchase", "Nueva orden"],
    Existencias: ["receipt", "Registrar recepción"],
    Traslados: ["transfer", "Crear traslado"],
    "Conteos y diferencias": ["count", "Nuevo conteo"],
    "Mermas y ajustes": ["merma", "Registrar merma"],
    "Órdenes de producción": ["production", "Nueva orden"],
    Pedidos: ["order", "Nuevo pedido"],
  };
  const pageDescription: Record<string, string> = {
    Existencias:
      "Cantidades físicas, reservadas y disponibles por artículo, lote y ubicación.",
    Lotes:
      "Identidad, origen, fechas, estado de calidad y trazabilidad de cada lote.",
    "Lotes pendientes":
      "Lotes en cuarentena que esperan una decisión del Equipo de Calidad.",
    "Consulta por lote":
      "Historia, movimientos y genealogía de un lote a través del ERP.",
  };
  return (
    <div className="app">
      {mobile && (
        <button
          className="mobile-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        id="main-navigation"
        className={"sidebar " + (mobile ? "visible" : "")}
      >
        <div className="brand">
          <CbnBrand product="ERP" />
          <small>INVENTARIO & OPERACIONES</small>
        </div>
        <div className="workspace">
          <span className="live-dot" />
          <div>
            Planta piloto<small>Una línea · un centro de distribución</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="nav-label">ESPACIO DE TRABAJO</div>
        <nav>
          {Object.entries(sections).map(([g, items]) => {
            if (
              (g === "Administración" && !can("admin")) ||
              (g === "Integraciones" && !can("integraciones"))
            )
              return null;
            const Icon = icons[g];
            return (
              <div key={g}>
                <button
                  className={"nav-item " + (group === g ? "selected" : "")}
                  onClick={() => {
                    if (!items.length) navigate(g);
                    else {
                      setOpen(open === g ? "" : g);
                      if (open !== g && !mobile) navigate(items[0]);
                    }
                  }}
                >
                  <Icon size={18} />
                  <span>{g}</span>
                  {items.length > 0 && (
                    <ChevronDown
                      size={13}
                      className={open === g ? "rotated" : ""}
                    />
                  )}
                </button>
                {open === g &&
                  items.map((p) => (
                    <button
                      key={p}
                      className={"subnav " + (page === p ? "current" : "")}
                      onClick={() => navigate(p)}
                    >
                      <span />
                      {p}
                    </button>
                  ))}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div>
            <span className="live-dot" />
            PostgreSQL conectado
          </div>
          <small>Prototipo académico · datos de demostración</small>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Abrir menú"
            aria-expanded={mobile}
            aria-controls="main-navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            ERP CBN <ChevronRight size={12} />
            <span>{group}</span>
            {page !== group && (
              <>
                <ChevronRight size={12} />
                <strong>{page}</strong>
              </>
            )}
          </div>
          <div className="top-right">
            <span className="environment">PILOTO LOCAL</span>
            <button
              className="bell"
              onClick={() => navigate("Punto de reorden")}
              aria-label="Alertas"
            >
              <Bell size={18} />
              {low.length > 0 && <i />}
            </button>
            <span className="divider" />
            <div className="avatar">
              {data.user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="user-info">
              <strong>{data.user.name}</strong>
              <small>{data.user.role_id}</small>
            </div>
            <button
              title="Cerrar sesión"
              onClick={() => {
                sessionStorage.removeItem("cbn-token");
                setToken("");
                setData(null);
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main>
          {page !== "Dashboard" && (
            <div className="page-heading">
              <div>
                <span className="eyebrow">{group.toUpperCase()}</span>
                <h1>{page}</h1>
                <p>
                  {pageDescription[page] ||
                    "Inventario permanente · operación integrada y auditable."}
                </p>
              </div>
              <div className="heading-actions">
                {btn("Actualizar", refresh)}
                {creation[page] &&
                  can(permission) &&
                  btn(creation[page][1], () => create(creation[page][0]), true)}
              </div>
            </div>
          )}
          {page !== "Dashboard" && (
            <div className="toolbar">
              <div className="search">
                <Search size={16} />
                <input
                  aria-label="Buscar registros"
                  placeholder="Buscar código, artículo, lote o referencia…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button onClick={() => setQuery("")}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="toolbar-right">
                <span>
                  <SlidersHorizontal size={14} /> Vista operativa
                </span>
                {btn("Exportar CSV", () => exportPage())}
              </div>
            </div>
          )}
          {content()}
          <footer>
            CBN ERP{" "}
            <span>
              Inventario como fuente oficial · Historial auditable · Sin
              integraciones reales activas
            </span>
            <span>v0.1 · Piloto</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div role="status" className={"toast " + (notice.error ? "error" : "")}>
          <span>
            {notice.error ? (
              <ShieldCheck size={20} />
            ) : (
              <CheckCircle2 size={20} />
            )}
          </span>
          <div>{notice.text}</div>
          <button onClick={() => setNotice(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {dialog && (
        <Modal
          dialog={dialog}
          busy={busy}
          close={() => setDialog(null)}
          submit={(v) => send(dialog.action, v, dialog.source)}
        />
      )}{" "}
      {coverage && (() => {
        const article = articleById.get(coverage.article_id) || {};
        const gap = Math.max(
          0,
          Math.ceil(number(coverage.physical) * 0.9 - number(coverage.available)),
        );
        const alternativeWarehouses = (Array.from(
          (data.inventory || [])
            .filter(
              (row: Row) =>
                row.article_id === coverage.article_id &&
                row.warehouse_id !== coverage.warehouse_id &&
                number(row.available) > 0,
            )
            .reduce((groups: Map<string, Row>, row: Row) => {
              const current = groups.get(row.warehouse_id) || {
                warehouse_id: row.warehouse_id,
                available: 0,
                positions: [],
              };
              current.available += number(row.available);
              current.positions.push(row);
              groups.set(row.warehouse_id, current);
              return groups;
            }, new Map<string, Row>())
            .values(),
        ) as Row[])
          .map((option: Row): Row => ({
            ...option,
            transferable: Math.max(
              0,
              number(option.available) - number(article.safety_stock),
            ),
            source: [...option.positions].sort(
              (a: Row, b: Row) => number(b.available) - number(a.available),
            )[0],
          }))
          .filter((option: Row) => option.transferable > 0)
          .sort((a: Row, b: Row) => b.transferable - a.transferable);
        const bestAlternative = alternativeWarehouses[0];
        const incoming = number(
          (data.planning || []).find((row: Row) => row.id === coverage.article_id)
            ?.incoming,
        );
        const held = (data.inventory || [])
          .filter(
            (row: Row) =>
              row.article_id === coverage.article_id &&
              row.warehouse_id === coverage.warehouse_id &&
              number(row.blocked) > 0,
          )
          .reduce((sum: number, row: Row) => sum + number(row.blocked), 0);
        const go = (destination: string) => {
          setCoverage(null);
          navigate(destination);
        };
        const reviewReservations = () => {
          const warehouse = warehouseById.get(coverage.warehouse_id) || {};
          setCoverage(null);
          navigate("Pedidos");
          setOrderPlant(warehouse.center || "Todas");
          setOrderWarehouse(coverage.warehouse_id || "Todos");
          setOrderArticle(coverage.article_id || "Todos");
          setOrderStatus("RESERVADO");
        };
        return (
          <div className="overlay coverage-overlay" onClick={() => setCoverage(null)}>
            <aside className="coverage-drawer" onClick={(event) => event.stopPropagation()}>
              <button className="close" aria-label="Cerrar cobertura" onClick={() => setCoverage(null)}>
                <X size={20} />
              </button>
              <span className="eyebrow">COBERTURA ATP</span>
              <h2>Resolver disponibilidad de {coverage.article_id}</h2>
              <p>
                {coverage.article?.name || coverage.article} · {warehouseById.get(coverage.warehouse_id)?.name || coverage.warehouse_id}
              </p>
              <div className="coverage-summary">
                <div><span>Stock físico</span><strong>{fmt(coverage.physical)}</strong></div>
                <div><span>ATP local</span><strong>{fmt(coverage.available)}</strong></div>
                <div><span>Meta operativa</span><strong>{fmt(number(coverage.physical) * 0.9)}</strong></div>
                <div className="warning"><span>Brecha a 90%</span><strong>{fmt(gap)}</strong></div>
              </div>
              <p className="coverage-explanation">
                El sistema prioriza cobertura operativa sin liberar calidad ni cancelar pedidos automáticamente.
              </p>
              <div className="coverage-options">
                <article className={bestAlternative ? "recommended" : "disabled"}>
                  <div>
                    <span className="coverage-option-label">Traslado entre plantas</span>
                    <strong>
                      {bestAlternative
                        ? `${warehouseById.get(bestAlternative.warehouse_id)?.name || bestAlternative.warehouse_id}: ${fmt(bestAlternative.transferable)} transferibles`
                        : "No hay excedente transferible"}
                    </strong>
                    <small>Protege el stock de seguridad de la planta de origen.</small>
                  </div>
                  {bestAlternative && can("inventario") && (
                    <button
                      className="primary"
                      onClick={() =>
                        prepareCoverageTransfer(
                          coverage,
                          bestAlternative.source,
                          Math.min(gap, bestAlternative.transferable),
                        )
                      }
                    >
                      Crear traslado <ArrowRight size={15} />
                    </button>
                  )}
                </article>
                <article>
                  <div>
                    <span className="coverage-option-label">Reservas activas</span>
                    <strong>{fmt(coverage.reserved)} comprometidas</strong>
                    <small>Revisa prioridad y pedido antes de cancelar; nunca se libera automáticamente.</small>
                  </div>
                  <button onClick={reviewReservations}>Revisar reservas</button>
                </article>
                <article className={incoming > 0 ? "" : "disabled"}>
                  <div>
                    <span className="coverage-option-label">Compra en tránsito</span>
                    <strong>{incoming > 0 ? `${fmt(incoming)} por recibir` : "Sin compras confirmadas"}</strong>
                    <small>Una recepción próxima puede recuperar ATP sin duplicar la compra.</small>
                  </div>
                  {incoming > 0 && <button onClick={() => go("Stock en tránsito")}>Revisar recepción</button>}
                </article>
                <article className={held > 0 ? "" : "disabled"}>
                  <div>
                    <span className="coverage-option-label">Inventario retenido</span>
                    <strong>{held > 0 ? `${fmt(held)} en calidad` : "Sin stock retenido local"}</strong>
                    <small>Calidad conserva la decisión independiente de liberar, bloquear o rechazar.</small>
                  </div>
                  {held > 0 && <button onClick={() => go("Lotes pendientes")}>Solicitar revisión</button>}
                </article>
                <article>
                  <div>
                    <span className="coverage-option-label">Escasez sin cobertura</span>
                    <strong>Compra, producción o reposición</strong>
                    <small>Úsalo cuando las alternativas anteriores no cubran la necesidad.</small>
                  </div>
                  <button onClick={() => {
                    setCoverage(null);
                    openRopForRow(coverage);
                  }}>Preparar reposición</button>
                </article>
              </div>
            </aside>
          </div>
        );
      })()}
      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setDetail(null)}>
              <X size={20} />
            </button>
            {detail.positions ? (
              (() => {
                const article = detail.article || {};
                const affectedPositions = (detail.positions as Row[]).filter(
                  (position: Row) => number(position.blocked) > 0,
                );
                const reason = (position: Row) =>
                  position.quality !== "LIBERADO"
                    ? statusLabel(position.quality)
                    : position.expiry &&
                        new Date(position.expiry).getTime() < Date.now()
                      ? "VENCIDO"
                      : "NO ELEGIBLE";
                return (
                  <>
                    <span className="eyebrow">DETALLE DE LA POSICIÓN SKU–ALMACÉN</span>
                    <h2>{article.name || detail.article_id}</h2>
                    <p>
                      {detail.article_id} · {warehouseById.get(detail.warehouse_id)?.name || detail.warehouse_id}
                    </p>
                    <span className={`dashboard-status severity-${detail.severity}`}>
                      {detail.statusText}
                    </span>
                    <div className="detail-stats dashboard-detail-stats">
                      <div>Físico<strong>{fmt(detail.physical)}</strong></div>
                      <div>ATP<strong>{fmt(detail.available)}</strong></div>
                      <div>ROP<strong>{fmt(detail.rop)}</strong></div>
                    </div>
                    {detail.issue === "affected" && (
                      <>
                        <h3>Desglose de unidades no elegibles</h3>
                        <p className="detail-explanation">
                          El total incluye cualquier lote que no puede prometerse: por cuarentena,
                          bloqueo, rechazo o vencimiento. No significa que todas las unidades estén
                          en cuarentena.
                        </p>
                        <div className="detail-breakdown">
                          {affectedPositions.map((position: Row) => (
                            <article key={`${position.lot_id}:${position.location_id}`}>
                              <div>
                                <strong>{position.lot_id}</strong>
                                <small>
                                  {locationById.get(position.location_id)?.name || position.location_id}
                                </small>
                              </div>
                              <Badge value={reason(position)} />
                              <strong>{fmt(position.blocked)} {article.unit || "u."}</strong>
                            </article>
                          ))}
                          <footer>
                            <span>Total no elegible</span>
                            <strong>{fmt(detail.blocked)} {article.unit || "u."}</strong>
                          </footer>
                        </div>
                      </>
                    )}
                    {detail.issue !== "affected" && (
                      <>
                        <h3>Diagnóstico</h3>
                        <p className="detail-explanation">
                          {detail.issue === "accuracy"
                            ? `El último conteo presenta una diferencia de ${fmt(detail.countDifference)} ${article.unit || "u."} sobre una base de ${fmt(detail.countTheoretical)}.`
                            : detail.issue === "atp"
                              ? `Solo ${percent(detail.atpRatio)} del stock físico está disponible para prometer después de reservas y restricciones.`
                              : detail.issue === "rop"
                                ? `Faltan ${fmt(Math.max(0, number(detail.rop) - number(detail.available)))} ${article.unit || "u."} para alcanzar el punto de reorden.`
                                : "La posición cumple actualmente las reglas operativas evaluadas."}
                        </p>
                        {detail.issue === "accuracy" && detail.countPositions?.length > 0 && (
                          <div className="detail-breakdown count-breakdown">
                            {detail.countPositions.map((count: Row) => (
                              <article key={count.id}>
                                <div>
                                  <strong>{count.lot_id}</strong>
                                  <small>{locationById.get(count.location_id)?.name || count.location_id}</small>
                                </div>
                                <span>
                                  {fmt(count.theoretical)} → {fmt(count.counted)}
                                </span>
                                <strong>{number(count.difference) > 0 ? "+" : ""}{fmt(count.difference)} {article.unit || "u."}</strong>
                              </article>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                    <div className="detail-decision-context">
                      <div>
                        <span>Responsable</span>
                        <strong>{detail.owner || "Operaciones de inventario"}</strong>
                      </div>
                      <div>
                        <span>Seguimiento</span>
                        <strong>{detail.workflow || "Sin acción pendiente"}</strong>
                      </div>
                    </div>
                    {detail.issue !== "ok" && (
                      <button
                        className="detail-primary-action"
                        onClick={() => {
                          setDetail(null);
                          if (detail.issue === "atp") setCoverage(detail);
                          else if (detail.issue === "accuracy") reviewDashboardCount(detail);
                          else if (detail.issue === "rop") openRopForRow(detail);
                          else navigate(detail.actionPage);
                        }}
                      >
                        {detail.actionLabel}
                      </button>
                    )}
                  </>
                );
              })()
            ) : (
              <>
                <span className="eyebrow">TRAZABILIDAD DEL LOTE</span>
                <h2>{detail.lot_id}</h2>
                <p>{detail.article}</p>
                <Badge value={detail.quality} />
                <div className="detail-stats">
                  <div>Físico<strong>{fmt(detail.physical)}</strong></div>
                  <div>Reservado<strong>{fmt(detail.reserved)}</strong></div>
                  <div>Disponible<strong>{fmt(detail.available)}</strong></div>
                </div>
                <dl>
                  <dt>{detail.locations ? "Ubicaciones" : "Ubicación"}</dt>
                  <dd>{detail.locations || detail.location_id}</dd>
                  <dt>Rotación</dt>
                  <dd>{detail.policy}</dd>
                  <dt>Vencimiento</dt>
                  <dd>{date(detail.expiry)}</dd>
                  <dt>{detail.lot_version ? "Versión del lote" : "Versión del saldo"}</dt>
                  <dd>{detail.lot_version || detail.version}</dd>
                </dl>
                <h3>Historial de movimientos</h3>
                <div className="timeline">
                  {data.movements
                    .filter((m: Row) => m.lot_id === detail.lot_id)
                    .map((m: Row) => (
                      <div key={m.id}>
                        <span className="timeline-dot" />
                        <Badge value={m.type} />
                        <strong>{fmt(m.quantity)} {detail.unit}</strong>
                        <p>{m.reason}</p>
                        <small>{date(m.created_at)} · {m.actor} · {m.document_id || "Apertura"}</small>
                      </div>
                    ))}
                </div>
                <h3>Relaciones de producción</h3>
                {data.genealogy
                  .filter(
                    (g: Row) =>
                      g.parent_lot === detail.lot_id ||
                      g.child_lot === detail.lot_id,
                  )
                  .map((g: Row, i: number) => (
                    <p key={i}>{g.parent_lot} → {g.child_lot} · {g.document_id}</p>
                  ))}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
function DashboardKpi({
  label,
  value,
  secondary,
  goal,
  comparison,
  status,
  icon: Icon,
  progress,
  target = 100,
  help,
}: any) {
  const boundedProgress = Math.max(0, Math.min(100, number(progress)));
  const boundedTarget = Math.max(1.5, Math.min(98.5, number(target)));
  return (
    <article className={`dashboard-kpi ${status}`}>
      <div className="dashboard-kpi-label">
        <span>{label}</span>
        <span
          className="dashboard-kpi-help"
          title={help}
          aria-label={`${label}: ${help}`}
          tabIndex={0}
        >
          <Icon size={16} />
        </span>
      </div>
      <div className="dashboard-kpi-value">
        {value} {secondary && <small>{secondary}</small>}
      </div>
      <div className="dashboard-kpi-context">
        <span>{goal}</span>
        <span className={`dashboard-kpi-chip ${status}`}>
          {status === "good" ? <CheckCircle2 size={11} /> : <Clock3 size={11} />}
          {status === "neutral"
            ? "Sin datos"
            : status === "good"
              ? "Cumple"
              : "Atención"}
        </span>
      </div>
      <div className="dashboard-kpi-track" aria-hidden="true">
        <span style={{ width: `${boundedProgress}%` }} />
        <i style={{ left: `${boundedTarget}%` }} />
      </div>
      <small className="dashboard-kpi-comparison">{comparison}</small>
    </article>
  );
}
function DashboardTrend({
  points,
}: {
  points: {
    label: string;
    atp: number | null;
    accuracy: number | null;
  }[];
}) {
  const width = 640;
  const height = 176;
  const left = 42;
  const right = 14;
  const top = 14;
  const bottom = 32;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const min = 80;
  const max = 100;
  const y = (value: number) =>
    top + ((max - Math.max(min, Math.min(max, value))) / (max - min)) * chartHeight;
  const x = (index: number) =>
    left + (chartWidth * index) / Math.max(1, points.length - 1);
  type Metric = "atp" | "accuracy";
  const series = (metric: Metric) =>
    points
      .map((point, index) => ({
        label: point.label,
        value: point[metric],
        index,
      }))
      .filter(
        (point): point is { label: string; value: number; index: number } =>
          typeof point.value === "number" && Number.isFinite(point.value),
      );
  const path = (metric: Metric) =>
    series(metric)
      .map((point, index) =>
        `${index === 0 ? "M" : "L"}${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`,
      )
      .join(" ");
  const metrics: { key: Metric; label: string; target: number }[] = [
    { key: "atp", label: "ATP", target: 90 },
    { key: "accuracy", label: "Exactitud", target: 95 },
  ];
  const hasData = metrics.some(({ key }) => series(key).length > 0);
  const currentValues = metrics.map((metric) => ({
    ...metric,
    value: series(metric.key).at(-1)?.value ?? null,
  }));
  return (
    <div className="dashboard-trend">
      <div className="trend-canvas">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Evolución de ATP y exactitud del inventario frente a sus metas"
        >
        {[80, 85, 90, 95, 100].map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              y1={y(tick)}
              x2={width - right}
              y2={y(tick)}
              className="trend-grid-line"
            />
            <text x={left - 9} y={y(tick) + 3} textAnchor="end" className="trend-axis-label">
              {tick}%
            </text>
          </g>
        ))}
        <line
          x1={left}
          y1={y(90)}
          x2={width - right}
          y2={y(90)}
          className="trend-target-line target-atp"
        />
        <line
          x1={left}
          y1={y(95)}
          x2={width - right}
          y2={y(95)}
          className="trend-target-line target-quality"
        />
        {metrics.map(({ key }) => {
          const valid = series(key);
          const last = valid[valid.length - 1];
          const line = path(key);
          return (
            <g key={key}>
              {line && <path d={line} className={`trend-series trend-${key}-line`} />}
              {valid.map((point) => (
                <circle
                  key={`${key}-${point.label}-${point.index}`}
                  cx={x(point.index)}
                  cy={y(point.value)}
                  r={point.index === last?.index ? 3.2 : 2}
                  className={`trend-series-point trend-${key}-point`}
                />
              ))}
            </g>
          );
        })}
        {points.map((point, index) => (
          <text
            key={`${point.label}-${index}`}
            x={x(index)}
            y={height - 8}
            textAnchor="middle"
            className="trend-axis-label"
          >
            {point.label}
          </text>
        ))}
        {!hasData && (
          <text x={width / 2} y={height / 2} textAnchor="middle" className="trend-empty-label">
            No hay movimientos confirmados en este rango
          </text>
        )}
        </svg>
      </div>
      <aside className="trend-current-values" aria-label="Valores del último periodo">
        <span>Último periodo</span>
        {currentValues.map(({ key, label, value, target }) => (
          <div key={key} className={`trend-current-${key}`}>
            <i />
            <p>
              <small>{label}</small>
              <strong>{value === null ? "—" : percent(value, 1)}</strong>
              <em>Meta {target}%</em>
            </p>
          </div>
        ))}
      </aside>
    </div>
  );
}
function Stat({ label, value, note, icon: Icon, amber = false }: any) {
  return (
    <div className="stat">
      <div>
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <small className={amber ? "amber-text" : ""}>
        {amber ? <Clock3 size={13} /> : <CheckCircle2 size={13} />} {note}
      </small>
    </div>
  );
}
function Modal({
  dialog,
  busy,
  close,
  submit,
}: {
  dialog: Dialog;
  busy: boolean;
  close: () => void;
  submit: (v: Row) => void;
}) {
  return (
    <div className="overlay">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={dialog.title}
      >
        <button className="close" onClick={close} disabled={busy}>
          <X size={20} />
        </button>
        <span className="eyebrow">OPERACIÓN DEL ERP</span>
        <h2>{dialog.title}</h2>
        <p>{dialog.description}</p>
        {dialog.insights && (
          <div className="modal-insights">
            {dialog.insights.map((insight) => (
              <div key={insight.label} className={insight.tone || ""}>
                <span>{insight.label}</span>
                <strong>{insight.value}</strong>
                {insight.note && <small>{insight.note}</small>}
              </div>
            ))}
          </div>
        )}
        {dialog.warning && (
          <div className="modal-warning">
            <Clock3 size={16} />
            <span>{dialog.warning}</span>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget));
            submit({ ...dialog.initial, ...values });
          }}
        >
          <div className="form-grid">
            {dialog.fields.map((f) => (
              <label key={f.key}>
                {f.label}
                {f.type === "select" ? (
                  <select
                    name={f.key}
                    defaultValue={f.value || f.options?.[0]?.value}
                    required={!f.optional}
                  >
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name={f.key}
                    type={f.type || "text"}
                    defaultValue={f.value ?? ""}
                    step={f.type === "number" ? "0.001" : undefined}
                    min={f.type === "number" ? (f.min ?? 0) : undefined}
                    max={f.type === "number" ? f.max : undefined}
                    required={!f.optional}
                    autoComplete={
                      f.type === "password" ? "new-password" : "off"
                    }
                  />
                )}
                {f.hint && <small className="field-hint">{f.hint}</small>}
              </label>
            ))}
          </div>
          {!dialog.fields.length && (
            <div className="confirm-box">
              <CheckCircle2 size={22} />
              <strong>{dialog.initial?.id}</strong>
              <span>Versión {dialog.initial?.version}</span>
            </div>
          )}
          <div className="modal-footer">
            <button type="button" onClick={close} disabled={busy}>
              Cancelar
            </button>
            <button className="primary" disabled={busy || dialog.blocked}>
              {busy
                ? "Validando…"
                : dialog.blocked
                  ? "ATP insuficiente en este almacén"
                  : "Confirmar operación"}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <div className="login-story">
        <div className="brand">
          <CbnBrand />
          <strong>ERP · INVENTARIO</strong>
        </div>
        <div>
          <span className="eyebrow">CADA MOVIMIENTO CUENTA</span>
          <h1>
            Un inventario conectado.
            <br />
            <em>Una operación confiable.</em>
          </h1>
          <p>
            Control de lotes, calidad y existencias desde un único espacio de
            trabajo.
          </p>
          <div className="login-feature">
            <ShieldCheck />
            Trazabilidad desde el origen
          </div>
          <div className="login-feature">
            <ArrowLeftRight />
            Reservas y salidas sin duplicidad
          </div>
          <div className="login-feature">
            <Activity />
            Reposición con información real
          </div>
        </div>
        <small>
          CBN · Prototipo académico · Planta piloto y centro de distribución
        </small>
      </div>
      <div className="login-form">
        <div>
          <span className="eyebrow">BIENVENIDO A TU ESPACIO</span>
          <h2>Iniciar sesión</h2>
          <p>Accede con tu usuario y rol operativo.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const v = await api(
                  "login",
                  "",
                  Object.fromEntries(new FormData(e.currentTarget)),
                );
                onLogin(v.token);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Usuario
              <input
                name="username"
                defaultValue="admin"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                defaultValue="CbnDemo2026!"
                autoComplete="current-password"
                required
              />
            </label>
            {error && <div className="error-inline">{error}</div>}
            <button className="primary" disabled={busy}>
              {busy ? "Verificando…" : "Entrar al ERP"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="demo-login">
            <strong>
              <Database size={15} /> Acceso de demostración
            </strong>
            <p>
              admin · almacen · calidad · compras · produccion · despacho ·
              supervisor · gerencia
            </p>
            <small>
              Contraseña común: <code>CbnDemo2026!</code>
              <br />
              Solo para uso local académico.
            </small>
          </div>
        </div>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
