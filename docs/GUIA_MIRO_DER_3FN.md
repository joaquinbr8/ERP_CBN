# Guía exacta para recrear el DER 3FN en Miro

## Regla fundamental

Usar como fuente de verdad `docs/modelo-relacional-3fn.dbml`. No deducir relaciones por el nombre de las columnas y no copiar las vistas de DBeaver como si fueran tablas.

El lienzo principal contiene **30 tablas físicas**. Las vistas se muestran en un recuadro gris separado y sin mezclarlas con el modelo normalizado.

## Configuración visual

- Frame horizontal de 3200 × 1800 px, fondo `#F8FAFC`.
- Título: **ERP CBN — Modelo relacional de inventarios en 3FN**.
- Subtítulo: **PostgreSQL · Modelo físico · Cardinalidad Crow's Foot**.
- Cajas de 250 a 300 px de ancho; encabezado de color y cuerpo blanco.
- Campos con fuente monoespaciada de 12–14 px.
- Etiquetas obligatorias: `[PK]`, `[FK]`, `[UQ]`, `[NN]`, `[CK]`.
- Conectores ortogonales, sin curvas y con máximo dos quiebres.
- Mostrar el nombre/rol de la FK cerca del extremo hijo cuando haya dos relaciones entre las mismas entidades.
- Convención Crow's Foot: `||` exactamente uno, `o|` cero o uno, `|{` uno o muchos y `o{` cero o muchos.
- No usar flechas simples porque no expresan cardinalidad.

### Paleta por dominio

| Dominio | Encabezado | Tablas |
|---|---|---|
| Organización | `#0F766E` | plants, warehouse_definitions, locations |
| Seguridad | `#6D28D9` | role_definitions, permissions, role_permissions, users, actors |
| Inventario | `#2563EB` | articles, lots, inventory_positions, reservations, movements, genealogy, counts, suggestions |
| Documentos | `#D97706` | document_headers, document_lines y cinco subtipos, suppliers |
| Integración/auditoría | `#475569` | inbox, business_effects, outbox, deliveries, audit, schema_migrations |
| Vistas derivadas | `#94A3B8`, borde discontinuo | roles, warehouses, balances, documents, inventory_view, bi_inventory, inventory_reconciliation |

## Distribución del lienzo

### Banda superior izquierda — Seguridad

```text
permissions ──< role_permissions >── role_definitions ──< users ── actor opcional
                                                              │
                                                            actors
```

Colocar `role_permissions` entre `permissions` y `role_definitions`. Colocar `users` a la derecha de `role_definitions` y `actors` debajo de `users`.

### Banda superior central — Organización

```text
plants 1 ───── N warehouse_definitions 1 ───── N locations
```

### Núcleo central — Inventario

```text
articles 1 ── N lots 1 ── N inventory_positions N ── 1 locations
                    │                 │
                    ├── genealogy    ├── reservations
                    ├── movements    └── counts
articles 1 ── N suggestions N ── 1 warehouse_definitions
```

`inventory_positions` debe ocupar el centro visual porque resuelve la relación N:M entre lotes y ubicaciones.

### Mitad derecha — Documentos

Colocar `document_headers` como entidad central. `document_lines` inmediatamente debajo. Distribuir los subtipos alrededor, evitando cruzar sus líneas:

- Arriba: `purchase_requests` → `purchase_orders` → `suppliers`.
- Derecha: `sales_orders`.
- Abajo derecha: `transfer_orders`.
- Abajo: `production_orders`.

Los subtipos usan su `document_id` simultáneamente como PK y FK. Representarlos como `document_headers ||──o| subtipo`.

### Extremo derecho — Integración y auditoría

Colocar `inbox`, `business_effects`, `outbox` y `deliveries` en una columna. Son tablas de frontera de integración y no deben conectarse ficticiamente al núcleo. Colocar `schema_migrations` al final. `audit` sí se conecta con `actors`.

### Banda inferior — Vistas

Crear un contenedor gris titulado **Vistas derivadas / fuera del DER físico**. Incluir cajas pequeñas para:

`roles`, `warehouses`, `balances`, `documents`, `inventory_view`, `bi_inventory`, `inventory_reconciliation`.

