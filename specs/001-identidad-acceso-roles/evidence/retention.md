# T095: retención por lotes y rotación privada

**Cierre:** 2026-10-16, sobre `bbd4fdf`, rama `feat/001-identidad-acceso-roles`.
Estado inicial limpio; T094 completa. Sin AGENTS.md aplicable ni hooks registrados;
checklist documental 16/16, sin modificarlo. Prerrequisitos resueltos por el script del
repositorio. Solo T095: **95 tareas completas / 13 pendientes**.

Fuentes: [tarea y dependencia](../tasks.md), [modelo y retención](../data-model.md#retención-operativa-inicial),
[plan](../plan.md), [spec](../spec.md), [V13](../verification.md),
[constitución](../../../.specify/memory/constitution.md) y [T094](us3.md).

## Implementación y plazos

[RetainRecords](../../../apps/api/src/modules/identity/application/retain-records.ts)
coordina contratos de identidad y [correo](../../../apps/api/src/modules/mail/public/retention.ts),
sin SQL, HTTP ni IO en aplicación. Los adaptadores de
[identidad](../../../apps/api/src/modules/identity/infrastructure/retention.ts) y
[correo](../../../apps/api/src/modules/mail/infrastructure/retention.ts) reutilizan pool,
reloj PostgreSQL, locks, CHECKs y FKs existentes. No se necesitan migraciones ni dependencias.
La [CLI](../../../apps/api/src/cli/retain-records.ts) compone la operación; no hay endpoint
ni purga automática en el arranque de la API.

| Datos | Plazo, origen y resultado verificado |
| --- | --- |
| Session | 24 h desde el primer fin de validez: revocación, expiración absoluta (8 h desde creación) o inactividad (30 min desde lastAcceptedAt). No desde el login. |
| ActionToken | 24 h desde consumo, revocación o expiración, lo primero; VERIFY_EMAIL dura 24 h desde emisión y RESET_PASSWORD 30 min. Nunca purgar con entrega activa vinculada. |
| MailDelivery | Solo metadatos terminales, 7 días desde finishedAt. El modelo no fijaba otro anclaje: se concreta desde finalización, conservando siete días después del último intento, no desde creación. |
| Payload | Borrado inmediato al estado terminal; existente en adaptadores/CHECK y aplicado también al cancelar durante mantenimiento. No espera siete días. |
| AuditEvent | 30 días desde occurredAt. No se borra por la edad o desactivación del usuario. |
| RateEvent / RateBucket | Eventos tras 24 h desde occurredAt; no quitar reservas vigentes ni reiniciar cuotas. Bucket vacío tras 24 h desde updatedAt y sin bloqueo vigente; un bloqueo que vence exactamente ahora ya no impide purgarlo. |
| User / SystemState | Nunca se borran ni modifican; se conservan cuentas, credenciales y marca irreversible. |
| SECURITY / OPERATION | Se reutiliza SecurityEvents: rotación por días UTC, hoy y 29 anteriores, máximo 30 días. Puede eliminar entradas hasta casi un día antes de cumplir 30 días; no se promete retención mínima exacta por línea. |

Fronteras SQL inclusivas, con reloj de BD conservando microsegundos. Las reglas y
comandos completos están en [operación y programación](../../../ops/local/logging.md).
La rotación de logs ya existía: se verificó en vez de sustituirla; se añadió `**/logs/`
a `.dockerignore`. Los logs siguen ignorados por Git y no se versionan.

## Verificación en Docker

[Suite T095](../../../apps/api/tests/integration/retention.spec.ts): **29/29 aprobadas**,
cero omitidas. PostgreSQL real, esquemas nuevos `t_*`, runtime restringido, reloj solo
en esos esquemas y archivos mkdtemp propios del contenedor efímero.

| Criterio | Evidencia |
| --- | --- |
| Límites y datos aún vigentes | Sesiones revocadas/inactivas/absolutas, tokens consumidos/revocados/vencidos y ambas finalidades; antes/en/después del límite por 1 µs. Auditoría 30 días, metadatos en los tres estados terminales a 7 días; creación anterior no adelanta el plazo. Sesiones/tokens/entregas vigentes permanecen. |
| Lotes, reanudación e idempotencia | Tamaño 2 y tope de una vuelta; cantidades acotadas en sesiones/tokens/auditoría/metadata/cuotas; otra instancia completa lo restante y otra ejecución produce cero efectos. |
| Interrupción y rollback | Desconexión real antes del commit revierte el borrado. Un trigger de ensayo provoca fallo SQL: identidad revierte su lote completo; la cancelación de correo ya confirmada permanece y otra ejecución continúa. |
| Concurrencia y FKs | Dos ejecutores, 17 sesiones y cinco entregas/tokens obsoletos, sin doble conteo ni pérdida de metadata. Entrega bloqueada se omite y su token no se purga; liberar y repetir completa el trabajo. ON DELETE SET NULL conserva metadata. Claim anterior no revive entrega cancelada. |
| Cuotas vigentes | Eventos recientes, reservas de 30 s y bloqueos preservados; bucket reciente se conserva, bucket vacío exactamente a 24 h con bloqueo recién vencido se elimina. Admisión concurrente y cuota SMTP real siguen vigentes. |
| Conservación y entrada restringida | User/SystemState idénticos antes/después en el esquema aislado. CLI rechaza desarrollo, manual/public de test, schema distinto y límites inválidos; ejecución válida solo emite cantidades y cierra su pool. |
| Logs privados | SECURITY/OPERATION, permisos Linux 0700/0600, corte diario al límite de 30 días, medianoche sin tráfico, reinicio e idempotencia. No sigue symlinks ni borra archivos/directorios ajenos; fallo de almacenamiento mantiene respuesta segura, con regresión HTTP de auditoría. |

| Ejecución | Resultado |
| --- | --- |
| Lint y compilación API/web | Aprobados. Lint completo de API y build se repitieron después del ajuste final; web no cambió. |
| Unitarias y arquitectura | 120/120: API 75, web 45. Barreras de imports y grafo del núcleo incluidos. |
| Primer lote de T095 | 27/27; después se añadieron las comprobaciones de CLI/admisión concurrente y se fortalecieron lotes/FKs. |
| Lote de integración ampliado | 223 aprobadas / 1 fallo de preparación / 0 omitidas. El caso de correo requiere una API en localhost:3000, que no estaba iniciada dentro del contenedor. No se consideró aprobado ese lote. |
| Repetición con readiness real aislada | T095 29/29 y mail-delivery 25/25; cero fallos/omisiones. Sin cambiar aserciones originales. Mailpit disponible: no se atribuye a esta repetición una nueva caída real de SMTP. |
| Último ajuste de frontera de bucket | T095 29/29 y rate-limits 12/12, con lint/build API; cero fallos/omisiones. |

**224 casos distintos de integración verificados entre los lotes y repeticiones**:
T095 29 + regresiones 195 (auditoría 58, adaptadores mail 25, entregas 25, perfil 18,
cuotas 12, entrega de registro 2, privacidad 5, ciclo de sesión 15, store de sesión 15,
consulta/cierre 20). No se suman repeticiones como casos nuevos.

Reproducción en imágenes Linux existentes, con fuentes/tests/package.json actuales
montados y API compilada: `npm run lint`, `npm run build`, `npm run test:unit`;
desde `apps/api`, Vitest con `--maxWorkers=1` sobre retention, session-store,
session-lifecycle, rate-limits, mail-adapters, mail-delivery, registration-delivery,
audit, secret-redaction, profile.contract y us1-read-logout.contract.
Para mail-delivery se preparó además una composición API real en el puerto 3000,
con otro esquema `t_*` creado/migrado por identityDatabase y retirado al terminar.
Arnés y resúmenes saneados en `.cache/t095/`, ignorados; sin cuerpos, credenciales,
cookies o enlaces utilizables. No se repite E2E: no cambian rutas, UI ni casos de acceso.

## Conservación, ejecución y límites

Todos los borrados se ejecutaron en esquemas/directorios aislados del contenedor;
no se ejecutó mantenimiento contra desarrollo ni el ensayo manual. Se compararon por
lectura las huellas de **las 12 cuentas originales**, **las 15 cuentas manuales totales**,
**SystemState** y **el archivo privado de credenciales**: idénticas antes/después.
Cuatro servicios healthy. Docker se reanudó tras la pausa sin reconstruir imágenes ni
reinicializar volúmenes. El bloqueo previo de revisión automática por límite de uso
impidió un intento de prueba; al reanudarse la autorización se completaron las verificaciones.

La CLI exige schema explícito y límites; en test solo `t_*`. Se documenta programación
local horaria, sin instalarla ni activarla en el entorno manual. Cada grupo tiene límite;
correo confirma antes que identidad. Reanudar no necesita cursor ni reinicia plazos.
`noChanges` indica cero cambios en la vuelta, no ausencia global de trabajo: SKIP LOCKED
puede omitir filas. La purga física depende de invocar/programar y repetir; puede demorarse
por locks, fallos o backlog. La caducidad y autorización no dependen de haber borrado la fila.
No se promete retirar SMTP ya aceptado ni exactamente una entrega. Con el proceso apagado
no corre rotación; al reanudar se aplica. No se afirma rendimiento/capacidad de carga.

T095 completa sus criterios y no ejecuta T096–T108. El
[hallazgo intermitente de bootstrap](us5.md#hallazgo-intermitente-de-bootstrap-cli)
permanece **abierto para T106, causa no confirmada**: pruebas aprobadas no lo resuelven.
No se adelanta T104 ni se añaden resultados humanos. Siguiente bloque: **T096**.

Verificación documental: **392 enlaces locales** (incluidas anclas), **108 IDs únicos**,
solo T095 cambia de casilla; `git diff --check` sin errores. El commit incluye únicamente
implementación/pruebas de T095, exclusión de logs y documentación de operación/seguimiento.
