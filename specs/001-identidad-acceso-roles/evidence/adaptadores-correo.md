# Contratos y adaptadores de correo — T024

Fecha local: 2026-10-13. Rama: `feat/001-identidad-acceso-roles`.
Base: `785028e`. Árbol inicial limpio, sin fusión pendiente ni AGENTS.md aplicable.

## Selección y coherencia

Se revisaron especificación, plan, tareas, modelo, contratos, verificación y evidencias
de T011–T023. El checklist documental conserva 16/16 casillas; no acredita funcionalidad.
T024 era la primera tarea pendiente y sus tres archivos de implementación no existían.
T023 tenía código, pruebas y evidencia; sus regresiones se ejecutaron en este bloque.
La revisión de consistencia no identificó decisiones bloqueantes para T024: FR-026/033
exigen proteger secretos; FR-029/030 y R07/R08 delimitan los enlaces y el correo. Proveedor,
remitente y condiciones de producción siguen pendientes; no bloquean captura local.

El script de prerrequisitos se ejecutó con `powershell -NoProfile -ExecutionPolicy Bypass`
en un proceso nuevo: resolvió la carpeta existente, sin cambiar la política del equipo.
No hay `.specify/extensions.yml` ni hooks que ejecutar. Docker Desktop estaba detenido;
se inició la instalación existente y se reconstruyó únicamente la imagen API. No se
instalaron dependencias ni se modificaron Docker, versiones, migraciones o volúmenes.

## Criterios comprobados

| Criterio de T024 | Implementación y evidencia |
| --- | --- |
| Contratos de transporte/elegibilidad | [delivery-ports.ts](../../../apps/api/src/modules/mail/application/delivery-ports.ts) define Mailer, DeliveryEligibility y PayloadCipher, con datos y errores tipados. No importa identidad, SMTP, HTTP ni PostgreSQL. La implementación de elegibilidad corresponde a T025. |
| Captura local aislada | [smtp-transport.ts](../../../apps/api/src/modules/mail/infrastructure/smtp-transport.ts) usa únicamente Mailpit en desarrollo/test y destinatarios `@example.test`. Rechaza servidor remoto, cambio de modo y destinatario externo antes de crear conexiones. Dos mensajes ficticios, uno por plantilla, se aceptaron y localizaron en Mailpit. No se eliminaron mensajes existentes. |
| TLS obligatorio | Opciones 465/TLS implícito y 587/STARTTLS obligatorio, con validación de certificados y sin fallback. Servidores efímeros loopback comprobaron rechazo de STARTTLS no disponible antes de AUTH y rechazo de certificado autofirmado. Solo los tests redirigen las opciones a puertos efímeros; el adaptador no expone bypass productivo. |
| AES-256-GCM | [payload-cipher.ts](../../../apps/api/src/modules/mail/infrastructure/payload-cipher.ts) usa la clave externa existente, nonce aleatorio de 12 bytes, tag de 16 y keyId autenticado. Ida/vuelta para ambos propósitos; rechazo de alteraciones, clave distinta, identificador desconocido y tamaños inválidos. |
| Payload sin contraseñas ni clave persistible | Lista cerrada de recipient/link/template, también al descifrar. Rechaza password, provisionalPassword, passwordHash y cualquier campo extra. Solo devuelve encryptedPayload/nonce/authTag/keyId: la clave no está en el resultado destinado a MailDelivery ni se añade al esquema. No se guardaron entregas en BD en esta tarea. |
| Errores seguros | Clasificación TIMEOUT/TEMPORARY/PERMANENT sin respuesta remota, causa ni valores; logs/debug deshabilitados. No declara éxito si SMTP no acepta al destinatario. |

## Ejecución y resultados

Comandos desde la raíz, dentro de Docker Compose:

| Comando | Resultado final |
| --- | --- |
| `docker compose up -d --build api` | Construcción reproducible con lockfile y compilación API; API, PostgreSQL y Mailpit saludables |
| `docker compose exec -T api npm run lint` | Ambos workspaces y reglas de dependencias: exit 0 |
| `docker compose exec -T api npm run build` | API TypeScript y web TypeScript/Vite: exit 0 |
| `docker compose exec -T api npm run test:unit` | 23 aprobadas: 22 backend y 1 web |
| `docker compose exec -T -e APP_ENV=test api npm run test:integration` | 132 aprobadas en 11 archivos: 25 nuevas y 107 regresiones |

Las [25 pruebas nuevas](../../../apps/api/tests/integration/mail-adapters.spec.ts) cubren
14 casos de payload y 11 de transporte. Las regresiones usan PostgreSQL real y esquemas
aislados de pruebas, incluidos constraints, migraciones incrementales, sesiones, permisos,
límites y transporte HTTP. No se ejecutó `db:migrate:dev` ni se necesitó base sombra.

La primera ejecución aislada tuvo 21/23 aprobadas: dos comparaciones fallaron por el
orden de las propiedades JSON, no por pérdida de datos. Se sustituyeron por igualdad
estructural booleana, sin imprimir enlaces. Lint detectó una importación inline de tipo;
se corrigió a import type. Se reconstruyó la imagen y la ejecución final incluyó las
correcciones y dos casos adicionales. No se registraron secretos en logs o evidencia.

## Límites y siguiente bloque

T024 completa adaptadores, no envíos funcionales desde registro o recuperación. Aceptación
SMTP no implica entrega final, lectura ni exactamente una vez. El contrato de elegibilidad
no consulta cuentas todavía. La clave activa es única; no se implementa rotación multiclave.
Los timeouts de transporte no sustituyen el límite total de 20 segundos del ejecutor T025.

T025 debe integrar almacenamiento, elegibilidad, cuotas, reclamación, lease y ejecutor;
T026 verifica recuperación y fallos del trabajo persistido. Ambas permanecen sin marcar,
igual que T027–T030, las historias y V01–V16. No se probaron proveedor SMTP remoto,
producción, navegador, recuperación operativa ni los 1000 concurrentes.
