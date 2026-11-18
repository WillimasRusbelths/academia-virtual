# Matriz de verificación — 005

2026-11-17. T003: **matriz preparada, ninguna aceptación funcional ejecutada**.
Preparación/dependencias T001–T004 se informan aparte; no completan FR/SC.
Fuente de requisitos: [spec](spec.md), constitución 2.0.0, V01–V05.
El [índice de tareas](evidence/tasks-coverage.json) es asociación documental,
no cobertura de código, pruebas aprobadas o capacidad alcanzada.

Avance T005–T007: DTOs/puertos y persistencia implementados. [Evidencia](evidence/t005-t007.md)
separa el rojo previo a 0010, 30 casos SQL iniciales, regresión de 809 unitarias y
3.182 pruebas de integración, y el ajuste posterior NO_CHANGE con 44 pruebas enfocadas
de schema/migraciones (33 de clases) aprobadas. SQL/upgrade son parciales de Q01/Q02/
Q06/Q09/Q10/Q14/Q15/Q16; no completan permisos, servicios, carreras HTTP o restore.
Las 24 filas de aceptación y los FR/SC conservan su estado pendiente.

## Estados y evidencia

Cada fila empieza PENDIENTE. Cambiar a PROBADO solo con commit, configuración
saneada, comando/protocolo, resultado esperado/observado y enlace a evidencia.
SIMULADO identifica dobles; NO OBSERVADO identifica modalidades/personas ausentes.
FALLO o BLOQUEADO conservan el requisito pendiente. No registrar secretos,
nombres/correos, contenido privado o IDs de video de terceros en la evidencia.

## Escenarios completos

Las filas reproducen las condiciones del spec sin sustituirlas por una prueba feliz.
Permisos, carreras, repetición y estado persistido son parte de cada verificación.

