# Modelo relacional normalizado — ERP CBN Inventarios

## Alcance y fuente de verdad

Este documento describe el modelo físico que instala `database/002_normalize_3fn.sql`. El archivo `modelo-relacional-3fn.dbml` contiene el diagrama reproducible con notación Crow's Foot, tipos, claves y cardinalidades. Debe importarse en dbdiagram.io y exportarse a PDF o PNG para la entrega.

Las vistas `roles`, `balances`, `documents` y `warehouses` son una capa temporal de compatibilidad para la API; **no son entidades del modelo físico**. `warehouses` reconstruye el nombre visible de la planta desde `warehouse_definitions.plant_id`, sin almacenarlo dos veces. Las vistas `inventory_view`, `bi_inventory` e `inventory_reconciliation` son proyecciones de consulta y tampoco se presentan como tablas en el DER.

## Demostración de normalización

### Primera forma normal (1FN)

- Cada tabla tiene una clave primaria y cada columna contiene un valor atómico.
- El arreglo `roles.permissions` fue sustituido por `permissions` y la intersección `role_permissions`.
- El objeto de negocio `documents.data` fue sustituido por `document_headers`, `document_lines` y los subtipos `purchase_requests`, `purchase_orders`, `sales_orders`, `transfer_orders` y `production_orders`.
- Los JSON que permanecen en `inbox`, `outbox`, `deliveries`, `business_effects` y `audit` son sobres de eventos o evidencia inmutable en el límite de integración; no reemplazan relaciones del núcleo transaccional.

### Segunda forma normal (2FN)

En las tablas con clave compuesta, todos los atributos no clave dependen de la clave completa:

- `inventory_positions`: el físico y la versión corresponden a la combinación **lote + ubicación**.
- `document_lines`: artículo y cantidades corresponden a **documento + número de línea**.
- `role_permissions`: la asignación existe por **rol + permiso**.
- `genealogy`: la cantidad consumida corresponde a **lote padre + lote hijo + documento**.

No existen dependencias parciales respecto de una parte de esas claves.

### Tercera forma normal (3FN)

- `warehouses` ya no almacena el texto repetido de planta/centro: referencia `plants` mediante `plant_id`.
- Los permisos dependen de `permissions`, no del rol como arreglo repetitivo.
- Los datos propios de cada documento dependen de su subtipo y no de un JSON genérico.
- `inventory_positions` no almacena `reserved`: el reservado se calcula desde las asignaciones activas de `reservations`. Se elimina una fuente de divergencia.
- `actors` centraliza la identidad referenciada por movimientos, conteos y auditoría; ya no son textos sin integridad referencial.
- `suggestions` identifica la posición operacional correcta con `article_id + warehouse_id`.

Por tanto, ningún atributo no clave del núcleo depende transitivamente de otro atributo no clave.

## Cardinalidades principales

| Relación | Cardinalidad | Regla de negocio |
|---|---:|---|
| Planta — Almacén | 1:N | Una planta agrupa varios almacenes; cada almacén pertenece a una planta. |
| Almacén — Ubicación | 1:N | Una ubicación interna pertenece a un único almacén. |
| Artículo — Lote | 1:N | Un lote identifica una partida de un solo artículo. |
| Lote — Posición — Ubicación | N:M resuelta | `inventory_positions` materializa dónde está cada lote y cuánto físico existe. |
| Documento — Línea | 1:N | El encabezado puede contener una o más líneas de artículo. |
| Documento — Subtipo | 1:0..1 | Según `kind`, un encabezado posee un subtipo especializado. |
| Proveedor — Orden de compra | 1:N | Cada compra tiene un proveedor; un proveedor atiende varias compras. |
| Documento — Reserva | 1:N | Una orden puede asignar varios lotes/ubicaciones. |
| Lote/Ubicación — Reserva | 1:N | Varias órdenes pueden reservar una posición sin superar el físico. |
| Lote/Ubicación — Movimiento | 1:N | Todo cambio físico queda en un libro inmutable. |
| Rol — Permiso | N:M resuelta | `role_permissions` evita grupos repetitivos y duplicidad. |
| Usuario — Actor | 1:0..1 | Un actor de tipo USER referencia exactamente un usuario. |
| Artículo/Almacén — Sugerencia | 1:N histórica | Solo una sugerencia abierta por combinación. |

## Integridad y control de duplicidad

| Mecanismo | Restricción implementada |
|---|---|
| Identidad técnica | PK en todas las tablas. |
| Usuario | `UNIQUE(users.username)`. |
| Organización | `UNIQUE(plants.name)`, `UNIQUE(plant_id, warehouses.name)` y `UNIQUE(warehouse_id, locations.name)`. |
| Proveedor | `UNIQUE(suppliers.name)`. |
| Posición de stock | PK compuesta `(lot_id, location_id)`. |
| Línea documental | PK compuesta `(document_id, line_no)`. |
| Solicitud ↔ compra | FK cruzadas diferibles y `UNIQUE` para impedir reutilización. |
| Asignación de reserva | `UNIQUE(document_id, lot_id, location_id)`. |
| Capacidad de reserva | Trigger diferible: suma activa no puede superar físico. |
| Conteo pendiente | Índice único parcial por `(lot_id, location_id)`. |
| Sugerencia abierta | Índice único parcial por `(article_id, warehouse_id)`. |
| Idempotencia técnica | `UNIQUE(inbox.source, inbox.event_id)`. |
| Idempotencia de negocio | PK en `business_effects.business_key` y `UNIQUE(movements.business_key)`. |
| Estados y cantidades | Restricciones `CHECK` de dominio, no negatividad y rangos. |
| Trazabilidad | FK obligatorias y triggers que impiden UPDATE/DELETE de movimientos y auditoría. |

## Integración con el dashboard

La cadena verificable es:

```text
Tablas 3FN de PostgreSQL
        ↓ JOIN / agregación controlada
inventory_view + consultas normalizadas del API NestJS
        ↓ JSON REST local
filtros, KPIs, tendencias, riesgo y acciones del dashboard React
```

El dashboard no conserva una segunda copia del inventario. El API calcula ATP desde posición física, reservas activas, calidad y vencimiento; calcula ROP desde demanda, plazo y stock de seguridad; y obtiene exactitud desde conteos aprobados. Así, filtros y visualizaciones consumen la misma fuente relacional oficial.

## Evidencia de verificación

- Construcción TypeScript y Vite sin errores.
- 27/27 pruebas de API aprobadas sobre una base PostgreSQL exclusiva creada desde cero.
- Pruebas incluidas: concurrencia de reservas, FEFO/FIFO, idempotencia, despacho único, traslados, conteos con segregación, mermas, producción atómica, compras parciales, ROP, ATP, conciliación e inmutabilidad.
- La migración registra la versión `002` en `schema_migrations`.

