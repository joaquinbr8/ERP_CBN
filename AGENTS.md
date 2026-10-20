# ERP CBN

Prototipo académico local para una línea y un centro de distribución. Frontend React/TypeScript, backend NestJS modular, PostgreSQL. El servicio Inventario es el único escritor de saldos y movimientos. Mantener operaciones atómicas, auditoría, control de roles en backend, cantidades decimales y no duplicidad técnica y de negocio. No añadir Finanzas, Contabilidad ni RR. HH. MES, BEES, TMS y ePOD son simuladores identificados; no hay conexión real a CBN. RabbitMQ es un modo de transporte configurable; no afirmar que está activo sin verificarlo.

Ver README.md, docs/ARQUITECTURA.md y docs/COBERTURA.md. Ejecutar npm run build y las pruebas contra una base local exclusiva. Nunca reiniciar o borrar la base del usuario.