| ID | Condición / acción / resultado exigido | Tareas de ejecución | Estado |
| --- | --- | --- | --- |
| US1.1 | **Given** docente habilitado asignado y grupo no cancelado, **When** prepara una sesión con título válido, **Then** queda preparada para ese único grupo, sin emisión ni chat abierto por el hecho de crearla. | T018–T029 | PENDIENTE |
| US1.2 | **Given** sesión preparada y responsable con permiso actual, **When** confirma iniciar, **Then** queda en curso si no existe otra en curso en el mismo grupo; se distinguen estado de clase y disponibilidad real de la transmisión. | T018–T029 | PENDIENTE |
| US1.3 | **Given** dos sesiones preparadas del mismo grupo, **When** se inician a la vez, **Then** solo una queda en curso y la otra informa un conflicto recuperable. | T018–T029 | PENDIENTE |
| US1.4 | **Given** sesión en curso, **When** el responsable confirma finalizar, **Then** queda finalizada, deja de admitir mensajes y nuevas solicitudes de reproducción; no se puede reiniciar la misma sesión como una clase nueva. | T018–T029 | PENDIENTE |
| US1.5 | **Given** docente ajeno, sin habilitación, anterior o visitante/alumno, **When** intenta preparar, modificar, iniciar, finalizar o cancelar, **Then** se deniega sin cambios ni exposición de información de gestión. | T018–T029 | PENDIENTE |
| US1.6 | **Given** respuesta perdida o revisión anterior de una sesión, **When** se repite la misma acción o se intenta sobrescribir, **Then** se recupera el resultado único o se informa conflicto, sin duplicar sesiones ni revertir cambios posteriores. | T018–T029 | PENDIENTE |
| US2.1 | **Given** alumno con matrícula vigente, **When** consulta su grupo, **Then** ve sesiones autorizadas preparadas/en curso/finalizadas; preparadas no reproducen y finalizadas no ofrecen grabación. | T030–T040 y T081 | PENDIENTE |
| US2.2 | **Given** LIVE con referencia configurada y permiso, **When** inicia reproducción, **Then** reproduce YouTube realmente, distingue espera/error/estado y conoce el límite del enlace compartible. | T030–T040 y T081 | PENDIENTE |
| US2.3 | **Given** visitante/sin matrícula/otro grupo, **When** solicita datos o referencia desde Academia, **Then** se deniega; una referencia YouTube ya compartida se ensaya aparte sin prometer denegación por parte del proveedor. | T030–T040 y T081 | PENDIENTE |
| US2.4 | **Given** fin original de matrícula, **When** consulta en ese instante o después, **Then** API/chat/reconexión/referencia nueva se deniegan; la UI retira el player al detectar pérdida. No se acredita revocar el enlace YouTube conocido. | T030–T040 y T081 | PENDIENTE |
| US2.5 | **Given** oferta retirada o cambio docente, **When** mantiene matrícula vigente, **Then** conserva su derecho; la gestión de referencia exige responsable actual. Continuación/revocación de la emisión YouTube se opera y registra manualmente. | T030–T040 y T081 | PENDIENTE |
| US2.6 | **Given** cierre/revocación/deshabilitación, **When** había aula/conexión abierta, **Then** se deniegan entregas propias nuevas y se descartan respuestas y player de la sesión anterior; reproducción externa no se presenta como controlada. | T030–T040 y T081 | PENDIENTE |
| US2.7 | **Given** finalización de clase, **When** pide nueva referencia desde Academia, **Then** se deniega y el player se retira al detectar el cierre; el responsable detiene YouTube manualmente y registra resultado, sin prometer revocar el enlace. | T030–T040 y T081 | PENDIENTE |
| US3.1 | **Given** clase en curso y participantes autorizados, **When** uno envía texto válido, **Then** se confirma una sola vez y los demás autorizados de esa clase pueden leerlo con autor visible, rol y orden confirmado. | T041–T062 | PENDIENTE |
| US3.2 | **Given** referencia de otra clase o matrícula vencida, **When** se intenta conectar, enviar, consultar historial o reconectar, **Then** se deniega sin mensajes ajenos; una conexión ya abierta no mantiene permisos caducados. | T041–T062 | PENDIENTE |
| US3.3 | **Given** confirmación perdida, **When** se reenvía la misma intención de mensaje, **Then** se recupera el resultado sin duplicarlo; el mismo identificador con otro contenido se rechaza como conflicto. | T041–T062 | PENDIENTE |
| US3.4 | **Given** desconexión entre mensajes, **When** se reconecta con permiso vigente, **Then** se recuperan confirmados en orden, sin omisiones silenciosas ni duplicados; no se reenvían automáticamente borradores o mensajes de una sesión anterior. | T041–T062 | PENDIENTE |
| US3.5 | **Given** clase finalizada y matrícula todavía vigente, **When** el alumno abre su chat, **Then** lee historial confirmado y no puede enviar mensajes nuevos. | T041–T062 | PENDIENTE |
| US3.6 | **Given** texto vacío, excesivo, solo espacios o exceso de frecuencia, **When** se intenta enviar, **Then** se rechaza con mensaje comprensible, sin confirmar ni distribuirlo y permitiendo corregir o esperar según corresponda. | T041–T062 | PENDIENTE |
| US4.1 | **Given** mensaje confirmado, **When** un responsable autorizado lo oculta, **Then** los participantes reciben un indicador de mensaje ocultado sin su texto; el cambio también se refleja en posteriores consultas y reconexiones. | T063–T074 | PENDIENTE |
| US4.2 | **Given** alumno participante, **When** se lo silencia, **Then** se rechazan sus mensajes nuevos desde cualquiera de sus conexiones a esa clase, pero conserva lectura y video si sigue autorizado; se le explica el motivo funcional. | T063–T074 | PENDIENTE |
| US4.3 | **Given** alumno silenciado, **When** el responsable revierte el silenciamiento, **Then** puede volver a enviar si la clase está en curso y su permiso sigue vigente. | T063–T074 | PENDIENTE |
| US4.4 | **Given** silenciamiento en una clase, **When** el alumno entra en otra clase autorizada, **Then** no se hereda la restricción ni se altera su matrícula. | T063–T074 | PENDIENTE |
| US4.5 | **Given** alumno, docente ajeno o responsable anterior, **When** intenta moderar, **Then** se deniega; las acciones válidas conservan actor, fecha y resultado único. | T063–T074 | PENDIENTE |