No dibujar estas vistas como tablas ni duplicar sus relaciones. Añadir la nota: **No almacenan una segunda copia del dato; proyectan o agregan tablas 3FN**.

## Relaciones exactas que debe dibujar Miro

### Organización y seguridad

1. `plants.id ||──o{ warehouse_definitions.plant_id`.
2. `warehouse_definitions.id ||──o{ locations.warehouse_id`.
3. `role_definitions.id ||──o{ users.role_id`.
4. `role_definitions.id ||──o{ role_permissions.role_id`.
5. `permissions.id ||──o{ role_permissions.permission_id`.
6. `users.id o|──o| actors.user_id`; aclarar que solo actores `USER` poseen `user_id`.
7. `actors.id ||──o{ movements.actor`.
8. `actors.id ||──o{ audit.actor`.
9. `actors.id ||──o{ counts.created_by` con etiqueta **creado por**.
10. `actors.id o|──o{ counts.approved_by` con etiqueta **aprobado por**.

### Inventario

11. `articles.id ||──o{ lots.article_id`.
12. `lots.id ||──o{ inventory_positions.lot_id`.
13. `locations.id ||──o{ inventory_positions.location_id`.
14. `lots.id ||──o{ reservations.lot_id`.
15. `locations.id ||──o{ reservations.location_id`.
16. `lots.id ||──o{ movements.lot_id`.
17. `locations.id ||──o{ movements.location_id`.
18. `lots.id ||──o{ counts.lot_id`.
19. `locations.id ||──o{ counts.location_id`.
20. `lots.id ||──o{ genealogy.parent_lot` con etiqueta **lote padre**.
21. `lots.id ||──o{ genealogy.child_lot` con etiqueta **lote hijo**.
22. `articles.id ||──o{ suggestions.article_id`.
23. `warehouse_definitions.id ||──o{ suggestions.warehouse_id`.

### Documentos

24. `document_headers.id ||──|{ document_lines.document_id`.
25. `articles.id ||──o{ document_lines.article_id`.
26. `document_headers.id ||──o| purchase_requests.document_id`.
27. `document_headers.id ||──o| purchase_orders.document_id`.
28. `document_headers.id ||──o| sales_orders.document_id`.
29. `document_headers.id ||──o| transfer_orders.document_id`.
30. `document_headers.id ||──o| production_orders.document_id`.
31. `suppliers.id ||──o{ purchase_orders.supplier_id`.
32. `purchase_requests.document_id o|──o| purchase_orders.request_document_id`.
33. `purchase_orders.document_id o|──o| purchase_requests.purchase_document_id`.
34. `warehouse_definitions.id ||──o{ sales_orders.warehouse_id`.
35. `warehouse_definitions.id ||──o{ production_orders.warehouse_id`.
36. `lots.id ||──o{ transfer_orders.lot_id`.
37. `locations.id ||──o{ transfer_orders.from_location_id` con etiqueta **origen**.
38. `locations.id ||──o{ transfer_orders.to_location_id` con etiqueta **destino**.
39. `articles.id ||──o{ production_orders.input_article_id` con etiqueta **insumo**.
40. `articles.id ||──o{ production_orders.output_article_id` con etiqueta **producto**.
41. `lots.id o|──o{ production_orders.output_lot_id` con etiqueta **lote producido**.
42. `document_headers.id ||──o{ reservations.document_id`.
43. `document_headers.id o|──o{ movements.document_id`.
44. `document_headers.id ||──o{ genealogy.document_id`.

No crear relaciones adicionales para `inbox`, `outbox`, `deliveries`, `business_effects` o `schema_migrations`.

## Restricciones que deben aparecer dentro de las entidades

Además de las PK y FK del DBML, resaltar:

