# Guion de demostración

Usar datos ficticios. La demo conserva las operaciones; emplea referencias nuevas cuando quieras ejecutar un hecho distinto.

## 1. Acceso y módulos

Entra con `admin` / `CbnDemo2026!`. Muestra el dashboard y el menú. Explica que es un monolito NestJS con frontend React y PostgreSQL real. Los cuadros se calculan con datos de la base; no son números decorativos.

## 2. FIFO frente a FEFO

En el catálogo:

- `PT-001` rota por FEFO.
- `EN-001` rota por FIFO.

En Existencias, los lotes `PT-2601` y `PT-2602` tienen fechas deliberadamente diferentes: el segundo ingresó después, pero vence antes. Crea un pedido de `PT-001` en PLANTA por 10 cajas y pulsa **Reservar**.

Abre Preparación FIFO/FEFO: debe seleccionar `PT-2602` mientras tenga saldo libre. Comprueba que físico no cambió y reservado aumentó. Crea otro pedido de envases para comprobar FIFO con `EN-2601`.

## 3. Calidad

En Calidad → Lotes pendientes revisa los lotes en cuarentena. Una recepción aumenta físico pero no disponible. La decisión de Calidad libera el lote sin crear unidades.

Puedes bloquear un lote reservado e intentar confirmar su salida: el backend debe impedirlo. Libéralo con justificación antes de continuar.

## 4. Pedido, despacho y entrega

En el pedido reservado pulsa Confirmar salida. Se reduce físico y se consume la reserva. Luego registra evidencia de entrega: el físico no cambia otra vez.

La función Promesa calcula una estimación con ATP, seguridad y días declarados. No sustituye la reserva ni una confirmación del transportista.

## 5. Compras, tránsito y reorden

En Punto de reorden explica demanda × plazo + seguridad. Pulsa Evaluar inventario dos veces: no deben aparecer dos sugerencias abiertas para el mismo artículo.

Crea una solicitud de compra y conviértela en una orden. Aprueba la orden, marca En tránsito y recibe solo una parte en un lote nuevo. El pendiente sigue en tránsito; lo recibido queda en cuarentena.

## 6. Conteos y mermas

Entra con `almacen`, registra un conteo y observa que no modifica físico. Entra con `supervisor` para aprobar.

Si entre el conteo y la aprobación ocurre un movimiento o cambia una reserva, el sistema rechaza la versión antigua y exige un nuevo conteo. Un ajuste de conteo es distinto de una merma. Una pérdida real se registra aparte con su causa.

## 7. Producción y genealogía

Crea una orden con un insumo y un producto, reserva material y registra resultado. Usa merma cero para demostrar que no es un paso obligatorio. La operación consume insumo y crea producto en cuarentena.

En una segunda orden informa merma mayor a cero. Se registra producción bruta y una salida separada de merma; el saldo final es neto. Consulta la relación entre lote consumido, lote producido y orden en Trazabilidad.

## 8. Mensajes, caída y duplicados

1. Ve a Integraciones → Mensajería.
2. Simula un pedido BEES y observa Inbox y Outbox.
3. Pulsa Reenviar último evento: debe informar duplicado y no crear otro pedido.
4. Simula caída del destino.
5. Crea otra operación. La operación interna confirma y el Outbox queda pendiente.
6. Pulsa Actualizar cada pocos segundos: tras tres fallos queda en revisión.
7. Restaura el destino y pulsa Reintentar en el mensaje.
8. Confirma que hay una sola recepción del consumidor para ese eventId.

Aclara: el modo mostrado es PostgreSQL + consumidor local simulado, salvo que se haya configurado y comprobado explícitamente RabbitMQ.

## 9. Conciliación y auditoría

Muestra Integraciones → Conciliación. La diferencia entre físico y suma de movimientos debe ser cero, al igual que la diferencia de reservas.

Muestra Auditoría para identificar quién realizó cada acción. La conciliación solo compara: no inventa ajustes ni mermas.

## 10. Evidencia automatizada

Ejecuta `npm test` para los escenarios de API y `node tests/ui.mjs` con la demo abierta para navegación y capturas. Las pruebas de API trabajan en otra base; no contaminan los datos que muestras.