## Casos técnicos Q01–Q16

Se conserva el catálogo de [quickstart](quickstart.md). Todos permanecen pendientes;
su ejecución debe cruzarse con las combinaciones de autoridad indicadas debajo.

| Caso | Preparación y acción | Resultado exigido / trazabilidad |
| --- | --- | --- |
| Q01 | Preparar/editar e iniciar dos sesiones del mismo grupo a la vez, con barrera | Una LIVE, otra conflicto; grupo/creador inmutables. US1.1–3/6, FR-001–004/013/018, SC-001 |
| Q02 | Finalizar/cancelar, repetir tras timeout y reiniciar API | Terminales no reabren ni inician señal; mismo comando único. US1.4/6, FR-003/004/013, SC-001 |
| Q03 | Visitante, admin, docente propio/ajeno/anterior/deshabilitado y alumno propio/ajeno | Matriz permitida/denegada en listas, referencia directa, commands/tickets/sockets/moderación. US1.5, US2.1/3/5/6, US3.2, US4.5; FR-002/005–007/019, SC-002 |
| Q04 | Derecho original a fin−1 μs, fin y fin+1 μs; sesión revocada con aula abierta | Nuevas decisiones exactas permitidas/denegadas; sin cache que extienda acceso. US2.4/6, US3.2/5, FR-006/007/015, SC-002 |
| Q05 | Enviar texto válido/XSS inerte/Unicode/solo espacios/exceso; 10+1 y límite t−10s | Confirmar válido solo tras commit; rechazar inválido/undécimo; ventana móvil, conexiones/reinicio compartidos. US3.1/6, FR-010–012, SC-004 |
| Q06 | Perder respuesta/repetir mismo ID y cambiar contenido; COMMIT ambiguo con barrera | Un mensaje/evento/receipt; conflicto distinto digest; no nueva intención automática. US3.3, US1.6, FR-012/013, SC-001/004 |
| Q07 | Desconectar entre mensajes/moderaciones, perder aviso y paginar delta/historial | Orden, deduplicación y cambios completos, incluido HIDE sin SEND posterior; no saltar cursor. US3.4, FR-014, SC-004/005 |
| Q08 | Finalizar contra envío nuevo y replay confirmado anterior | Orden autoritativo; nuevos rechazados, anterior consultable vigente sin reemisión; solo lectura. US3.5, FR-013/015/018, SC-005 |
| Q09 | Ocultar mientras hay lectura/replay en vuelo; consultar SEND viejo y como moderador | Tombstone sin text; respuesta anterior no restaura ocultado ya observado; nuevas consultas sin original. US4.1, FR-016/019, SC-005 |
| Q10 | Silenciar con dos conexiones; competir con envío; rehabilitar/otra clase | Rechazo solo de envíos nuevos de esa clase; lectura intacta, no silencio global. US4.2–5, FR-017/018, SC-005 |
| Q11 | Ticket usado dos veces/cuenta distinta/expirado/origen ajeno; replay de sala | Denegar, sin datos/renovación por heartbeat o polling; liberar plazas en cierres/errores. FR-006/019/021, SC-002/004 |
| Q12 | Caer BD, lector lento, límite sockets/tickets y reinicio del proceso | Fail closed, cola/memoria acotadas, sin ack falso; confirmado recuperable desde BD. FR-012/014/020–022, SC-004/006 |
| Q13 | Logout/cambio cuenta con fetch/socket/borrador pendiente; error logout | Nada de sesión anterior reaparece o se reenvía; estado explícito recuperable. US2.6, FR-021, SC-002/007 |
| Q14 | Inspeccionar DTOs, logs/errores y auditoría de acciones/rechazos | Sin correos/secretos/texto oculto; actor/fecha/resultado atribuibles. FR-019/020, SC-002/005 |
| Q15 | Upgrade desde 0009, reinicio y restore en BD nueva con decisiones post-backup | Estados/mensajes/moderación/cursor coherentes; accesos restaurados denegados y pérdidas revisadas. FR-022, SC-006 |
| Q16 | Asociar/retirar referencia por gestor, revisión/replay, ID/URL/HTML inválidos, player simulado y permiso perdido | ID solo en LIVE vigente; CSP/referer/origin, aviso, teardown y generaciones. Doble no acredita emisión YouTube real o protección externa. FR-005/006/008/009/021/023 |

