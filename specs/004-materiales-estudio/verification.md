# Matriz ejecutable — materiales 004

**Cierre T064/T067 — 2026-11-17, America/Lima.** El responsable confirmó «ahora si funciona todos los recorridos», después de repetir el ensayo tras la corrección del PDF. T064 queda completada para el recorrido global de gestor y alumno en laptop, con consentimiento previamente comunicado. Es un resultado comunicado por el responsable, sin observación directa del agente ni desglose de cada paso, formato, ayuda o duración. Móvil no observado; SO, navegador y uso específico de puntero/teclado no informados. H-PDF-01 queda resuelta tras esta repetición humana. T067 completa la sincronización documental; D13/T065, D10/T066 y el cierre integral T068 permanecen pendientes. Avance **65/68**, tres pendientes. [Registro de cierre](evidence/t064-t067-report.md).

Fecha: 2026-11-17, America/Lima. T003 conserva su etapa original de trazabilidad.
Estado actual: T001–T064 y T067 completadas, 65/68. La
[verificación transversal](evidence/automated.md) ejecuta MV01–MV11, revisa carreras
y privacidad y compara 1092 archivos. API: 3961 casos aprobados en 171 archivos,
cobertura compuesta de ampliada inicial y focal final 687/687. Web 614/614 y
E2E real 42/42, sin omitidos o reintentos. Incluye 14 casos nuevos de nombres y
cuatro inventarios de migraciones actualizados; aserciones de negocio conservadas.
[Recuperación T061–T062](evidence/recovery.md): cinco fases aprobadas, inventario
completo y sesiones invalidadas en destino aislado. T063 registra
[recursos locales reales](evidence/local-resources.md). T064 completada por confirmación del responsable en laptop: [registro](evidence/human-acceptance.md). Móvil no observado; uso específico de teclado sin informar. CI remoto y D10/D13 pendientes.
La [revisión preliminar T068](evidence/final-acceptance.md) reúne 20 FR, 7 SC y
19 escenarios; T067 sincroniza documentación conservando sus registros originales.
T067 completada; T068 conserva dependencias pendientes y no acredita aceptación integral.
[Checkpoint US3](evidence/us3-checkpoint.md) conserva la evidencia anterior.
El backend previo conserva su [evidencia T051–T053](evidence/t051-t053.md).
[T048–T050](evidence/t048-t050.md) conserva el rojo histórico anterior.
El siguiente checkpoint conserva
sus resultados históricos: [Checkpoint US2](evidence/us2-checkpoint.md):
navegación desde matrículas vigentes, rutas por audiencia y descarte por cuenta/grupo;
API 1813/1813 en 75 archivos, web 590/590 en 36 y E2E real 30/30 (20 alumno y
10 gestión, desktop/mobile, cero reintentos/omitidos). Tipos/lint y builds API/web
aprobados en ese checkpoint. Sus pendientes pertenecen a esa etapa histórica;
el estado actual figura arriba. Aceptación humana y puertas operativas siguen pendientes.
[T043/T044](evidence/t043-t044.md) conserva su etapa de cliente/pantalla y ocho
comprobaciones Chromium con API simulada, ahora complementadas por E2E real.
[T041/T042](evidence/t041-t042.md):
consulta y descarga HTTP real por audiencia, con matrícula vigente exacta y
plaza antes de bytea; HEAD sin lectura de bytes. API 1714/1714 en 69 archivos,
tipos/lint/generate/build API aprobados. T035 original 17/17, T036 original 34/34,
recursos de descarga 7/7. Respuesta lenta conserva plaza con conexiones/locks SQL
liberados; finish/close recuperan la plaza. Los [resultados T039/T040](evidence/t039-t040.md)
conservan su etapa interna y rojo HTTP anterior, ahora resuelto sin modificar T036.
[T037/T038](evidence/t037-t038.md) conserva su rojo histórico de 28 casos,
ahora resuelto sin alterar las expectativas originales. Backend no se repitió en
T043/T044; el bloque actual sí repite y amplía backend. Los
[resultados previos](evidence/t035-t036.md) se conservan como historia.
[Checkpoint US1](evidence/us1-checkpoint.md):
API 1629/1629 (63 archivos), web 526/526 (32 archivos), E2E real 10/10 sin reintentos;
lint/tipos/builds API/web aprobados. Guía y arquitectura actualizadas; US2/US3 y
aceptación humana pendientes. Cuota técnica documentada con índice aditivo.
Históricos conservados en [E2E y seguridad](evidence/t030-t032.md),
[cliente y pantalla](evidence/t027-t029.md), [gestión HTTP](evidence/t025-t026.md),
[publicación/receptor](evidence/t023-t024.md),
[completado atómico](evidence/t022.md), [intenciones](evidence/t021.md), [validadores](evidence/t020.md),
[pruebas previas US1](evidence/t017-t019.md) y [fundamentos](evidence/t009-t016.md). Las suites indicadas
como futuras se crearán según sus tareas y deberán probar comportamiento, no imports rotos.

