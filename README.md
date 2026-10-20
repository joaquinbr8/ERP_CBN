# ERP CBN · Inventario y operaciones

Prototipo académico funcional: **React + TypeScript, NestJS y PostgreSQL**. El inventario es la fuente oficial de existencias. No es una instalación productiva de CBN y no contiene información real de la empresa.

## Abrir la aplicación

En esta computadora ya están instaladas las dependencias y creada una base exclusiva para la demo.

1. Abre `Iniciar-ERP.cmd` en esta carpeta, o ejecuta `npm run demo`.
2. Abre **http://127.0.0.1:3100**.
3. Usuario: **admin**. Contraseña de demostración: **CbnDemo2026!**

Mantén abierta la terminal que ejecuta la aplicación. Si ya está funcionando, no inicies otra copia en el mismo puerto. Ctrl+C detiene la aplicación; PostgreSQL puede seguir ejecutándose localmente. No borres `.local/pgdata`: contiene tus registros.

Otros usuarios de demostración, con la misma contraseña: `almacen`, `calidad`, `compras`, `produccion`, `despacho`, `supervisor` y `gerencia`. Los permisos de escritura se verifican en el servidor, no solo ocultando botones.

## Qué puedes demostrar

- Recepción de material, cuarentena, liberación o bloqueo del lote.
- Existencias permanentes por artículo, lote y ubicación; unidades independientes.
- Reservas FIFO/FEFO con selección real de lotes y protección frente a sobreasignación concurrente.
- Pedido → reserva → despacho → entrega. La entrega no descuenta dos veces.
- Solicitud → orden de compra → aprobación → tránsito → recepción parcial o total.
- Traslado interno: salida, tránsito y recepción en destino.
- Consumo de producción, lote de salida en cuarentena, genealogía y merma opcional.
- Conteo físico, diferencia y aprobación por otro usuario; rechazo de conteos obsoletos.
- Mermas justificadas y movimientos inmutables.
- Punto de reorden, sugerencias sin duplicar y estimación de entrega con ATP.
- Inbox, clave de negocio, Outbox, worker, caída simulada y reintentos.
- Conciliación de saldo contra movimientos y reservas, sin correcciones automáticas.
- Catálogos, creación de usuarios y roles, asignación de rol, auditoría, exportaciones CSV.

La pantalla **Integraciones** diferencia explícitamente simulación y transporte real. Por defecto usa una cola persistente en PostgreSQL con un consumidor local simulado, **no RabbitMQ**.

## Instalación desde cero

Requisitos: Node.js 22, npm y PostgreSQL local. El script reconoce la instalación de Scoop de esta computadora. En otro equipo, configura `PG_BIN` con la carpeta de ejecutables de PostgreSQL.

```powershell
cd C:\Users\Bermejo\Documents\Codex\ERP_CBN
npm install
npm run build
npm run demo
```

`npm run demo` prepara PostgreSQL, aplica el esquema de forma idempotente, carga datos solo si la base está vacía y arranca el backend que sirve también el frontend compilado. No borra datos.

PostgreSQL de demo: `127.0.0.1:55432`, base `cbn_erp`, usuario `cbn_demo`. Su directorio es `.local/pgdata`. Se ha configurado acceso local `trust` exclusivamente para este prototipo: cualquier proceso local puede acceder. **No exponerlo a la red ni usar esta configuración en producción.**

Para una base administrada distinta, define `DATABASE_URL` en `.env` (ver `.env.example`), ejecuta `npm run seed` y después `npm start`. `npm run demo` está diseñado específicamente para la base local de Scoop, no para aprovisionar bases remotas.

## Desarrollo

```powershell
npm run db:setup
npm run build
npm run seed
npm run dev
```

Frontend de desarrollo: `http://127.0.0.1:5173`, proxy hacia la API en `3100`. El backend debe recompilarse cuando cambie TypeScript; su script actual compila al arrancar y observa el JavaScript compilado. Usa `npm run build` antes de volver a iniciar la demo.

## Pruebas

```powershell
npm run build
npm test
# Con la demo abierta:
npm run test:ui
```

Las pruebas de API crean una base **nueva e independiente** llamada `cbn_test_<fecha>` y una API en el puerto 3101. Nunca vacían ni alteran `cbn_erp`. Se conserva la base de pruebas como evidencia; no se elimina automáticamente. Las capturas de navegador quedan en `.local/screenshots`. Las pruebas visuales usan Chrome instalado y Playwright.

## Documentación

- [Arquitectura e invariantes](docs/ARQUITECTURA.md).
- [Cobertura y límites del prototipo](docs/COBERTURA.md).
- [Guion de demostración ante el docente](docs/DEMO.md).
- [Resultados y evidencia de verificación](docs/VERIFICACION.md).

## Límites importantes

MES, BEES, TMS, GPS, ePOD y Power BI **no están conectados a plataformas reales**. BEES tiene una entrada simulada desde la pantalla de mensajería; los resultados de producción y las evidencias de entrega se registran en formularios locales. La estimación de entrega no optimiza rutas ni valida ventanas reales del cliente.

El adaptador RabbitMQ está implementado como modo opcional, pero su ejecución requiere un broker disponible y verificación adicional. La cola PostgreSQL y el consumidor simulado son el modo probado de esta entrega. No se incluye facturación electrónica, cobros reales, contabilidad, nómina, un WMS externo ni una conexión oficial con CBN.

Antes de un uso productivo se requieren credenciales individuales, gestión segura de secretos, autenticación de integraciones, TLS, políticas de respaldo/restauración comprobadas, pruebas de carga, segregación de acceso de lectura, migraciones versionadas y revisión de seguridad.