## Matriz de autoridad por operación

Permiso de rol no sustituye estado, grupo o vigencia. Cada celda positiva incluye
prueba negativa de destino ajeno/inexistente, cuerpo alterado y pérdida de permiso.
Para rutas/errores exactos rigen [HTTP](contracts/api.md),
[integración](contracts/integration.md) y [video](contracts/video.md).

| Actor actual | Listas/detalle de clase | Crear/editar/transiciones | Lectura chat/delta/ticket | Envío nuevo | Referencia de reproducción | Configuración video | Ocultar / silenciar |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Visitante o sesión ausente/revocada/expirada/cuenta deshabilitada | Denegar | Denegar | Denegar | Denegar | Denegar | Denegar | Denegar |
| Alumno con matrícula vigente del grupo | No canceladas del propio grupo | Denegar | LIVE/FINISHED | LIVE, sin silencio y dentro de cuota | ID solo LIVE configurada | Denegar | Denegar |
| Alumno sin matrícula, antes del inicio, en/después del fin o de otro grupo | Denegar destino | Denegar | Denegar | Denegar | Denegar | Denegar | Denegar |
| Docente actual habilitado y asignado | Propio grupo | Según transición/estado | LIVE/FINISHED | LIVE y cuota | ID solo LIVE configurada | GET autorizado; PUT PREPARED/LIVE | Ocultar LIVE/FINISHED; silencio LIVE a alumno vigente |
| Docente ajeno/anterior/no habilitado | Denegar destino | Denegar | Denegar | Denegar | Denegar | Denegar | Denegar |
| Administrador activo | Grupos permitidos | Según transición/estado | LIVE/FINISHED | LIVE y cuota | ID solo LIVE configurada | GET autorizado; PUT PREPARED/LIVE | Ocultar LIVE/FINISHED; silencio LIVE a alumno vigente |

### Ejes que debe cubrir cada familia protegida

| Eje | Variantes obligatorias / resultado |
| --- | --- |
| Propiedad | Grupo propio, ajeno y referencia inexistente; listas/total paginados nunca revelan ajenos. Commands: mismo actor y autoridad actual; ID de tercero no revela resultado |
| Estado | PREPARED: sin chat/ID; LIVE: condiciones de cada operación; FINISHED: chat de lectura y ocultación, sin envío nuevo/ID; CANCELLED: fuera del listado alumno, sin chat/ID o reapertura |
| Grupo | Normal, retirado de oferta (conserva derecho original), cancelado (sin contenido propio nuevo). Admin solo metadatos y cierre/cancelación permitidos por contrato; no crea/inicia/reabre/envía por esa excepción |
| Vigencia | confirmedAt−1 μs, confirmedAt, fin−1 μs, fin y fin+1 μs; permiso válido solo confirmedAt ≤ t < validUntil original. Reserva/pago pendiente/oferta/curso igual no sustituyen matrícula |
| Sesión | Activa, revocada, idle expirada, absoluta expirada, authVersion cambiado y cuenta deshabilitada; aula/socket ya abiertos y logout/cambio de cuenta con respuestas tardías |
| Responsabilidad | Docente actual/ajeno/anterior/deshabilitado; creador original sin asignación actual no gestiona. Cambio docente no revoca matrícula |
| Procedencia | Origin correcto/ajeno/ausente, CSRF faltante/alterado, JSON/campos/tamaño inválidos; Upgrade origin exacto, ticket uniuso/TTL/ligado a cuenta-sesión-clase, sin confianza en room |
| Concurrencia | Ambos órdenes con barreras: dos inicios, cambio de rol/asignación, fin exacto, revocación/cancelación, envío/finalización/silencio, lectura/ocultación; dos cuentas y conexiones distintas, estado final sin duplicados/deadlock |

