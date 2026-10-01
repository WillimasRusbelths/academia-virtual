# Arquitectura inicial de Academia Virtual
Sobre el repositorio `academia-virtual` existente,
incluidos sus cambios locales previos. Esta es una vista inicial de **tres capas lógicas**
del MVP. Se conserva
el monolito modular del [plan de identidad](../specs/001-identidad-acceso-roles/plan.md).

## Inventario y estado del repositorio

| Material revisado | Qué aporta | Estado que permite afirmar |
| --- | --- | --- |
| [README](../README.md) | Nombre, propósito, presupuesto y navegación. | Tenía referencias a una etapa sin código; se actualizan en esta entrega. |
| [Constitución 1.1.0](../.specify/memory/constitution.md) | Seguridad, precios, integridad, pagos, video, entornos, recuperación, capacidad y gobernanza. | Obligaciones del proyecto; no pruebas superadas. |
| [Alcance MVP](../docs/alcance-mvp.md) y [decisiones D01–D13](../docs/decisiones-pendientes.md) | Áreas funcionales, exclusiones, presupuesto e integraciones. | Fuente del alcance general. Su estado del 2026-09-23 es histórico; se añaden notas de vigencia sin sustituir reglas pendientes. |
| [Spec de identidad](../specs/001-identidad-acceso-roles/spec.md) y [checklist](../specs/001-identidad-acceso-roles/checklists/requirements.md) | 7 historias, 33 FR, 10 criterios de éxito, roles y flujos definidos. | Calidad documental revisada; sin historias implementadas. |
| [Plan](../specs/001-identidad-acceso-roles/plan.md) y [research](../specs/001-identidad-acceso-roles/research.md) | Monolito modular, sesiones opacas, correo persistido, decisiones R01–R12. | Diseño aprobado; R12 (2026-09-27) adopta Windows nativo y PostgreSQL 16.14. |
| [Modelo de datos](../specs/001-identidad-acceso-roles/data-model.md), [API](../specs/001-identidad-acceso-roles/contracts/api.md) y [UI](../specs/001-identidad-acceso-roles/contracts/ui.md) | Entidades/invariantes, contratos HTTP y pantallas de identidad. | Diseños de destino; no tablas/endpoints/pantallas funcionales existentes. |
| [Quickstart](../specs/001-identidad-acceso-roles/quickstart.md), [verification](../specs/001-identidad-acceso-roles/verification.md) y [tasks](../specs/001-identidad-acceso-roles/tasks.md) | Procedimientos, V00/V01–V16, ensayos de carga y 108 tareas. | 8 tareas marcadas T003–T010; 100 pendientes, incluidas T001/T002 diferidas. Sin ejecución de carga ni aceptación funcional. |
| [Entorno nativo](../ops/local/native.md), [environment](../ops/local/environment.md), [compatibility](../ops/local/compatibility.md) y [review-v00](../ops/local/review-v00.md) | Evidencia local y revisión de compatibilidad. | V00 Windows aprobado; PostgreSQL/Argon2/SMTP Mailpit ensayados. Auditoría de dependencias pendiente; no acredita producción. |
| [T009: arquitectura](../ops/local/architecture.md) y [T010: pruebas](../ops/local/test-harness.md) | Composición Nest, límites de importación y soporte de pruebas. | Evidencia del 2026-09-29 de lint/build/unitarias/integración/E2E del esqueleto; archivos con cambios locales previos. |
| [Código API](../apps/api/src/app.module.ts), [Probe](../apps/api/src/probe.module.ts) y [web](../apps/web/src/app/App.tsx) | AppModule ensambla Probe; `GET /health/live` devuelve estado; React muestra «En preparación». | Base técnica implementada. No login, cuentas, cursos, órdenes, pagos, matrícula, materiales, clases, chat ni paneles funcionales. |
| [Paquetes](../package.json), [API](../apps/api/package.json), [web](../apps/web/package.json) y [lockfile](../package-lock.json) | npm workspaces y dependencias reales de React/Vite, NestJS/TypeScript, Prisma/pg, Argon2 y Nodemailer; herramientas de pruebas. | Instalación y compatibilidad documentadas, no prueba de uso en funciones inexistentes. El [schema de ensayo](../ops/local/compatibility/prisma/schema.prisma) solo contiene CompatibilityProbe. |
| [Compose Linux](../compose.linux.yml), [procedimiento Linux](../ops/linux/README.md) y [workflow](../.github/workflows/v00-linux.yml) | Preparación de PostgreSQL/Mailpit para ensayo V00-L. | No ejecutado según evidencia. Compose no incluye despliegue de la aplicación completa ni video. |

## Decisiones vigentes y discrepancias resueltas

Para alcance y obligaciones se conservan constitución/especificación; para entorno y
estado se usa la actualización fechada más reciente respaldada por código/evidencia.
Una lista de tareas futuras no cuenta como implementación.

| Diferencia encontrada | Decisión usada y fundamento |
| --- | --- |
| README/alcance indicaban que no había aplicación ni scripts; ahora existen workspaces y pruebas. | Hay esqueleto técnico y herramientas verificadas, pero no funciones de negocio. Código y evidencia T009/T010 del 2026-09-29 prevalecen para estado. |
| Documentos iniciales proponían Docker Compose local y PostgreSQL 17 en el diseño anterior; R12 cambia entorno/versión. | Windows nativo con Node, PostgreSQL **16.14** y Mailpit. R12 y V00 respaldan esta elección. El responsable confirma Docker operativo al 2026-10-01; eso no acredita ejecución de la aplicación ni V00-L. Cliente/Compose y configuración se comprobaron, pero el daemon no respondió en esta revisión; véase [entorno](../ops/local/environment.md#actualización-docker--2026-10-01). `pg_dump17` en T097 requiere adecuación/comprobación al implementar recuperación; no ordena cambiar el motor actual. |
| D11/checklist dicen «lista para planificar», pero ya hay plan y tareas. | Comportamiento y diseño de identidad definidos; fundamentos T003–T010 completados, historias aún pendientes. Se preserva el registro histórico y se aclara en docs/README. |
| El encabezado anterior de tasks enumeraba T003–T008 al 2026-09-28; casillas y evidencia posterior incluyen T009/T010. | Se sincroniza el resumen con las ocho tareas T003–T010 y se conservan 100 pendientes. Docker informado como operativo no cierra automáticamente las verificaciones completas T001/T002 ni V00-L. |
| Culqi aparece como candidata histórica. | Izipay elegida desde 2026-09-23 según D02 y constitución; sin integración. La regla de un pago por orden sigue pendiente independiente de la pasarela. |
| Plan describe entradas/aplicación/dominio/infraestructura; la guía pide tres capas. | Son niveles de detalle compatibles: presentación = web/entradas; negocio = aplicación/dominio; datos = persistencia. Adaptadores externos quedan en el límite del módulo que los usa; no son una cuarta capa de negocio ni parten de PostgreSQL. |


