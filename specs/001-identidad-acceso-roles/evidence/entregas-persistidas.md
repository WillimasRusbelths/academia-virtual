# Entregas persistidas y recuperación — T025–T026

Fecha local: 2026-10-13. Rama: `feat/001-identidad-acceso-roles`. Base: `aa60e50`.
Árbol inicial limpio, sin fusión pendiente ni AGENTS.md aplicable. Prerrequisitos y checklist
documental 16/16 revisados mediante el flujo Spec Kit; sin hooks de extensiones. T024 estaba
verificada y estos archivos de ejecutor no existían. La revisión de spec, plan, modelo y
R08/R09 no encontró decisiones bloqueantes para este bloque (FR-023/029–031/033).

## Criterios y resultados

| Criterio | Resultado comprobado en T026 |
| --- | --- |
| Ejecución interna cada 5 s, máximo dos | Scheduler ensamblado por AppModule como provider de ciclo de vida. No superpone ciclos y espera su cierre antes de cerrar el pool. Pruebas de intervalo, ensamblaje Nest y dos ejecutores concurrentes; máximo dos leases vigentes y dos envíos por ciclo. |
| Claims persistidos y SKIP LOCKED | Transacciones cortas, lease de 60 s y claimId aleatorio. Una fila retenida se omite; durante SMTP otro cliente puede bloquear entregas y buckets, demostrando que el envío no mantiene la transacción. Admisión global serializada brevemente con lock advisory por BD/esquema, sin locks de cuentas. |
| Cuota SMTP e intento atómicos | Reutiliza PostgresRateStore y ventanas móviles: 1/minuto, 5/hora por destinatario/propósito y 20/hora por origen sumando propósitos. Huellas HMAC persistidas, locks lexicográficos y fases separadas; cada claim que va a enviar reserva cuota e incrementa intento en un commit. Si falta cuota, pospone sin intento. |
| Timeout y reintentos | Límite total de envío de 20 s con AbortSignal; el adaptador destruye el socket propio, conservando TLS/STARTTLS validado. Reintentos +60/+300 s, tres contactos como máximo. Lease abandonado conserva el intento y se reprograma desde su vencimiento más el backoff; no se reinician cuotas ni contadores. |
| Recuperación y ejecutor viejo | Proceso hijo con adaptador compilado se interrumpió con SIGKILL después del claim confirmado. Otro ejecutor recuperó el trabajo y lo envió a Mailpit tras preparar el lease vencido en el fixture. Confirmaciones con claimId anterior o lease vencido no alteran la nueva entrega. Un tercer lease abandonado termina sin cuarto contacto. |
| Caducidad, obsolescencia y limpieza | Cancelación de cuenta desactivada, token revocado/consumido/expirado, correo cambiado, verificación ya completada y reset sin verificación. Cifrado dañado se termina antes de reservar intento/cuota; fallo permanente termina después de un contacto. Se borran ciphertext/nonce/tag/keyId al terminar, sin cambiar expiresAt del token. Cuota/backoff que no cabe antes de vencer cancela. |
| SMTP aceptado y registro en BD | Se provocó fallo de confirmación tras aceptación real en Mailpit; después de recuperar el lease, Mailpit recibió dos mensajes con el mismo enlace. No se promete entrega exactamente una vez. sentAt representa aceptación SMTP registrada, no lectura ni entrega final. |

Fuentes: [ejecutor](../../../apps/api/src/modules/mail/application/deliver-pending.ts),
[almacenamiento](../../../apps/api/src/modules/mail/infrastructure/delivery-store.ts),
[scheduler](../../../apps/api/src/modules/mail/infrastructure/delivery-scheduler.ts),
[elegibilidad](../../../apps/api/src/modules/identity/infrastructure/delivery-eligibility.ts) y
[pruebas](../../../apps/api/tests/integration/mail-delivery.spec.ts).
El contrato de elegibilidad tiene una definición pública sin dependencia de aplicación,
reexportada desde delivery-ports para conservar sus consumidores. Aplicación/dominio no
importan SQL, SMTP ni Nest. No se añadieron endpoints, bypasses, procesos ni servicios.

## Verificación en Docker

| Comando | Resultado final |
| --- | --- |
| `docker compose up -d --build api` | Imagen API compilada con dependencias/lockfile existentes |
| `docker compose exec -T api npm run lint` | Ambos workspaces y reglas de capas: exit 0 |
| `docker compose exec -T api npm run build` | API y web: exit 0 |
| `docker compose exec -T api npm run test:unit` | 23 aprobadas: 22 backend y 1 web |
| `docker compose exec -T -e APP_ENV=test api npm run test:integration` | 157 aprobadas en 12 archivos: 25 nuevas y 132 regresiones |

Ensayo adicional: `docker compose pause mailpit`, ejecutar exclusivamente el caso
`caída real de Mailpit` con `APP_ENV=test`, `TEST_MAILPIT_DOWN=true` y filtro `-t`, y
`docker compose unpause mailpit` en finally. El caso pasó: timeout en aproximadamente
20 s, estado PENDING con un intento y ready HTTP 200. Los otros 24 casos quedaron fuera
de ese filtro; sí pasaron en la ejecución completa. No se borraron mensajes de Mailpit.
El límite temporal también se comprobó a 19 999/20 000 ms con temporizadores controlados
solo en pruebas. Backoffs, vencimientos y cuotas se adelantan preparando filas del esquema
aislado, sin controles HTTP de reloj ni cambios de constantes productivas.

La primera ejecución detectó un cast de enum faltante en el fixture y una reexportación
public→application prohibida; se corrigieron antes de la ejecución satisfactoria. Una
regresión que cierra intencionalmente el pool produjo solo el mensaje genérico del scheduler.
No se imprimieron contraseñas, enlaces, payloads ni errores remotos.

Al inicio faltaba MailDelivery en desarrollo. Se aplicaron las migraciones ya versionadas
con `docker compose exec -T api npm run db:migrate:deploy`, sin migraciones nuevas,
`db:migrate:dev`, base sombra, reset ni reinicialización de volumen. Comprobación final:
cuatro migraciones registradas, cero cuentas/entregas de prueba en desarrollo y API,
PostgreSQL y Mailpit saludables, con Mailpit reanudado. Los fixtures se limitaron a esquemas
aislados de academia_v00_test. Docker, dependencias y configuración se conservaron.

## Límites

T025 y T026 completas como fundamentos. No hay todavía solicitudes funcionales de registro,
reenvío, verificación o recuperación ni aceptación integral V13; el consumo único se
implementará en sus historias. Tampoco se cierra retención/purga, producción, proveedor real,
recuperación operativa o capacidad de 1000 concurrentes. Una revocación posterior a la
última comprobación puede dejar llegar un enlace inválido; la entrega SMTP no se revierte.
La selección de dos candidatos limita el trabajo de cada ciclo, sin garantizar orden FIFO.
Siguiente bloque: T027, auditoría transaccional y registros privados de seguridad/operación.