No es muestreo suficiente probar un rol en una sola ruta: T003 prepara esta matriz;
T009/T019/T030/T036/T042–T044/T057/T060/T063/T071 deben enumerar sus casos concretos.
SC-002 exige 100% de los casos definidos, incluidos accesos persistentes y replays.
Antes del límite se revalida, nunca se cachea derecho para alargarlo.
GET changes, GET video y POST tickets, reconexión/heartbeat no renuevan inactividad;
probar que consultas intencionales previas mantienen su política y expiración absoluta.

## Trazabilidad de requisitos y resultados

Cada requisito tiene tareas específicas además de la revisión transversal. La
presencia de un ID en esta tabla no acredita su implementación.

| Requisito | Tareas asociadas | Aceptación |
| --- | --- | --- |
| FR-001 | T005, T006, T007, T018, T020, T023, T025, T027 | PENDIENTE |
| FR-002 | T005, T009, T010, T011, T018, T019, T020, T022, T023, T025, T026, T027, T028 | PENDIENTE |
| FR-003 | T005, T006, T007, T018, T019, T020, T021, T022, T023, T025, T027, T028 | PENDIENTE |
| FR-004 | T018, T020, T023, T025, T027, T032, T036, T038, T039 | PENDIENTE |
| FR-005 | T008, T009, T010, T011, T012, T030, T031, T032, T034, T035, T036, T037, T039, T040 | PENDIENTE |
| FR-006 | T008, T009, T010, T011, T012, T014, T017, T030, T031, T032, T034, T035, T036, T037, T038, T039, T040, T044, T051, T052, T053, T055, T056, T057, T060, T067, T071 | PENDIENTE |
| FR-007 | T008, T009, T011, T012, T014, T030, T031, T032, T040, T060 | PENDIENTE |
| FR-008 | T016, T030, T033, T034, T035, T036, T037, T038, T039, T040, T081 | PENDIENTE |
| FR-009 | T016, T030, T033, T034, T035, T036, T037, T038, T039, T040, T081 | PENDIENTE |
| FR-010 | T010, T041, T042, T045, T046, T048, T050, T059 | PENDIENTE |
| FR-011 | T041, T042, T045, T046, T048, T050, T059, T060, T079 | PENDIENTE |
| FR-012 | T006, T007, T015, T021, T041, T042, T046, T048, T049, T050, T059, T060 | PENDIENTE |
| FR-013 | T005, T006, T007, T014, T015, T019, T021, T022, T023, T024, T027, T028, T037, T041, T042, T046, T048, T049, T050, T059, T060, T061, T066, T067, T071 | PENDIENTE |
| FR-014 | T004, T042, T043, T044, T046, T047, T048, T049, T050, T051, T053, T054, T055, T056, T057, T058, T059, T060, T068, T079 | PENDIENTE |
| FR-015 | T042, T043, T047, T048, T049, T050, T057, T059, T060, T061 | PENDIENTE |
| FR-016 | T006, T007, T043, T047, T049, T058, T063, T064, T065, T066, T068, T069, T070, T071, T072 | PENDIENTE |
| FR-017 | T006, T007, T009, T012, T063, T064, T065, T067, T068, T069, T070, T071, T072 | PENDIENTE |
| FR-018 | T005, T007, T009, T014, T015, T018, T019, T021, T022, T023, T024, T025, T027, T028, T046, T060, T063, T065, T067, T069, T071, T072 | PENDIENTE |
| FR-019 | T005, T007, T009, T013, T015, T017, T019, T023, T024, T030, T031, T037, T043, T044, T047, T048, T051, T052, T053, T055, T063, T064, T066, T068, T069, T070, T072, T073 | PENDIENTE |
| FR-020 | T007, T015, T021, T023, T028, T046, T063, T066, T069, T073 | PENDIENTE |
| FR-021 | T017, T024, T025, T026, T027, T032, T034, T038, T044, T049, T050, T052, T053, T054, T055, T056, T057, T058, T059, T064, T070, T072, T080, T081 | PENDIENTE |
| FR-022 | T002, T006, T007, T008, T061, T075, T077, T078, T082 | PENDIENTE |
| FR-023 | T001, T002, T004, T016, T029, T033, T034, T036, T039, T040, T059, T062, T074, T075, T079, T080, T081, T082, T083, T084 | PENDIENTE |
| SC-001 | T027, T028, T029 | PENDIENTE |
| SC-002 | T027, T028, T029, T030, T034, T035, T036, T037, T038, T039, T040, T057, T072 | PENDIENTE |
| SC-003 | T033, T034, T035, T036, T037, T038, T039, T040, T081 | PENDIENTE |
| SC-004 | T042, T043, T057, T059, T062 | PENDIENTE |
| SC-005 | T042, T043, T059, T061, T062, T071, T072, T074 | PENDIENTE |
| SC-006 | T061, T077, T078, T082 | PENDIENTE |
| SC-007 | T027, T029, T034, T059, T072, T080, T081 | PENDIENTE |
| SC-008 | T062, T079, T083 | PENDIENTE |

