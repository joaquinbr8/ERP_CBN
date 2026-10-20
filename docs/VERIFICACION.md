# Verificación del prototipo

Fecha: 20 de octubre de 2026. Entorno: Windows, PostgreSQL local, backend NestJS y navegador Chrome.

## Resultados observados

| Comprobación | Resultado |
|---|---|
| API y base de datos disponibles | `/api/health` respondió correctamente en el puerto 3100 |
| Pruebas funcionales del backend | 27 aprobadas, 0 fallidas |
| Navegación de interfaz | 29 pantallas recorridas sin errores JavaScript |
| Interacciones de interfaz | Acceso, filtro de existencias, detalle de lote, apertura y cancelación de recepción |
| Adaptación móvil | Verificación de ancho de página y apertura/cierre del menú a 390 px |

Las pruebas funcionales se ejecutaron en `cbn_test_1792496785373`, una base independiente conservada como evidencia. No alteraron los datos de `cbn_erp`.

## Qué demuestran las pruebas de backend

1. Los permisos se aplican en el servidor; un usuario desactivado pierde el acceso incluso con un token anterior.
2. Una recepción crea existencias físicas en cuarentena, no disponibles para reservar.
3. Reenviar el mismo evento no crea otro movimiento. Reutilizar su identificador con otro contenido se rechaza.
4. Dos identificadores técnicos diferentes que describen el mismo hecho se deduplican por clave de negocio.
5. FEFO selecciona por vencimiento; FIFO por ingreso. Los lotes vencidos quedan excluidos.
6. Dos reservas concurrentes incompatibles no sobreasignan existencias.
7. Bloquear un lote reservado impide despacharlo. Confirmar entrega no vuelve a descontar stock.
8. Los traslados mantienen el estado de tránsito sin duplicar disponibilidad.
9. Un conteo necesita aprobación de otra persona autorizada; si el saldo cambió, el conteo se considera obsoleto.
10. Una merma excesiva se rechaza sin cambios parciales.
11. Producción registra consumo, lote resultante y genealogía de manera atómica, con o sin merma.
12. Un fallo al registrar el resultado de producción revierte también el consumo.
13. Una recepción parcial de compra reduce el pendiente una sola vez.
14. Una solicitud de compra no se convierte dos veces en orden.
15. El punto de reorden genera una sugerencia abierta por artículo, sin duplicarla.
16. ATP considera el stock de seguridad definido en el piloto y cada nueva promesa incrementa su versión.
17. Una versión antigua de calidad no reemplaza una decisión posterior.
18. La base rechaza la reescritura del historial de movimientos.
19. La conciliación compara movimientos, existencias y reservas sin corregir automáticamente saldos.
20. El worker conserva mensajes ante fallos, pasa a revisión después del límite de reintentos y entrega sin duplicar el efecto en el consumidor simulado.
21. Las respuestas revisadas no exponen hashes de contraseñas.

## Evidencia visual

Las capturas generadas por `npm run test:ui` están en `.local/screenshots`:

- `01-acceso.png`: inicio de sesión.
- `02-dashboard.png`: panel principal con datos de la base.
- `03-inventario.png`: existencias por lote.
- `04-lote.png`: historial del lote.
- `05-recepcion.png`: formulario de recepción.
- `06-integraciones.png`: Inbox, Outbox y consumidor simulado.
- `07-movil.png`: panel en ancho móvil.

La prueba de navegador comprueba navegación y las interacciones indicadas, no el envío de todos los formularios. Las reglas transaccionales se verifican a través de la API contra PostgreSQL real.

## Reproducción

Con PostgreSQL disponible:

```powershell
npm run build
npm test
```

Con la aplicación abierta en el puerto 3100:

```powershell
npm run test:ui
```

Cada ejecución de `npm test` conserva una nueva base de evidencia. Las capturas se actualizan al ejecutar la prueba visual.

## Alcance de la evidencia

Esto verifica un prototipo académico local, no un sistema certificado para producción. No se probaron conexiones reales con MES, BEES, TMS, ePOD o Power BI, ni el transporte RabbitMQ contra un broker activo. Tampoco se realizaron pruebas de carga, recuperación de respaldos o auditoría integral de seguridad.
