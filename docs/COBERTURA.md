# Cobertura verificable del prototipo

Este archivo distingue implementación funcional, simulación y pendientes. No equivale a una certificación de cumplimiento ni garantiza la calificación de la rúbrica.

| Necesidad | Pantalla / evidencia | Estado |
|---|---|---|
| Administración | Usuarios; Roles y permisos; Almacenes; Auditoría | Creación, asignación de rol y acceso; escritura autorizada en backend |
| Maestros | Artículos, Proveedores, Ubicaciones, Políticas | Altas; edición de política, demanda, plazo y seguridad |
| Compras | Solicitudes y Órdenes de compra | Conversión de solicitud, aprobación, tránsito y recepción parcial |
| Inventario permanente | Existencias, Movimientos | PostgreSQL real; movimientos y saldos atómicos |
| Lotes y calidad | Lotes pendientes, Historial de decisiones | Cuarentena, liberación, bloqueo, rechazo |
| FIFO/FEFO | Reservas, Preparación FIFO/FEFO | Selección real ordenada; rechaza vencidos y retenidos |
| Reserva concurrente | Prueba 07 | Solo una de dos reservas incompatibles puede confirmar |
| Distribución afecta existencia | Pedidos, Salidas y entregas | Descuento al confirmar salida; entrega no descuenta otra vez |
| Tránsito | Stock en tránsito, Traslados | No disponible hasta recepción; evita doble saldo |
| Conteos | Conteos y diferencias | Pendiente, otro aprobador, verificación de versión |
| Mermas | Mermas y ajustes | Motivo y salida; no obligatorias en producción |
| Producción | Órdenes de producción | Un insumo y un producto por orden; consumo y resultado atómicos |
| Trazabilidad | Consulta por lote y panel lateral | Movimientos, documento y genealogía entrada/salida |
| Reposición | Punto de reorden | Fórmula aplicada, posición y sugerencia única |
| Promesa | Botón Promesa en pedido | ATP y versión; plazos manuales estimados |
| No duplicidad | Mensajería y pruebas 03–04 | Inbox, claves de negocio y restricciones SQL |
| Mensajería persistente | Mensajería | Outbox PostgreSQL y worker verificados con destino simulado |
| Conciliación | Integraciones → Conciliación | Lectura comparativa, sin ajustes automáticos |
| Analítica | Dashboard, Indicadores, CSV y `bi_inventory` | Datos derivados de PostgreSQL; sin conexión real a Power BI |
| Presentación | Prueba de navegador | Acceso, navegación, filtro, formulario, panel de lote y pantalla móvil |

## No incluido o simplificado

- Los sistemas reales MES, BEES, TMS/GPS y ePOD requieren contratos, credenciales y validación externa. No se han conectado.
- La pantalla de mensajería permite simular un pedido BEES. Los resultados MES y las evidencias ePOD se demuestran mediante las operaciones locales equivalentes; no hay sincronización remota ni polling real.
- RabbitMQ tiene un adaptador configurable; no se ha validado contra un broker activo en este equipo.
- Producción no incluye recetas multicomponente, planificación avanzada, OEE ni conexión con máquinas.
- Los documentos del piloto tienen una línea de artículo. Una devolución por pedido; no múltiples devoluciones parciales acumuladas.
- Las compras no incluyen concursos de cotizaciones, cuentas por pagar ni facturas de proveedor.
- La promesa de entrega usa días declarados; no motor de rutas, capacidad detallada, hora de corte o ventanas reales.
- ABC se registra como clasificación. No incluye cálculo automático de clasificación por valor ni calendario de conteos cíclicos.
- Los listados del piloto tienen límites de registros y exportan el conjunto cargado; no sustituyen una API paginada para alta escala.
- No se implementa eliminación de datos transaccionales. Los movimientos son inmutables.
- No incluye financiamiento, impuestos, contabilidad, nómina, POS o facturación electrónica.
- Pendientes para producción: TLS, MFA, secretos seguros, permisos por almacén, migraciones incrementales, recuperación de backups, carga y monitoreo externo.

## Cómo se usa en la fase de desarrollo

La evidencia es la aplicación ejecutándose, el esquema SQL, el código, los casos automatizados y las capturas. El informe debe describir lo que se demuestra y distinguir expresamente lo simulado. No presentar los diagramas o este documento como sustituto de un sistema ejecutable.