## Familias de validación

Todas las rutas de suite API se resuelven desde `apps/api/tests/integration/` y
las E2E desde `apps/web/tests/e2e/`. Ejecutar API desde su workspace con
`npm.cmd exec --workspace @academia/api -- vitest run tests/integration/<suite>.spec.ts`.
Las suites con BD requieren el [entorno aislado](evidence/implementation-environment.md).
E2E usa `apps/web/playwright.materials.config.ts`, implementada en T030; requiere
Chromium y entorno aislado, con 5173 libre dentro del runner.

| ID | Suite/tarea prevista | Casos y oráculo exigido | Estado |
| --- | --- | --- | --- |
| MV01 | materials-format/upload/download; T017–T030,T036,T041–T046 | PDF/JPG/JPEG/PNG; PREPARED privado, publicación explícita; descargar y comparar bytes y SHA-256 completos | Preparación/publicación y descarga de tres formatos con bytes/hash íntegros; E2E real 30/30 incluye alumno desde matrícula y gestores |
| MV02 | materials-authority/enrollment/download; T009,T035–T042 | Cruzar toda la matriz de actores del spec con 3 estados y URL directa; denegación sin datos ni bytes ajenos | Gestión y lectura/descarga HTTP de alumno aprobadas; T036 original 34/34, estados/actores y referencias directas |
| MV03 | materials-files/format/complete/upload/filename-contract; T004,T017,T020,T022,T024,T060 | 0/1/20 000 000/20 000 001; MIME/extensión falsos, truncados, hash y longitud incompatibles; material previo intacto | Límites/formato/completado y receptor 13/13 aprobados; T060 añade 14/14 de nombres: dominio y capacidad binaria rechazan los seis caracteres ya prohibidos por el cliente; HTTP 400 sin intenciones/finanzas alteradas y Unicode válido conservado |
| MV04 | materials-upload-intents/complete/upload-races; T019,T021–T023,T031 | Respuesta perdida, dos PUT, mismo ID con payload distinto, reinicio PENDING/COMPLETED; un efecto persistido y reintento manual | Carreras con locks observados, rollback, pérdida HTTP tras commit y dos reinicios reales aprobados; E2E recupera sin replay automático |
| MV05 | materials-schema/commands/command-races/audit; T006,T048–T057,T060 | Barreras edit/publish/withdraw, revisión obsoleta, rollback; verificar filas, ledger, revisión y auditoría atómicos | Dominio 13/13, comandos 25/25, HTTP adicional 14/14 y 14 carreras T055 aprobados; T057 auditoría 15/15; T060 repite todos los materiales/arquitectura: 418/418, sin relajar revisión, permisos, rollback o historial |
| MV06 | materials-authority/upload-security/command-races; T009,T012,T032,T055 | Revocación, cambio de rol/docente y cancelación durante recepción y antes de commit/replay; no efecto con permiso viejo | Upload: sesión/rol/cuenta/docente/cancelación tras primer chunk y antes de locks finales aprobados; replay reautoriza; comandos US3: reasignación y sesión revocada antes de replay denegadas; T055 verifica reasignación observada y expiración después de auditoría/antes de commit para EDIT/PUBLISH/WITHDRAW, sin efectos |
| MV07 | materials-enrollment/participant; T035,T038–T047 | confirmedAt ≤ at < validUntil a µs, fin original; reserva/pago/incidencia sin matrícula no habilitan; oferta retirada no revoca | Participante 10/10, T035 original 17/17, consultas y GET/HEAD en límites exactos; E2E verifica histórico/reserva denegados y oferta retirada/docente inhabilitado sin revocar matrícula |
| MV08 | materials-commands/command-races, materials-actions E2E; T048–T058 | Retiro deniega solicitudes nuevas; edición/login no republican; republicación explícita respeta permiso vigente | Backend/UI y E2E US3 aprobados; descarga nueva 404 tras retiro y 200 tras republicación; retiro conserva matrícula/incidencia y archivo anterior, nueva carga tiene referencia propia; checkpoint automático T058 en evidence/us3-checkpoint.md, sin aceptación humana |
| MV09 | materials-admission/upload-races/upload-security; T009,T031,T032,T063 | 2 global/1 actor antes de bytes, abortos y plazo; fallos BD/espacio inyectados: sin parcialidad ni plazas filtradas | Admisión/abortos/plazo y fallos PG 53100/53200 inyectados aprobados; cuota 30/60 con dos procesos y rollback; T063 mide RSS/copias de API y generador separados, BD/WAL/disco/backup, carga/descarga de 20 MB, dos plazas retenidas, abortos, cliente lento y rollback 53100/53200; corpus compresible local, sin capacidad D10: [evidencia](evidence/local-resources.md) |
| MV10 | materials-upload/receiver/download/audit y regresiones http-security; T018,T024,T036,T040,T057,T060 | JSON 16 KiB intacto; PUT exacto, CSRF/Origin, encoding, HEAD/Range, no Buffer JSON ni segundo cuerpo tras headers | Binario interno 7/7, T036 34/34 y auditoría segura aprobados; T060 repite integración de identidad/oferta/matrícula y materiales, añade rechazo de nombres incompatibles y comprueba recuperación de la plaza antes de headers inválidos |
| MV11 | tests UI management/student/material-actions y E2E materials-*; T019,T030,T037,T043–T046,T050,T056 | Vacío/error/denegado/conflicto/incierto; textos conservados, aborto/logout/cambio cuenta, respuestas viejas y Blob URLs revocadas | Web 614/614 y E2E real 42/42: navegación, teclado/móvil, vacío/error, URLs, revocación, binario/corrección tardíos tras logout/login, conflicto y respuesta perdida; 16 pruebas originales de acciones aprobadas; observación humana pendiente |
| MV12 | rehearse-materials, recovery; T061–T063 | Upgrade 0007, reinicio y restore cifrado separado; inventario completo de bytes/hashes, grupo, autor, estado, ledger y permisos | Aprobado local T061–T062: 0007→0009, dos procesos, backup cifrado/restore en otra BD, seis materiales/3 formatos/3 estados/una intención, bytes y SHA-256 completos, catálogo/ACL/finanzas, login y permisos; dos decisiones posteriores revisadas. T063 añade medición de respaldo local; acuerdos D13 pendientes; [evidencia](evidence/recovery.md) |
| MV13 | human-acceptance; T064 | Gestor y alumno reales publican/listan/descargan/retiran; consentimiento, dificultades, teclado/computador/móvil registrados por separado | Consentimiento y resultado global favorable en laptop comunicados por responsable tras corrección PDF; sin observación directa del agente. Móvil no observado; teclado sin desglose. T064 completada en ese alcance: [registro](evidence/human-acceptance.md) |

