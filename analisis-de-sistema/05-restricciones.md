# 05. Restricciones

Se distinguen obligaciones del proyecto, decisiones
técnicas vigentes y propuestas aún sujetas a validación. Fuentes principales:
[constitución 1.1.0](../.specify/memory/constitution.md),
[alcance](../docs/alcance-mvp.md), [decisiones](../docs/decisiones-pendientes.md),
[plan de identidad](../specs/001-identidad-acceso-roles/plan.md) y su actualización R12.

| ID | Tipo | Restricción / decisión respaldada | Estado y consecuencia |
| --- | --- | --- | --- |
| RT01 | Curso y proceso | Trabajo final de cuatro meses, desarrollado por una persona; avanzar por funcionalidades pequeñas mediante Spec Kit, con documentos en español y aceptación verificable. | Constitución I y plan. La rúbrica completa sigue pendiente D10. |
| RT02 | Presupuesto | S/300 **en total** para infraestructura, despliegue y pruebas necesarias; no presupuesto mensual ni financiación de operación permanente. | Constitución y D09. Alojamiento, correo y transferencia de video necesitan estimación sustentada antes de contratar. |
| RT03 | Tecnología y estructura | React/TypeScript/Vite; NestJS/TypeScript como monolito modular; npm workspaces; PostgreSQL 16 y Prisma. | Plan, manifests/lockfile y verificación Docker. Base instalada/probada, sin funciones de negocio. No cambiar de motor ni introducir un proyecto nuevo. |
| RT04 | Entorno y despliegue | Docker Compose como entorno principal con PostgreSQL 16.14, Mailpit, API y web Linux. Publicación futura con Nginx/HTTPS. | Motor Linux y pruebas locales en [verificación Docker](../ops/docker/verification.md). No acredita producción ni ejecución del workflow remoto. |
| RT05 | Complejidad | No añadir microservicios, Kubernetes, Redis o balanceadores sin necesidad comprobada. No dimensionar ahora para 10 000 usuarios. | Constitución y plan: proceso Nest único, persistencia común por entorno y ejecutor interno para correo. |
| RT06 | Pago externo | Izipay elegida desde 2026-09-23; separar adaptador del proveedor de órdenes/matrículas. Probar carga con pagos simulados y la integración aparte en sandbox, sin cobros reales. | Constitución V–VII y D02. Tarifas, límites, sandbox y Yape pendientes; no se supone integración, disponibilidad ilimitada ni modalidad comercial. |
| RT07 | Correo | Captura local con Mailpit sin envío real; futura salida SMTP por configuración con TLS/remitente/DNS y cuota verificados. | Plan/research R07–R08, con ejecución local mediante Compose. No hay proveedor contratado ni gratuidad garantizada. |
| RT08 | Video y participación | Emite el docente mediante OBS hacia YouTube Live; alumnos espectadores con chat, sin audio/cámara/pantalla. YouTube Live es la elección para el MVP. | DA03 y DEC01; integración y compatibilidad con los controles de RF16 pendientes D07–D08. Deben probarse acceso directo y permisos vencidos; no prometer protección contra grabaciones. Grabaciones automáticas fuera del MVP. |
| RT09 | Entornos y datos | Separar configuración, secretos y datos de desarrollo, demo y producción; no versionar credenciales; usar datos ficticios y migraciones controladas. | Constitución IX–X. No obliga a mantener servidores permanentes por entorno. Restauración demostrada requerida antes de demo persistente/publicación. |
| RT10 | Alcance y reglas pendientes | Aproximadamente 1000 estudiantes y grupos de 40–50; un rol por cuenta. Sin exámenes, certificados ni apps nativas. Un pago por orden y matrícula por curso siguen siendo propuestas. | Alcance, identidad y D01–D06/D12. No implementar reservas, reembolsos, vigencia o permisos académicos sin especificarlos; ninguna población prevista acredita concurrencia. |
| RT11 | Aceptación y evidencia | 1000 usuarios concurrentes es requisito por validar con escenarios reproducibles, criterios y duración acordados con el profesor. | Constitución XI y D10. No se sustituyen pruebas de carga por builds, arranque Docker, páginas abiertas o ensayos de compatibilidad. |

Las versiones puntuales y resultados del entorno se mantienen en
[compatibility.md](../ops/docker/compatibility.md) y el lockfile. Este documento no fija
versiones diferentes ni declara resueltas la auditoría de dependencias, la
operación recuperable o las condiciones comerciales de las integraciones.