## Puertas que no se sustituyen entre sí

| Evidencia | Trabajo requerido | Pendiente |
| --- | --- | --- |
| Automatizada propia | Dominio, arquitectura, PG/HTTP, sockets Socket.IO reales, UI/E2E, Q01–Q16 y regresión 001–004; separar prueba fallida por comportamiento de import/config roto | Todo el comportamiento 005 |
| Reproducción real | T039/T040, G-V005, contenido/cuenta autorizados: navegador reproduce YouTube; medir duración/calidad/fallos, permiso propio antes/en/después del fin, retirada del player, referencia compartible y detención manual | D07/D08; mocks/iframe/onReady no completan SC-003 |
| Humana | T080/T081: consentimiento específico, docente/alumno/responsable, éxito/ayuda/modalidad/dispositivo sin nombres; emisión real y moderación | SC-007; móvil/teclado no observados se declaran |
| Recuperación | T077/T078 upgrade 0009→0010/reinicio/restore aislado, datos/orden/ocultación/receipts/referencias conservados, accesos restaurados invalidados y decisiones posteriores perdidas revisadas | Ensayo futuro; no restaura señal de video |
| Operativa | T082: destino externo, custodio de copia/clave, retención y RPO/RTO acordados y verificados, sin claves en documentos | D13 antes de demo persistente/publicación; no resuelto por laboratorio |
| Capacidad | T079/T083: 15.000 cuentas, meta 2.500 activos con mezcla/ventana/rúbrica D10, latencia/errores/recursos/costo S/300; generador externo autorizado, video separado de la academia y pagos simulados | SC-008; escenario combinado se acepta en 007, no afirmar capacidad local |
| Académica | Validación del profesor si V05 cambia criterios de evaluación | No comunicada; aprobación del responsable no la sustituye |

Cloudflare/protección multimedia completa quedan fuera del MVP. Las integraciones
simuladas de pago o señal no pasan a reales por completar un recorrido propio.
T084/T085 pueden actualizar/revisar con brechas declaradas; T086 exige todas sus
condiciones. No cerrar el spec con video/humanos/D10/D13 pendientes ni reescribir
resultados de specs anteriores.