Para MV02: ADMIN no cancelado gestiona los tres estados; cancelado solo histórico
y retiro. TEACHER habilitado/asignado y grupo no cancelado gestiona; autor anterior,
ajeno o inhabilitado no. STUDENT activo con matrícula propia vigente solo PUBLISHED;
histórico, otro grupo del mismo curso, reserva/pago/incidencia sin matrícula y
visitante no. Cruzar también cuenta deshabilitada/sesión revocada/referencia inexistente.
No convertir error en listado vacío; validar conteos/paginación después del permiso.

## Requisitos funcionales y resultados

| Requisito | Familias | Tareas principales |
| --- | --- | --- |
| FR-001 | MV01,MV02 | T007,T011,T020,T022,T031 |
| FR-002 | MV02,MV06 | T009–T012,T025,T032,T042,T052 |
| FR-003 | MV01,MV03 | T005,T007,T017,T020–T022,T028 |
| FR-004 | MV01,MV03 | T004,T017,T020,T024 |
| FR-005 | MV03,MV09 | T006,T007,T022,T024,T031,T063 |
| FR-006 | MV01,MV08 | T023,T028,T048,T051–T054 |
| FR-007 | MV02,MV07 | T035–T039,T042,T046 |
| FR-008 | MV02,MV06,MV10 | T009–T012,T032,T036,T040–T043 |
| FR-009 | MV07 | T035,T038,T039,T046 |
| FR-010 | MV02,MV10 | T014,T015,T025,T039,T042,T044 |
| FR-011 | MV05,MV08 | T048–T056 |
| FR-012 | MV05,MV08 | T006,T007,T022,T049,T051,T057 |
| FR-013 | MV04,MV05 | T021–T023,T031,T049,T052 |
| FR-014 | MV05,MV06 | T009,T012,T031,T032,T049,T055 |
| FR-015 | MV04,MV11 | T019,T027–T030,T037,T043,T044,T050,T054 |
| FR-016 | MV11,MV13 | T027–T030,T037,T043–T046,T056,T064 |
| FR-017 | MV05,MV10,MV12 | T014,T022,T023,T052,T057,T062 |
| FR-018 | MV09,MV12 | T006,T007,T031,T061–T063 |
| FR-019 | MV07,MV10,MV12 | T001,T002,T016,T033,T047,T057–T060,T067 |
| FR-020 | MV12,MV13 | T002–T004,T008,T061–T066 |
| SC-001 | MV01 | T017–T034,T041–T047 |
| SC-002 | MV02,MV06,MV10 | T009–T016,T032,T035–T047,T055,T057,T060 |
| SC-003 | MV03,MV09 | T004,T006,T007,T017,T020,T024,T031,T063 |
| SC-004 | MV04,MV05 | T019,T021–T023,T031,T049–T055 |
| SC-005 | MV07,MV08 | T035–T047,T051–T056 |
| SC-006 | MV12 | T061–T063,T065,T068 |
| SC-007 | MV11,MV13 | T030,T037,T046,T050,T056,T064 |

