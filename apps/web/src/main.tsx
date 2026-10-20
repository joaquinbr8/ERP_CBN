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
  Menu,
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
};
type Dialog = {
  action: string;
  title: string;
  description: string;
  fields: Field[];
  initial?: Row;
  source?: string;
};
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
const date = (v: any) => (v ? new Date(v).toLocaleDateString("es-BO") : "—");
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
  const [wh, setWh] = useState("Todos");
  const [quality, setQuality] = useState("Todos");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [lastEvent, setLastEvent] = useState<Row | null>(null);
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
    setWh("Todos");
    setQuality(p === "Lotes pendientes" ? "CUARENTENA" : "Todos");
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
    (data?.[name] || []).map((r: Row) => ({
      value: r.id,
      label: r.id + " · " + (r[label] || r.id),
    }));
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
  ) {
    setDialog({ action, title, fields, initial, description, source });
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
            select("warehouseId", "Almacén del material", "warehouses"),
          ],
          {},
          "Prototipo: una materia prima por orden. El resultado registra producto, genealogía y merma opcional.",
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
            field("lotId", "Nuevo lote"),
            select("locationId", "Ubicación", "locations"),
            field(
              "quantity",
              "Cantidad recibida",
              "number",
              Number(row.data.quantity) - Number(row.data.received),
            ),
            { ...field("expiry", "Vencimiento", "date"), optional: true },
          ],
          initial,
          "Se admiten recepciones parciales. El lote queda en cuarentena; el tránsito pendiente se reduce.",
        );
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
  const filtered = inv.filter(
    (r) =>
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
      warehouses: unique("warehouse_id"),
      position_count: positions.length,
      origin: origin?.document_id || origin?.type || "Sin referencia",
      origin_type: origin?.type || "—",
      lot_version: lot.version,
    };
  });
  const filteredLots = lotRows.filter(
    (r) =>
      (wh === "Todos" || r.warehouses.includes(wh)) &&
      (quality === "Todos" || r.quality === quality) &&
      (category === "Todas" || r.category === category) &&
      JSON.stringify(r).toLowerCase().includes(query.toLowerCase()),
  );
  const low = data.planning.filter(
    (a: Row) => Number(a.available) + Number(a.incoming) <= Number(a.rop),
  );
  const held = inv.filter((r) => Number(r.blocked) > 0);
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
        { key: "location_id", label: "Ubicación" },
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
          label: "Ubicaciones",
          render: (r) => (
            <div>
              <strong>{r.locations}</strong>
              <small>{r.position_count} posición(es)</small>
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
  function documents(kind: string) {
    const rows = data.documents.filter((r: Row) => r.kind === kind);
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
          render: (r) => (
            <div>
              <strong>
                {r.data.customer ||
                  r.data.articleId ||
                  r.data.outputArticle ||
                  r.data.lotId}
              </strong>
              <small>
                {r.data.quantity || r.data.inputQuantity}{" "}
                {r.data.supplierId ? " · " + r.data.supplierId : ""}
              </small>
              {r.data.promise && (
                <small>
                  Promesa v{r.data.promise.version}: {r.data.promise.date} ·
                  estimada
                </small>
              )}
            </div>
          ),
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
        <>
          <div className="welcome">
            <div>
              <span className="eyebrow">CONTROL OPERATIVO · CBN PILOTO</span>
              <h1>Tu inventario, en perspectiva.</h1>
              <p>
                Del ingreso del material a la entrega. Una sola fuente de
                verdad.
              </p>
            </div>
            <div className="welcome-icon">
              <Boxes size={64} strokeWidth={1} />
            </div>
          </div>
          <div className="stat-grid">
            <Stat
              label="Artículos controlados"
              value={data.articles.length}
              note="Catálogo maestro activo"
              icon={Package}
            />
            <Stat
              label="Lotes con retención"
              value={held.length}
              note="Calidad o vencimiento"
              icon={ShieldCheck}
              amber
            />
            <Stat
              label="Bajo punto de reorden"
              value={low.length}
              note="Disponible + compras confirmadas"
              icon={Activity}
              amber
            />
            <Stat
              label="Pedidos por preparar"
              value={
                data.documents.filter(
                  (r: Row) => r.kind === "PEDIDO" && r.status === "PENDIENTE",
                ).length
              }
              note="Listos para validar disponibilidad"
              icon={Truck}
            />
          </div>
          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Disponibilidad por artículo</h3>
                  <p>Cada artículo conserva su propia unidad de medida.</p>
                </div>
                <button
                  className="text-link"
                  onClick={() => navigate("Existencias")}
                >
                  Ver inventario <ArrowUpRight size={15} />
                </button>
              </div>
              <div className="bars">
                {data.planning.map((a: Row) => (
                  <div className="bar-row" key={a.id}>
                    <div>
                      <strong>{a.name}</strong>
                      <small>
                        {a.id} · {a.unit}
                      </small>
                    </div>
                    <div className="bar-track">
                      <span
                        style={{
                          width:
                            Math.min(
                              100,
                              (Number(a.available) /
                                Math.max(
                                  Number(a.rop) * 2,
                                  Number(a.available),
                                  1,
                                )) *
                                100,
                            ) + "%",
                        }}
                      />
                    </div>
                    <strong>{fmt(a.available)}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="panel attention">
              <div className="panel-heading">
                <h3>Requieren atención</h3>
                <Bell size={18} />
              </div>
              <button onClick={() => navigate("Lotes pendientes")}>
                <span className="alert-icon amber-bg">
                  <ShieldCheck size={18} />
                </span>
                <span>
                  <strong>{held.length} lotes no elegibles</strong>
                  <small>Revisa calidad y vencimientos</small>
                </span>
                <ChevronRight size={16} />
              </button>
              <button onClick={() => navigate("Punto de reorden")}>
                <span className="alert-icon blue-bg">
                  <ShoppingCart size={18} />
                </span>
                <span>
                  <strong>{low.length} artículos para reposición</strong>
                  <small>Evita quiebres de stock</small>
                </span>
                <ChevronRight size={16} />
              </button>
              <div className="demo-note">
                <span className="live-dot" />
                Entorno académico
                <br />
                <small>Datos ficticios · integraciones simuladas</small>
              </div>
            </section>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h3>Existencias operativas</h3>
                <p>Visibilidad por artículo, lote, ubicación y estado.</p>
              </div>
              {btn("Abrir inventario", () => navigate("Existencias"))}
            </div>
            {inventoryTable()}
          </section>
        </>
      );
    if (page === "Existencias")
      return (
        <>
          <div className="notice-strip">
            <ShieldCheck size={17} />
            <span>
              Solo los lotes <b>liberados y no vencidos</b> son elegibles. La
              reserva no descuenta existencia física.
            </span>
          </div>
          <div className="filters">
            <label>
              Almacén
              <select value={wh} onChange={(e) => setWh(e.target.value)}>
                <option>Todos</option>
                {data.warehouses.map((r: Row) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
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
              {filtered.length} posiciones de inventario
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
              Cada fila identifica <b>un lote único</b>, aunque esté repartido
              entre varias ubicaciones. Aquí se controla su origen, vigencia,
              calidad y trazabilidad.
            </span>
          </div>
          <div className="filters">
            <label>
              Almacén con existencia
              <select value={wh} onChange={(e) => setWh(e.target.value)}>
                <option>Todos</option>
                {data.warehouses.map((r: Row) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
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
              {filteredLots.length} lotes identificados
            </span>
          </div>
          <section className="panel">
            <div className="panel-heading lot-summary">
              <div>
                <h3>Maestro operativo de lotes</h3>
                <p>
                  Una fila por lote; el total físico agrega sus posiciones sin
                  perder la separación por artículo.
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
            La salida confirmada descuenta el físico una sola vez. La entrega
            posterior actualiza el estado logístico.
          </div>
          <section className="panel">{documents("PEDIDO")}</section>
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
            Un conteo no mueve stock automáticamente. Otro usuario aprueba la
            diferencia; si cambió el saldo, se exige repetir el conteo.
          </div>
          <section className="panel">
            {generic(
              data.counts,
              [
                "lot_id",
                "location_id",
                "theoretical",
                "counted",
                "status",
                "created_by",
                "reason",
              ],
              (r) =>
                r.status === "PENDIENTE" &&
                can("aprobar_ajustes") &&
                compact("Aprobar ajuste", () => action("count.approve", r)),
            )}
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
    if (page === "Punto de reorden" || page === "Indicadores")
      return (
        <>
          <div className="formula-card">
            <div>
              <span className="eyebrow">REPOSICIÓN CONTINUA</span>
              <h2>ROP = demanda diaria × plazo + seguridad</h2>
              <p>
                Se compara con disponible + compras confirmadas pendientes.
                Evaluar no crea órdenes automáticamente.
              </p>
            </div>
            <Activity size={40} />
          </div>
          <section className="panel">
            {table(data.planning, [
              { key: "name", label: "Artículo" },
              { key: "unit", label: "Unidad" },
              {
                key: "daily_demand",
                label: "Demanda/día",
                render: (r) => fmt(r.daily_demand),
              },
              { key: "lead_days", label: "Plazo (días)" },
              {
                key: "safety_stock",
                label: "Seguridad",
                render: (r) => fmt(r.safety_stock),
              },
              {
                key: "rop",
                label: "Punto de reorden",
                render: (r) => <strong>{fmt(r.rop)}</strong>,
              },
              {
                key: "available",
                label: "Disponible",
                render: (r) => fmt(r.available),
              },
              {
                key: "incoming",
                label: "Por recibir",
                render: (r) => fmt(r.incoming),
              },
              {
                key: "signal",
                label: "Señal",
                render: (r) => (
                  <Badge
                    value={
                      Number(r.available) + Number(r.incoming) <= Number(r.rop)
                        ? "REPONER"
                        : "CUBIERTO"
                    }
                  />
                ),
              },
            ])}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h3>Sugerencias de reposición</h3>
              {can("compras") &&
                btn("Evaluar inventario", () =>
                  send("replenishment.evaluate", { id: reference("ROP") }),
                )}
            </div>
            {generic(data.suggestions, [
              "article_id",
              "position",
              "rop",
              "status",
              "version",
            ])}
          </section>
        </>
      );
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
          <div className="brand-mark">
            CBN<span>•</span>
          </div>
          <div>
            <strong>
              CBN <b>ERP</b>
            </strong>
            <small>INVENTARIO & OPERACIONES</small>
          </div>
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
      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <aside className="drawer" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setDetail(null)}>
              <X size={20} />
            </button>
            <span className="eyebrow">TRAZABILIDAD DEL LOTE</span>
            <h2>{detail.lot_id}</h2>
            <p>{detail.article}</p>
            <Badge value={detail.quality} />
            <div className="detail-stats">
              <div>
                Físico<strong>{fmt(detail.physical)}</strong>
              </div>
              <div>
                Reservado<strong>{fmt(detail.reserved)}</strong>
              </div>
              <div>
                Disponible<strong>{fmt(detail.available)}</strong>
              </div>
            </div>
            <dl>
              <dt>{detail.locations ? "Ubicaciones" : "Ubicación"}</dt>
              <dd>{detail.locations || detail.location_id}</dd>
              <dt>Rotación</dt>
              <dd>{detail.policy}</dd>
              <dt>Vencimiento</dt>
              <dd>{date(detail.expiry)}</dd>
              <dt>
                {detail.lot_version ? "Versión del lote" : "Versión del saldo"}
              </dt>
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
                    <strong>
                      {fmt(m.quantity)} {detail.unit}
                    </strong>
                    <p>{m.reason}</p>
                    <small>
                      {date(m.created_at)} · {m.actor} ·{" "}
                      {m.document_id || "Apertura"}
                    </small>
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
                <p key={i}>
                  {g.parent_lot} → {g.child_lot} · {g.document_id}
                </p>
              ))}
          </aside>
        </div>
      )}
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
                    min={f.type === "number" ? 0 : undefined}
                    required={!f.optional}
                    autoComplete={
                      f.type === "password" ? "new-password" : "off"
                    }
                  />
                )}
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
            <button className="primary" disabled={busy}>
              {busy ? "Validando…" : "Confirmar operación"}
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
          <div className="brand-mark">
            CBN<span>•</span>
          </div>
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