- `[UQ] plants.name`.
- `[UQ] warehouse_definitions(plant_id, name)`.
- `[UQ] locations(warehouse_id, name)`.
- `[UQ] suppliers.name`.
- `[UQ] role_definitions.name` y `[UQ] permissions.description`.
- `[UQ] users.username` y `[UQ] actors.user_id`.
- `[UQ] movements.business_key`.
- `[UQ] inbox(source, event_id)`.
- `[UQ] reservations(document_id, lot_id, location_id)`.
- `[UQ parcial] counts(lot_id, location_id) WHERE status='PENDIENTE'`.
- `[UQ parcial] suggestions(article_id, warehouse_id) WHERE status='ABIERTA'`.
- `[UQ] purchase_requests.purchase_document_id`.
- `[UQ] purchase_orders.request_document_id`.

Checks principales:

- `articles.policy IN ('FIFO','FEFO')`.
- `articles.abc IN ('A','B','C')`.
- Demandas, plazos, seguridad, físico y cantidades no negativos; cantidades operativas mayores que cero.
- `lots.quality IN ('CUARENTENA','LIBERADO','BLOQUEADO','RECHAZADO')`.
- `reservations.status IN ('ACTIVA','COMPLETADA','CONSUMIDA')`.
- `counts.status IN ('PENDIENTE','APROBADO')`.
- `suggestions.status IN ('ABIERTA','RESUELTA')`.
- `transfer_orders.from_location_id <> to_location_id`.
- `production_orders.input_article_id <> output_article_id`.
- `genealogy.parent_lot <> child_lot`.
- `document_lines.received_quantity BETWEEN 0 AND quantity`.
- `actors`: si `kind='USER'`, `user_id` es obligatorio; para procesos del sistema debe ser nulo.

Notas de integridad no representables únicamente con FK:

- Trigger diferible: reservas activas no pueden superar el físico de `inventory_positions`.
- Triggers de inmutabilidad: `movements` y `audit` no permiten UPDATE ni DELETE.
- Correcciones de inventario mediante movimiento compensatorio, nunca reescritura histórica.

## Prompt listo para Miro AI

Copiar primero el contenido completo de `modelo-relacional-3fn.dbml` y después pegar este texto:

> Genera un diagrama entidad–relación físico, no un mapa conceptual. Usa exclusivamente las tablas y referencias del DBML que acabo de proporcionar. No inventes, elimines ni renombres columnas o relaciones. Emplea notación Crow's Foot y muestra en cada extremo la opcionalidad y cardinalidad. Organiza el lienzo horizontalmente por dominios: Seguridad arriba a la izquierda; Organización arriba al centro; Inventario en el centro; Documentos a la derecha; Integración y auditoría al extremo derecho. Coloca inventory_positions entre lots y locations; document_headers debe ser el centro de sus líneas y subtipos. Usa conectores ortogonales sin cruces siempre que sea posible y etiqueta las relaciones con roles dobles: lote padre/hijo, ubicación origen/destino, artículo insumo/producto y conteo creado/aprobado por. Muestra PK, FK, UQ, UQ parcial y CK junto a cada campo. Usa cuerpo blanco y encabezados por dominio: morado seguridad, verde petróleo organización, azul inventario, ámbar documentos y gris integración. No mezcles las vistas con las tablas: crea un contenedor gris discontinuo en la parte inferior para roles, warehouses, balances, documents, inventory_view, bi_inventory e inventory_reconciliation, indicando que son vistas derivadas y que no forman parte del DER físico normalizado. Título: “ERP CBN — Modelo relacional de inventarios en 3FN”. Subtítulo: “PostgreSQL · Modelo físico · PK/FK/UNIQUE/CHECK · Cardinalidad Crow's Foot”.

## Auditoría final antes de entregar

- Deben existir exactamente 30 cajas de tablas físicas.
- Deben verse 5 bloques de color y un bloque gris independiente de vistas.
- Ningún conector debe terminar en una vista.
- `role_permissions`, `inventory_positions` y `document_lines` deben mostrar su PK compuesta.
- Los cinco subtipos deben mostrar `document_id [PK, FK]`.
- Deben verse dos conectores distintos para padre/hijo, origen/destino e insumo/producto.
- No debe existir `center` dentro de `warehouse_definitions`, `permissions[]` dentro de roles, `data JSON` dentro de documentos ni `reserved` dentro de `inventory_positions`.
- Los JSON de integración pueden permanecer en inbox/outbox/audit porque representan mensajes o evidencia, no datos maestros del núcleo.