## Los 19 escenarios de aceptación

IDs USn.m remiten al número del escenario en [spec.md](spec.md). Los checkpoints
[US1](evidence/us1-checkpoint.md), [US2](evidence/us2-checkpoint.md) y
[US3](evidence/us3-checkpoint.md) registran su cobertura automática. La revisión
transversal T060 queda registrada en evidence/automated.md; aceptación humana T064
permanece pendiente. Las suites de
esta tabla identifican los oráculos de cada escenario.

| ID | Suite/familia prevista | Oráculo observable |
| --- | --- | --- |
| US1.1 | upload, management; MV01 | Archivo completo PREPARED, grupo/autor correctos, alumno denegado |
| US1.2 | upload, management; MV01,MV08 | Confirmar publish produce PUBLISHED y solo alumno vigente accede |
| US1.3 | upload, management; MV01,MV02 | ADMIN prepara/publica sin ser docente; atribución conserva actor |
| US1.4 | authority, upload-security; MV02,MV06 | Visitante/alumno/docente ajeno/inhabilitado sin filas ni filtraciones |
| US1.5 | format, management UI; MV03,MV11 | Vacío/truncado/tipo/tamaño inválidos rechazados y textos conservados |
| US1.6 | upload-races, management UI; MV04 | Consulta/replay con respuesta perdida recupera un único resultado |
| US2.1 | download, student E2E; MV01,MV02 | Publicados propios, DTO mínimo, bytes íntegros |
| US2.2 | enrollment; MV02,MV07 | Reserva/pago/incidencia sin matrícula deniegan consulta y contenido |
| US2.3 | enrollment, download; MV02 | URL/referencia de otro grupo del mismo curso no entrega datos |
| US2.4 | enrollment; MV07 | Antes/en/después del fin original a µs; instante exacto se deniega |
| US2.5 | enrollment, student E2E; MV07 | Retiro de oferta/inhabilitación docente conserva acceso vigente |
| US2.6 | student UI; MV11 | Vacío autorizado distinto de fallo recuperable, reintento manual |
| US2.7 | download, student UI/E2E; MV02,MV11 | Sesión/cuenta revocada deniega; respuesta vieja no reaparece |
| US3.1 | commands, command-races; MV05 | Textos cambian sin archivo/grupo/estado; revisión obsoleta da conflicto |
| US3.2 | commands, actions E2E; MV08 | Retiro oculta y deniega solicitudes nuevas, histórico conservado |
| US3.3 | commands, actions E2E; MV08 | Retirado solo vuelve por publish explícito autorizado |
| US3.4 | authority, commands, actions E2E; MV06 | Anterior denegado, nuevo habilitado gestiona, autor original inmutable |
| US3.5 | schema, commands, audit; MV05,MV08 | No reemplazo bajo ID anterior: nuevo material y retiro separado |
| US3.6 | upload-security, command-races; MV06 | Permiso perdido durante operación impide commit del cambio |

## Evidencia y puertas

Cada ejecución debe guardar comando, versiones, código de salida, casos y estado
persistido cuando corresponda; no cuerpos, secretos o datos personales. T001 conserva
hashes anteriores y pendientes 001–003. T004 guarda inventario de 18 archivos
sintéticos con tamaños/hashes y seis pruebas del corpus; no equivale a MV03 producto.

T060 integra lo automático. T062 registra restore real separado; T063 registra recursos locales
sin extrapolar capacidad. T064/MV13 exige personas reales y no se cierra con Playwright.
T065/D13 requiere acuerdos reales de custodio/destino cifrado/retención/recuperación
antes de demo persistente/publicación. T066/D10 requiere rúbrica e infraestructura
autorizadas y generador separado; no equivale a dos plazas de transferencia.
Se prepararon [operación O01–O12](operation.md) y [capacidad C01–C10](capacity.md).
El responsable confirmó la falta de acuerdos D13 y de referencias D10; ambas
tareas conservan estado pendiente, sin ensayo externo ejecutado:
[informe y validación documental](evidence/t065-t066-report.md).
Izipay/24 h/pendientes 001–003 permanecen abiertos con su alcance original.
