# Auditoría transaccional y privacidad — T027

Fecha local: 2026-10-13. Rama: `feat/001-identidad-acceso-roles`. Base: `3949e1a`.
Árbol inicial limpio; sin AGENTS.md aplicable ni hooks de extensiones. Se revisaron T027,
su dependencia T026, U1, FR-025/026/033, plan y V12. Checklist documental: 16/16.
AuditEvent ya tenía tabla y constraints; no existían el validador, escritor ni logger.
No se encontraron decisiones bloqueantes para esta tarea.

## Criterios comprobados

| Criterio | Implementación y prueba |
| --- | --- |
| Eventos aceptados y campos cerrados | [audit-event.ts](../../../apps/api/src/modules/audit/domain/audit-event.ts): ACCOUNT_CREATED, BOOTSTRAP_ADMIN_CREATED, NAME_CHANGED, ROLE_CHANGED y STATUS_CHANGED; resultados APPLIED/NO_CHANGE, UUID y cambios solo de enums. No acepta nombres, correos, secretos ni propiedades arbitrarias. SYSTEM_BOOTSTRAP requiere actor nulo y creación aplicada; ACCOUNT requiere referencia válida. |
| Commit compartido | [audit-writer.ts](../../../apps/api/src/modules/audit/infrastructure/audit-writer.ts) recibe el PoolClient de la mutación, exige BEGIN mediante savepoint y no hace commit. Altas y cambios del harness permanecen invisibles fuera de la transacción hasta confirmar; rollback externo elimina también el evento. Instante e ID provienen de PostgreSQL. |
| Fallo de auditoría | FK de actor/destino o evento inválido fuerzan rollback completo, incluido un cambio previo. Un intento posterior de commit no conserva la mutación. No se propagan SQL, valores ni causas; queda AuditWriteUnavailable saneado. |
| Canal privado sin FK ni lookup | [security-events.ts](../../../apps/api/src/infrastructure/logging/security-events.ts) admite solo ACCESS_DENIED, AUTHENTICATION_FAILED, ADMIN_COMMAND_REJECTED, BOOTSTRAP_ATTEMPT, RESTORED_STATE_INVALIDATION, MAIL_DELIVERY_FAILED y RUNTIME_FAILURE. UUID de evento/correlación y UTC, motivos/enums cerrados; plantillas fijas, sin URL recibida. UUID destino mal formado se omite; referencias conocidas/desconocidas conservan esquema/motivo y no consultan User. |
| Operadores y alcance global | Alias explícito ASCII de 1–64 caracteres, sin valor predeterminado ni derivación del usuario/hostname. Bootstrap/restauración usan LOCAL_OPERATOR + IDENTITY_SCOPE. Se probó correlación con AuditEvent SYSTEM_BOOTSTRAP sin crear usuario para el operador. Conteos agregados solo para restauración exitosa; no listas de IDs ni payloads. |
| Privacidad y fallos del log | 18 campos sensibles señuelo rechazados en ambos canales; errores no incluyen valores. Se prueban fallos reales del archivo: HTTP mantiene 401/403, sin lookup de destino ni efectos. Incluso si falla el aviso local, no cambia la respuesta. Salida HTTP limita códigos/campos y sustituye mensajes libres de validación por texto fijo. |
| Archivo y retención local | Directorio 0700, archivos JSONL 0600 en Linux, append sin seguir symlinks. Rotación por día UTC: hoy y los 29 anteriores; limpieza al escribir/iniciar y a medianoche aun sin eventos nuevos. Directorio ignorado por Git, sin endpoint de lectura. |

El productor debe revalidar identidad, autorización y reglas del cambio antes de registrar
el hecho: escritor/logger no reemplazan esa autorización. El harness usa SessionLookup y
revalidación en transacción; actor revocado produce rollback y solo después registra la
denegación. Auditoría no registra denegaciones ni operaciones globales como cuentas ficticias.
Los fallos HTTP y del ejecutor existente usan el canal privado. MAIL_DELIVERY_FAILED se
registra después del commit de su estado; un fallo de log no revierte ese commit.

## Verificación en Docker

| Comando | Resultado |
| --- | --- |
| `docker compose up -d --build api` | Imagen API compilada con dependencias existentes |
| `docker compose exec -T api npm run lint` | Ambos workspaces y reglas de capas: exit 0 |
| `docker compose exec -T api npm run build` | API y web: exit 0 |
| `docker compose exec -T api npm run test:unit` | 23 aprobadas: 22 backend y 1 web |
| `docker compose exec -T -e APP_ENV=test api npm run test:integration` | 196 aprobadas en 13 archivos: 39 nuevas y 157 regresiones |

[audit.spec.ts](../../../apps/api/tests/integration/audit.spec.ts) utiliza PostgreSQL real,
esquema aislado y archivos temporales privados. La primera ejecución tuvo 38/39 aprobadas:
el segundo caso HTTP reutilizaba la tabla del harness; se añadió limpieza exclusivamente
en el esquema de la suite. Se corrigió también un salto de línea rechazado por lint.
La ejecución final incluyó ambas correcciones, sin omitir casos. Los ensayos de rotación
adelantan Date/temporizadores solo en tests. API, PostgreSQL y Mailpit quedaron saludables.
Sin migraciones nuevas, cambios de Docker/dependencias ni secretos en evidencia.

## Límites

T027 completa mecanismos y pruebas de fundamentos, no los flujos administrativos ni
el primer administrador. Bootstrap/restauración se probaron como formatos/correlación de
eventos, no como comandos operativos; T028 y V12/V16 siguen pendientes. Los logs están
en el filesystem privado del contenedor: no se afirma conservación tras recrearlo ni
una política de almacenamiento persistente de producción. No se exponen para consulta
web. Tampoco se valida carga de 1000 concurrentes. Siguiente tarea: T028, bootstrap atómico.
