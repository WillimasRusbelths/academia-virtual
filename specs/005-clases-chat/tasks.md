# Tareas: clases en vivo y chat por grupo — 005

**Fecha**: 2026-11-17, America/Lima. **Rama**: `feat/005-clases-chat`.
**Estado**: 28/86 completadas: T001–T026 y T030–T031; API y gestión web implementadas. Recorridos reales T027–T029 pendientes.
Las 44 pruebas de dominio y 55 HTTP de T018–T019 ya pasan con T020–T023; su checkpoint previo se conserva.
La matriz T009 ya fue ejecutada con el coordinador/composición de T014–T017; no se completan todavía historias o FR/SC.
La gestión web tiene cliente cerrado y comprobaciones unitarias/navegador con API simulada; los recorridos con API real, chat y FR/SC completos permanecen pendientes.
IDs locales a 005. [Spec](spec.md), [plan](plan.md),
[investigación](research.md), [modelo](data-model.md),
[HTTP](contracts/api.md), [Socket.IO](contracts/realtime.md),
[integración](contracts/integration.md), [UI](contracts/ui.md),
[guía](quickstart.md). Constitución 2.0.0; V01–V05 conservadas.

**Adopción V05**: el responsable aprobó el [alcance del ensayo YouTube](evidence/video-scope-adoption.md).
El [índice actual](evidence/tasks-coverage.json) conserva referencias expandidas;
los checkpoints anteriores mantienen su estado histórico. T034–T040 se ajustan
al contrato del ensayo aprobado, sin exigir protección externa completa o Cloudflare.
Los documentos ya preparados se verifican contra la matriz de T003 antes del código;
ninguna tarea se marca completa por esta sincronización documental.

## Reglas y límites de ejecución

Formato: checkbox, ID secuencial, [P] solo para archivos independientes y [USn]
en fases de historia. Las rutas parten de la raíz. «Tras» indica dependencias
obligatorias; dentro de cada cadena se conserva el orden. [P] no autoriza agentes.
Pruebas incluidas porque FR/SC y constitución exigen permisos, integridad,
concurrencia, recuperación y recorridos. Escribirlas antes del comportamiento;
un fallo de import/configuración no acredita el rechazo funcional esperado.

**Alcance aprobado, pruebas pendientes.** G-V005 exige reproducción YouTube real,
controles propios y límites externos documentados. No es un bloqueo por requerir
un gestor protegido. Cloudflare queda fuera del MVP (V04/V05). T037–T040 implementan
y verifican el ensayo tras diseño y análisis; T039/T081 requieren cuenta/entorno/
personas autorizadas. No anunciar el enlace como video exclusivo ni dar por probado
lo que solo tiene dobles. Protección multimedia futura requiere otro incremento.

Los campos citados entre comillas son restricciones del modelo. Revisiones y
eventSeq viajan como string decimal, sin pérdida de microsegundos; UUID canónico,
texto inerte por puntos de código, trim uniforme sin NUL/surrogates sueltos.
No reset, bootstrap repetido, migración sobre BD manual, publicación o compra.
No marcar [x] por escribir un protocolo, lanzar un comando o preparar un doble.
Las tareas bloqueadas conservan [ ] y se omiten explícitamente al continuar una
cadena independiente; no se declara terminada su historia o el spec.

## Fase 1 — Preparación (T001–T004)

Objetivo: baseline y ensayo reproducible sin cambiar el entorno manual.

- [x] T001 Registrar HEAD/rama/puntero 005, hashes de configuración sin contenido, archivos previos y pendientes 001–004 en `specs/005-clases-chat/evidence/t001-baseline.json`; comprobar estado Git antes de editar y preservar los checkpoints históricos. FR-023. Sin dependencias.
- [x] T002 Documentar configuración privada y comandos del harness en `specs/005-clases-chat/evidence/implementation-environment.md`, reutilizando `ops/docker/test-harness.md`; APP_ENV=test, owner/runtime separados, proyecto/BD/volumen de ensayo, sin publicar puertos o alterar `.env` manual; migraciones antes de API. FR-022/023. Tras T001.
- [x] T003 [P] Crear `specs/005-clases-chat/verification.md` con 24 escenarios y Q01–Q16 de quickstart, matriz de roles/propiedad/estado/sesión/vigencia, FR-001–FR-023 y SC-001–SC-008; separar pruebas propias, reproducción real, límites externos, humanos, validación académica si aplica y D10/D13. Tras T001–T002.
- [x] T004 [P] Verificar versiones oficiales compatibles y fijar Socket.IO 4.x y cliente en `apps/api/package.json`, `apps/web/package.json` y `package-lock.json`; registrar versión/licencia/compatibilidad en `specs/005-clases-chat/evidence/dependencies.md`, sin añadir Redis/gateway Nest u otro servicio; comprobar instalación reproducible en harness. FR-014/023. Tras T001–T002.

**Primer bloque completado**: T001–T004. [Resultados](evidence/t001-t004-results.json).
T005–T007 también completadas: [contratos, pruebas SQL y migración](evidence/t005-t007.md).
T008–T009: [fixtures y pruebas de autoridad](evidence/t008-t009.md). La matriz
de autoridad se escribió en ese checkpoint y ahora pasa con el coordinador/composición real de T014–T017.
T010–T013: [permisos y participantes verificados](evidence/t010-t013.md).
T014–T017: [coordinador, ledger y composición verificados](evidence/t014-t017.md).
T018–T019 conservan su [checkpoint previo de pruebas escritas](evidence/t018-t019.md).
T020–T023: [gestión manual en API verificada](evidence/t020-t023.md), incluidas esas suites.
T030–T031: [consultas autorizadas de grupos y clases verificadas](evidence/t030-t031.md).
T024–T026: [cliente, gestión web y navegación por rol](evidence/t024-t026.md).
Siguiente bloque: **T027–T029**, E2E real, carreras y checkpoint US1.
Todavía faltan recorridos reales, aula del alumno y chat.
Actualizar el índice vigente con `node ops/specs/update-005-coverage.mjs --write`;
el validador de adopción anterior conserva su checkpoint de cero tareas ejecutadas.

## Fase 2 — Fundamentos compartidos (T005–T017)

Bloquea historias hasta comprobar almacenamiento, contratos y autoridad.

- [x] T005 Definir DTO y puertos sin SQL/Nest/Socket en `apps/api/src/modules/classes/public/classes.ts`, `apps/api/src/modules/classes/application/ports.ts` y `apps/api/src/modules/classes/public/errors.ts`: estados «PREPARED / LIVE / FINISHED / CANCELLED», «bigint positivo como decimal string en JSON, nunca number», decisión temporal «timestamptz(6)» y resultados APPLIED/NO_CHANGE/NOT_CONFIRMED; añadir referencia YOUTUBE_DEMO con CONFIGURED/NOT_CONFIGURED/CLASS_NOT_LIVE, revisión 0 ausente o positiva persistida; tipar viewVersion desde el último evento que afectó cada recurso (mensaje SEND/HIDE, textos/estado de sesión o restricción), distinguiéndola de revisión de gestión y cursor global. FR-001–FR-003/013/018/019. Tras T003–T004.
- [x] T006 Escribir pruebas SQL de restricciones/rollback e índices en `apps/api/tests/integration/classes-schema.spec.ts`: identidad inmutable, FK RESTRICT, estados/fechas, LIVE único por grupo, referencia con provider/ID/revisión válidos y FK de clase, duplicados de mensajes/comandos/eventos y ocultación coherente; verificar fallo por ausencia del comportamiento antes de T007. FR-001/003/012/013/016/017/022. Tras T005.
- [x] T007 Añadir modelo y migración aditiva `apps/api/prisma/schema.prisma` y `apps/api/prisma/migrations/0010_classes_chat/migration.sql`: ClassSession «PK y grupo único inmutable, FK AcademicGroup», «Título trim 1–160; descripción null o ≤2000», revision «≥1», lastEventSeq «≥0», creador inmutable y fechas coherentes/monotónicas; mensaje «Texto trim 1–1000, original interno inmutable», «UNIQUE(classId,messageSeq)», hiddenAt/hiddenBy/hiddenEventSeq «Nulos o terna completa»; restricción PK(classId,studentId), revisión inicial 1; comando PK(actorId,commandId), digest SHA-256, referencias sin DTO; cambio PK(classId,eventSeq), eventSeq>0; auditoría atribuible; índices/constraints/triggers y timestamps nulos según `specs/005-clases-chat/data-model.md`, runtime DML, sin editar 0001–0009 ni almacenar credenciales de video; ClassVideoReference PK classId/FK RESTRICT, provider YOUTUBE_DEMO, videoId null o 11 ASCII [A-Za-z0-9_-], revision≥1, updatedBy y updatedAt, evento VIDEO_REFERENCE_CHANGED sin ID en deltas de alumno. FR-001/003/012/013/016–FR-020/022. Tras T006.
- [x] T008 Crear fixtures aisladas en `apps/api/tests/support/classes.ts` y `apps/api/tests/support/classes-temporal.ts`: grupos propio/ajeno/cancelado/retirado, docentes actual/anterior/deshabilitado, alumnos con matrícula original y fin±1 μs, clases/mensajes ficticios; reutilizar dueños de datos y pagos simulados sin modificar reglas 003. FR-005–FR-007/022. Tras T007.
- [x] T009 Escribir pruebas de matriz, orden de locks, topología cambiante y vigencia exacta en `apps/api/tests/integration/classes-authority.spec.ts`; incluir dos actores con cuentas distintas, actor objetivo de moderación, revocación/asignación/cancelación/retirada y BD indisponible. FR-002/005–FR-007/017/018/019. Tras T008.
- [x] T010 [P] Extender matriz cerrada y políticas en `apps/api/src/modules/authorization/domain/permissions.ts`, `apps/api/src/modules/authorization/public/session.ts` y `apps/api/src/modules/authorization/application/session-lookup.ts`, con sus pruebas: ADMIN manage-all, TEACHER manage-own, STUDENT participate-enrolled; tuplas CLASSES explícitas, permiso desconocido denegado y políticas previas intactas. FR-002/005/006/010. Tras T009.
- [x] T011 [P] Añadir participante público de oferta en `apps/api/src/modules/academic-offering/public/classes-access.ts` y `apps/api/src/modules/academic-offering/infrastructure/classes-participant.ts`: grupo/curso/estado/docente/elegibilidad actuales, referencias de gestión, misma conexión y sin BEGIN; retirada de oferta no equivale a cancelación. FR-002/005–FR-007. Tras T009.
- [x] T012 [P] Añadir participante público de matrícula en `apps/api/src/modules/enrollment/public/classes-access.ts` y `apps/api/src/modules/enrollment/infrastructure/classes-participant.ts`: descubrimiento propio no autoriza; hasAccess/groups y alumno objetivo al token exacto «confirmedAt ≤ t < validUntil» original; sin precios/pagos/terceros o mutaciones. FR-005–FR-007/017. Tras T009.
- [x] T013 [P] Crear proyección pública mínima de autores en `apps/api/src/modules/users/public/class-authors.ts` y `apps/api/src/modules/users/infrastructure/class-authors.ts`, con `apps/api/tests/integration/classes-author-projection.spec.ts`: solo id/name/role actuales por referencias autorizadas, sin UserView/correo/estado privado o roster global. FR-019. Tras T009.
- [x] T014 Implementar coordinador `apps/api/src/infrastructure/database/classes-transaction.ts`: accountTransaction con un presupuesto, cuentas UUID→sesión→curso→grupo→clase→filas subordinadas/ledger, SHARE al leer y clase UPDATE desde el comienzo al escribir; recheck topología, token μs tras locks y revalidación final; no locks financieros o transacción durante espera de red. Ejecutar T009. FR-006/007/013/018. Tras T010–T013.
- [x] T015 Implementar ledger/digest y errores seguros en `apps/api/src/modules/classes/infrastructure/command-store.ts`, `apps/api/src/http/error.filter.ts` y `apps/api/src/infrastructure/logging/security-events.ts`: autoridad antes del receipt, resultado único sin DTO original, COMMIT incierto sin retry automático, NO_CHANGE sin evento nuevo, rechazos atribuibles sin registrar cuerpos/secretos. FR-012/013/018–FR-020. Tras T014.
- [x] T016 Implementar `apps/api/src/modules/classes/infrastructure/video-disabled.ts` y prueba `apps/api/src/modules/classes/infrastructure/video-disabled.test.ts`: tras autorización responde NOT_CONFIGURED, sin URL/token/streamKey; doble de prueba no habilita reproducción protegida ni servicio externo. FR-008/009/023. Tras T015.
- [x] T017 Componer la fundación en `apps/api/src/app.module.ts` y políticas/adaptación de AcceptedSessionInterceptor en `apps/api/src/modules/authorization/entrypoints/http/access.guard.ts`. GET changes, GET video y POST socket-tickets nunca renuevan actividad, sin flag cliente ni cambio de expiración absoluta; ampliar `apps/api/tests/architecture/import-boundaries.spec.ts` y pruebas de sesión antes de handlers públicos. FR-006/019/021. Tras T016.

Checkpoint: T006/T009/T013 y regresión de permisos aprobados, sin importar
infraestructura ajena o relajar guards. Las historias parten de T017.

## Fase 3 — US1: preparar y conducir clase (P1, T018–T029)

Orden ajustado al cerrar T020–T023: las lecturas compartidas T030–T031 se
ejecutan después de T023 y antes de T024–T026. La gestión necesita listar grupos
y sesiones y recuperar un detalle tras recargar; esos endpoints ya estaban
especificados, pero su implementación quedaba después del E2E de gestión.
Se mantienen sus IDs/US2, alcance y permisos; no se marcan completadas por
corregir esta dependencia. El aula del alumno T032 espera T029 y T031.

Objetivo: gestión manual completa sin necesitar señal. Prueba independiente:
preparar/iniciar/finalizar con docente propio/admin; dos inicios dejan una LIVE.

- [x] T018 [P] [US1] Escribir pruebas de texto/estados/revisión en `apps/api/src/modules/classes/domain/class-session.test.ts`: Unicode/trim, «Título trim 1–160; descripción null o ≤2000», PREPARED→LIVE→FINISHED o PREPARED→CANCELLED, terminales sin reapertura y edición de textos sin cambiar identidad/estado. FR-001–FR-004/018; US1.1–US1.4/US1.6. Tras T017.
- [x] T019 [P] [US1] Escribir pruebas HTTP de creación/edición/transiciones y replay en `apps/api/tests/integration/classes-management-http.spec.ts`, incluyendo campos extra, CSRF/origen, permisos perdidos, revisión obsoleta y consulta de commands propia/no confirmada. FR-002/003/013/018/019; US1.5–US1.6. Tras T017.
- [x] T020 [US1] Implementar reglas puras en `apps/api/src/modules/classes/domain/class-session.ts`; mantener grupo/creador, fechas y revisiones según T018; iniciar no confirma señal ni disponibilidad, no automatizar por horario/reinicio. FR-001–FR-004. Tras T018–T019.
- [x] T021 [US1] Implementar persistencia de creación/textos/estados en `apps/api/src/modules/classes/infrastructure/class-store.ts`: grupo UPDATE al competir inicios, índice LIVE como segunda defensa, evento/receipt/auditoría atómicos y contador de cambios bajo clase UPDATE. FR-003/012/013/018/020. Tras T020.
- [x] T022 [US1] Implementar casos de uso en `apps/api/src/modules/classes/application/commands.ts`: autoridad actual antes de ledger, revisión esperada, NO_CHANGE, terminales y COMMIT incierto sin repetir efectos. FR-002/003/013/018. Tras T021.
- [x] T023 [US1] Exponer solo rutas de gestión definidas en `apps/api/src/modules/classes/entrypoints/http/classes.controller.ts` y `apps/api/src/modules/classes/classes.module.ts`; crear/editar/start/finish/cancel y GET commands, envelopes/errores por familia e inventario `apps/api/tests/architecture/endpoint-policies.spec.ts`; ejecutar T019. FR-001–FR-004/013/018–FR-020. Tras T022.
- [x] T024 [US1] Añadir DTO/cliente cerrado de gestión en `apps/web/src/features/classes/api.ts` y allowlists específicas en `apps/web/src/app/http.ts` y `apps/web/src/shared/api-client.ts`; campos/códigos de clases no amplían contratos anteriores, mismo commandId al consultar/reintentar resultado incierto. FR-013/018/019/021. Tras T031.
- [x] T025 [US1] Crear gestión en `apps/web/src/features/classes/management-page.tsx`: preparar/corregir, confirmación explícita de transiciones, conflictos comparables, estado separado de señal, vacío/carga/error y foco accesible. FR-001–FR-004/018/021. Tras T024.
- [x] T026 [US1] Integrar rutas/enlace de gestor por rol en `apps/web/src/app/classes-routes.tsx`, `apps/web/src/app/router.tsx`, `apps/web/src/app/App.tsx` y `apps/web/src/features/profile/home-page.tsx`, sin crear dashboard global ni importar lateralmente features. FR-002/021. Tras T025.
- [ ] T027 [US1] Crear fixture/configuración y E2E en `apps/web/tests/support/classes-fixture.ts`, `apps/web/playwright.classes.config.ts` y `apps/web/tests/e2e/classes-management.spec.ts`: desktop/móvil, teclado, docente/admin/ajeno, conflicto/replay y terminales, sin necesitar emisión real. FR-001–FR-004/013/018/021; SC-001 y parte de SC-002/007. Tras T026.
- [ ] T028 [US1] Ejecutar carreras con barreras de dos inicios, edición/finalización y pérdida de autoridad en `apps/api/tests/integration/classes-management-races.spec.ts`; verificar estado final persistido, rollback y no eventos de intentos rechazados. FR-002/003/013/018/020; SC-001/002. Tras T027.
- [ ] T029 [US1] Registrar resultados y límites de entrega US1 en `specs/005-clases-chat/evidence/us1-checkpoint.md` y actualizar `specs/005-clases-chat/verification.md`; no atribuir reproducción o cierre de SC-007 al recorrido de gestión. FR-023; SC-001/002. Tras T028.

## Fase 4 — US2: acceso y ensayo audiovisual (P1, T030–T040)

Entrega independiente disponible: encontrar sesiones autorizadas y distinguir
reproducción no habilitada. **US2 completa no está resuelta** por esa entrega.
YouTube real es un ensayo del MVP; Cloudflare queda fuera. G-V005 exige prueba real y límites externos conforme a constitución 2.0.0.

- [x] T030 [P] [US2] Escribir matriz PG/HTTP de grupos/sesiones/video deshabilitado en `apps/api/tests/integration/classes-access.spec.ts`: visitante/propio/ajeno/fin±1 μs, sesión revocada, oferta retirada/docente cambiado, grupo cancelado y referencias indistinguibles. FR-005–FR-009/019; US2.1/US2.3–US2.6; SC-002 parcial. Tras T023.
- [x] T031 [US2] Implementar grupos/contexto/listas/detalle en `apps/api/src/modules/classes/infrastructure/class-queries.ts` y lecturas HTTP en `apps/api/src/modules/classes/entrypoints/http/classes.controller.ts`: autorizar antes de total, page≥1/pageSize 1–50 (20 defecto), grupos name/id y sesiones createdAt DESC,id DESC; alumno excluye canceladas y no depende de oferta visible/docente habilitado. FR-005–FR-007/019. Tras T030.
- [ ] T032 [US2] Implementar navegación y aula mínima del alumno en `apps/web/src/features/classes/student-page.tsx`, `apps/web/src/features/classes/classroom.tsx` y `apps/web/src/app/classes-routes.tsx`; distinguir PREPARED/LIVE/FINISHED y señal aún no habilitada, referencias ajenas/permiso perdido, sin iframe supuesto como protegido. FR-004–FR-007/021. Tras T029 y T031.
- [ ] T033 [US2] Verificar GET video NOT_CONFIGURED con permiso actual, sin URL/secretos, y pruebas UI en `apps/api/tests/integration/classes-video-disabled.spec.ts` y `apps/web/src/features/classes/classroom.test.tsx`; cerrar evidencia de consulta parcial en `specs/005-clases-chat/evidence/us2-access.md`. No cerrar SC-003. FR-008/009/023. Tras T032.
- [ ] T034 [P] [US2] Verificar el registro de aprobación V05 y enmienda 2.0.0 en `specs/005-clases-chat/evidence/video-scope-adoption.md` contra la matriz T003: alcance propio/externo, FR-005/006/008/009/021/023, SC-002/003/007 y profesor si afecta evaluación; preservar borrador/checkpoints previos, sin atribuir aceptación académica o reproducción real. FR-008/009/023. Tras T003; compatible con continuar T041.
- [ ] T035 [US2] Revisar/completar `specs/005-clases-chat/contracts/video.md` y `specs/005-clases-chat/data-model.md` conforme a V05: ClassVideoReference, ID validado/revisión, edición por gestor en PREPARED/LIVE, entrega solo LIVE autorizada, retirada del player y operación manual externa; comprobar límites de G-V005 y fuentes oficiales del player antes de adoptar implementación. FR-005/006/008/009; SC-002/003. Tras T034; diseño ya redactado, sin ejecución por existir el archivo.
- [ ] T036 [US2] Escribir primero pruebas de referencia/replay/validación/origen/player en `apps/api/tests/integration/classes-video-access.spec.ts` y `apps/web/src/features/classes/video-player.test.tsx`; preparar `specs/005-clases-chat/evidence/youtube-rehearsal.md` con cuenta/contenido autorizados, CSP/referer, duración/calidad/fallos y detener manualmente YouTube, sin publicar secretos o señal por iniciativa del agente. FR-004/005/006/008/009/023; SC-002/003. Tras T033–T035.
- [ ] T037 [US2] Implementar referencia de ensayo en `apps/api/src/modules/classes/infrastructure/video-access.ts` y `apps/api/src/modules/classes/entrypoints/http/video.controller.ts`: GET/PUT de configuración para gestor actual, ID null o «11 caracteres ASCII [A-Za-z0-9_-]», expectedRevision/commandId, ledger/evento/auditoría atómicos; GET video solo entrega CONFIGURED en LIVE vigente, NOT_CONFIGURED/CLASS_NOT_LIVE sin ID y nunca renueva inactividad. Sin secretos, OAuth, solicitudes a URLs del cliente o relay de video. FR-005/006/008/009/013/019; SC-002/003. Tras T036.
- [ ] T038 [US2] Implementar `apps/web/src/features/classes/video-player.tsx`, gestión de ID en `apps/web/src/features/classes/management-page.tsx` y CSP/cabeceras en `apps/web/index.html` y `apps/web/vite.config.ts` según contrato: iframe/API oficiales, origin exacto, sin autoplay, aviso de enlace compartible, onReady distinto de PLAYING, sondeo pasivo/teardown al perder acceso/cambio de referencia/logout y callbacks descartados; probar con dobles sin contarlos como emisión real. FR-004/006/008/009/021; SC-002/003 parcial. Tras T037.
- [ ] T039 [US2] Ejecutar T036, ampliar inventarios de rutas y E2E `apps/web/tests/e2e/classes-video.spec.ts`; ejecutar ensayo YouTube autorizado y registrar `specs/005-clases-chat/evidence/youtube-rehearsal-results.json` y `specs/005-clases-chat/evidence/youtube-access-results.md`: reproducción observada, negativas de recursos propios/fin exacto, límite del enlace externo y operación manual del emisor. **PENDIENTE EXTERNO** para evidencia real hasta cuenta/entorno disponibles; un doble no completa esta parte, no se exige corte externo por matrícula ni Cloudflare. FR-004/005/006/008/009/023; SC-002/003. Tras T038.
- [ ] T040 [US2] Auditar US2.1–US2.7 y G-V005 del ensayo en `specs/005-clases-chat/evidence/us2-acceptance.md`: controles propios, reproducción real y límites externos separados; no cerrar SC-003 solo con T033 o player simulado, ni acreditar protección multimedia completa. FR-005–FR-009/023; SC-002/003. Tras T033/T039 y evidencia real del alcance aprobado.

T034 verifica la aprobación ya registrada y T035 el contrato antes del código.
US3 continúa tras T033 sin esperar cuenta/emisión real de T039; Cloudflare no es
dependencia. US2/SC-003 solo se aceptan con evidencia real del ensayo.

## Fase 5 — US3: chat e historial recuperable (P1, T041–T062)

Objetivo: intercambio autorizado y persistido, reconexión e historial de solo lectura.
Prueba independiente con clases ficticias LIVE sin necesitar video.

- [ ] T041 [P] [US3] Escribir dominio de mensajes/cuota en `apps/api/src/modules/classes/domain/message.test.ts`: «Texto trim 1–1000, original interno inmutable», Unicode/control, límite 10 nuevos por usuario/clase en `(t−10 s,t]`, múltiples conexiones, ocultos cuentan, replay no cuenta. FR-010–FR-013; US3.1/US3.3/US3.6. Tras T033.
- [ ] T042 [P] [US3] Escribir pruebas PG/HTTP de confirmación/replay/COMMIT incierto en `apps/api/tests/integration/classes-chat.spec.ts`: efecto/messageSeq/eventSeq/receipt atómicos, cero mensajes ajenos, LIVE para intención nueva y replay previamente confirmado en FINISHED con lectura vigente. FR-010–FR-015; SC-004/005. Tras T033.
- [ ] T043 [P] [US3] Escribir pruebas de snapshot/delta/historial y cambios filtrados en `apps/api/tests/integration/classes-sync.spec.ts`: watermark coherente, after≥0/limit 1–100 (50), hasMore/cursor, evento de ocultación sin SEND posterior, beforeSeq no avanza cursor global, proyección actual sin payload original. FR-014–FR-016/019; SC-004/005. Tras T033.
- [ ] T044 [P] [US3] Escribir pruebas con socket.io-client real en `apps/api/tests/integration/classes-socket.spec.ts`: Origin/Upgrade, cookie y ticket ligado/uniuso/TTL, dos conexiones, cuota de plazas, revocación/vencimiento con socket abierto, sin texto en avisos o renovación por tráfico de fondo. FR-006/014/019/021. Tras T033.
- [ ] T045 [US3] Implementar reglas puras en `apps/api/src/modules/classes/domain/message.ts` y `apps/api/src/modules/classes/domain/message-limits.ts`; conteo uniforme y ventana móvil sobre confirmados con reloj μs y rechazo seguro al retroceder. FR-010/011. Tras T041–T044.
- [ ] T046 [US3] Implementar envío en `apps/api/src/modules/classes/infrastructure/chat-store.ts` y cambios en `apps/api/src/modules/classes/infrastructure/change-store.ts`: clase UPDATE desde inicio, contador/eventSeq bajo lock, ledger antes de cuota/estado de nueva intención tras autoridad, commit conjunto sin aviso prematuro, sin DTO original en resultado/log. FR-010–FR-014/018/020. Tras T045.
- [ ] T047 [US3] Implementar snapshot/historial/delta en `apps/api/src/modules/classes/infrastructure/chat-queries.ts`: «UNIQUE(classId,messageSeq)», holes válidos, clase SHARE, highWatermark y nextCursor, mensajes actuales/tombstones y audiencia filtrada, cursors inválidos explícitos; lectura FINISHED con matrícula vigente. FR-014–FR-016/019. Tras T046.
- [ ] T048 [US3] Exponer HTTP messages/changes en `apps/api/src/modules/classes/entrypoints/http/classes.controller.ts` con aplicación en `apps/api/src/modules/classes/application/chat.ts`; límites cerrados y errores/chat-muted/429/503, sin autoridad de room; ampliar inventarios de rutas y ejecutar T042–T043. FR-010–FR-015/019. Tras T047.
- [ ] T049 [US3] Implementar cliente/reductor de sincronización en `apps/web/src/features/classes/chat-api.ts` y `apps/web/src/features/classes/chat-state.ts`: IDs/versiones, tombstone dominante, cursor solo tras aplicar página completa, beforeSeq no mueve cursor y NOT_CONFIRMED no crea otro ID; allowlists de clases por familia. FR-012–FR-016/021. Tras T048.
- [ ] T050 [US3] Crear chat en `apps/web/src/features/classes/chat.tsx`: texto inerte, composer LIVE, pendiente/confirmado/incierto/rechazado, historial por páginas, FINISHED solo lectura y acceso perdido; foco/scroll controlados y no mostrar borrador como entregado. FR-010–FR-015/021. Tras T049.
- [ ] T051 [US3] Implementar tickets en `apps/api/src/modules/classes/infrastructure/socket-tickets.ts` y endpoint HTTP: «Hash de secreto aleatorio de 256 bits», «TTL 30 s; uniuso, proceso único», «mapa máximo 3.000 entradas y 4 pendientes por sesión», ligado a sesión/authVersion/clase, sin URL/log, caducidad/consumo atómicos y sin accept por emitir/reconectar. FR-006/014/019. Tras T048.
- [ ] T052 [US3] Habilitar Upgrade de ruta exacta en `apps/web/vite.config.ts` y configuración aislada Compose usada por `apps/web/tests/support/classes-fixture.ts`, con pruebas de proxy/CSP en `apps/web/tests/e2e/classes-transport.spec.ts`; ws:true preserva Origin, WSS/mismo origen y JSON 16 KiB, sin polling Engine.IO o wildcard. FR-006/019/021. Tras T050–T051.
- [ ] T053 [US3] Implementar adaptador `apps/api/src/modules/classes/entrypoints/realtime/class-socket.ts`: path `/api/v1/classes/socket.io`, namespace `/classes`, solo WebSocket, Origin exacto/cookie/ticket, un aula/socket y `sync.required {}` sin contenido; connectionStateRecovery y escrituras offline deshabilitados. FR-006/014/019/021. Tras T052.
- [ ] T054 [US3] Implementar conexión y degradación en `apps/web/src/features/classes/chat-connection.ts`: ticket nuevo en reconexión de la misma generación, snapshot+delta, avisos y sondeo GET changes cada 5 s visible, una lectura en vuelo/backoff; cero reenvíos de comandos o borradores. FR-014/021. Tras T053.
- [ ] T055 [US3] Implementar reautorización/admisión/cierre en `apps/api/src/modules/classes/infrastructure/socket-lifecycle.ts` y configuración validada en `apps/api/src/infrastructure/config/environment.ts`: «4 sockets por actor entre sesiones, 3.000 por proceso», una clase/socket, un aviso pendiente/socket, barrido≤5 s auxiliar y revisión antes de cada entrega; liberar plazas en error/cierre, sin conexión PG por socket/cola ilimitada o renovación de actividad. FR-006/014/019/021. Tras T054.
- [ ] T056 [US3] Componer servidor/cierre ordenado en `apps/api/src/app.module.ts`, `apps/api/src/main.ts` y `apps/api/src/modules/classes/classes.module.ts`; conectar antes de listen y cerrar sockets antes de BD; integrar generación de cuenta/logout/abort en `apps/web/src/app/session.tsx` y aula. FR-006/014/021. Tras T055.
- [ ] T057 [US3] Ejecutar matriz HTTP/socket de T042–T044 y pruebas de no renovación por GET changes/GET video/POST tickets, inactividad real/absoluta y BD caída en `apps/api/tests/integration/classes-session.spec.ts`; comprobar contenido denegado con socket abierto y aceptación intencional previa intacta. FR-006/014/015/021; SC-002/004. Tras T056.
- [ ] T058 [US3] Escribir/ejecutar UI con respuestas tardías/snapshot viejo/tombstone, generación cambiada, logout fallido, historial y foco en `apps/web/src/features/classes/chat-state.test.ts` y `apps/web/src/features/classes/chat.test.tsx`; ninguna respuesta anterior restaura texto ocultado o borrador de otra sesión. FR-014/016/021. Tras T057.
- [ ] T059 [US3] Ejecutar E2E de dos grupos, dos conexiones, historial finalizado, caída/reconexión e intención incierta en `apps/web/tests/e2e/classes-chat.spec.ts`; comprobar desktop/móvil y teclado sin confundir simulación de señal con reproducción real. FR-010–FR-015/021/023; SC-004/005/007 parcial. Tras T058.
- [ ] T060 [US3] Añadir/ejecutar carreras con barreras en `apps/api/tests/integration/classes-chat-races.spec.ts`: dos cuentas, cuota simultánea, finalize/revoke/reassign/cancel/fin exacto contra envío/lectura; verificar ambos órdenes, sin deadlock de promoción o efecto duplicado, estado persistido final. FR-006/007/011–FR-015/018. Tras T059.
- [ ] T061 [US3] Verificar lectura sin nuevos envíos al finalizar y denegación al vencer matrícula en `apps/api/tests/integration/classes-history.spec.ts`; replay anterior autorizado no emite otra vez ni consume cuota, terminal no reabre tras reinicio. FR-013/015/022; US3.5; SC-005/006 parcial. Tras T060.
- [ ] T062 [US3] Registrar resultados y límites de chat/Socket.IO en `specs/005-clases-chat/evidence/us3-checkpoint.md` y `specs/005-clases-chat/verification.md`; incluir protocolo real, pérdida de avisos, matriz y recursos observados, sin afirmar 2.500 activos. FR-023; SC-004/005/008 parcial. Tras T061.

## Fase 6 — US4: moderación atribuible (P2, T063–T074)

Objetivo: ocultar/silenciar/rehabilitar sin cambiar cuenta/matrícula u otra clase.
Prueba independiente: dos alumnos/conexiones, ocultación y restricción persisten
tras reconectar; otra clase no hereda silencio; FINISHED permite ocultar.

- [ ] T063 [P] [US4] Escribir reglas y matriz PG/HTTP en `apps/api/src/modules/classes/domain/moderation.test.ts` y `apps/api/tests/integration/classes-moderation.spec.ts`: ocultación irreversible, sin original incluso moderador, silencio solo alumno vigente/LIVE, rehabilitación, revisión obsoleta/NO_CHANGE y responsable actual. FR-016–FR-020; US4.1–US4.5. Tras T062.
- [ ] T064 [P] [US4] Escribir UI de moderación en `apps/web/src/features/classes/moderation.test.tsx`: confirmaciones/foco, ocultación sin restore, silencio legible al propio alumno y objetivo de conversación autorizada sin roster global o causas privadas. FR-016/017/019/021. Tras T062.
- [ ] T065 [US4] Implementar reglas en `apps/api/src/modules/classes/domain/moderation.ts`: restricción PK(classId,studentId), muted/revision/updatedBy/updatedAt/lastEventSeq, no silenciar responsables, ocultación en LIVE/FINISHED; rehabilitar y silenciar solo LIVE, sin cambiar cuenta/derecho. FR-016/017/018. Tras T063–T064.
- [ ] T066 [US4] Implementar ocultación transaccional en `apps/api/src/modules/classes/infrastructure/moderation-store.ts`: hiddenAt/hiddenBy/hiddenEventSeq como «Nulos o terna completa», original interno inmutable, evento/receipt/auditoría juntos y sin texto original en replay/delta/consulta de moderador. FR-013/016/019/020. Tras T065.
- [ ] T067 [US4] Implementar silencio/rehabilitación en `apps/api/src/modules/classes/infrastructure/restriction-store.ts`: bloquear alumno objetivo en orden de cuentas, revalidar matrícula/rol/clase/gestor, revisión esperada 0 si inexistente/≥1 persistida, NO_CHANGE idempotente; todas sus conexiones obedecen sin bloquear lectura/video autorizados. FR-006/013/017/018. Tras T066.
- [ ] T068 [US4] Integrar moderación y proyecciones en `apps/api/src/modules/classes/application/moderation.ts` y `apps/api/src/modules/classes/infrastructure/chat-queries.ts`; HIDE/MUTE/UNMUTE cambian log durable y aviso genérico, estado actual al leer evento viejo, alumno solo ve restricción propia. FR-014/016/017/019. Tras T067.
- [ ] T069 [US4] Exponer hide/mute/unmute en `apps/api/src/modules/classes/entrypoints/http/classes.controller.ts`, ampliar inventario `apps/api/tests/architecture/endpoint-policies.spec.ts` y ejecutar T063 con rechazos/CSRF/replay. FR-016–FR-020. Tras T068.
- [ ] T070 [US4] Implementar controles y estado en `apps/web/src/features/classes/moderation.tsx`, `apps/web/src/features/classes/chat.tsx` y cliente `apps/web/src/features/classes/chat-api.ts`; acciones confirmadas/ inciertas, tombstones dominantes, historial sin original, foco estable y alcance solo de esa clase. FR-016/017/019/021. Tras T069.
- [ ] T071 [US4] Ejecutar carreras en `apps/api/tests/integration/classes-moderation-races.spec.ts`: ocultar contra lectura/replay/respuesta tardía, silenciar/rehabilitar contra send, finalizar y perder responsabilidad; fijar orden lógico, no prometer retirar bytes ya autorizados, nuevas consultas nunca recuperan original. FR-006/013/016–FR-018; SC-005. Tras T070.
- [ ] T072 [US4] Ejecutar T064 y E2E `apps/web/tests/e2e/classes-moderation.spec.ts`: varias conexiones, reconexión, FINISHED y otra clase, docente anterior/ajeno/alumno denegados, móvil/teclado y sesión cambiada. FR-016–FR-019/021; SC-002/005/007 parcial. Tras T071.
- [ ] T073 [US4] Comprobar atribución y privacidad de auditoría/errores en `apps/api/tests/integration/classes-audit.spec.ts`; actor/fecha/acción/resultado en inicios/cierres/moderación/rechazos relevantes, sin texto/correo/secretos y sin cambiar resultado aplicado para guardar un rechazo. FR-019/020. Tras T072.
- [ ] T074 [US4] Registrar checkpoint de moderación en `specs/005-clases-chat/evidence/us4-checkpoint.md` y `specs/005-clases-chat/verification.md`, con matriz, carreras y límites reales; sin cerrar video o aceptación humana por E2E. FR-023; SC-005. Tras T073.

## Fase 7 — Verificación transversal y cierre (T075–T086)

Sin [USn], porque cubre varias historias. Regresión/restore/ensayo local pueden
avanzar sin T039; cierre integral no. D10/D13 requieren decisiones/entorno reales.

- [ ] T075 Incorporar scripts/tipos/lint y suites de clases al CI en `apps/api/package.json`, `apps/api/tsconfig.classes.json`, `apps/web/package.json`, `apps/web/tsconfig.classes.json` y `.github/workflows/v00-linux.yml`; preservar migraciones antes de inicio y todas las suites 001–004; tests locales con doble de player se distinguen del ensayo YouTube externo, sin quitar asserts para pasar. FR-022/023. Tras T074 y T033.
- [ ] T076 Ejecutar regresión lint/tipos/build/unitarias/arquitectura/PG/HTTP/Socket.IO/E2E y Q01–Q16 aplicables, registrar versión/resultados en `specs/005-clases-chat/evidence/automated.md`; separar requisitos de video pendientes y fallos reales sin contarlos como aprobados. FR-001–FR-023; SC-001/002/004/005. Tras T075.
- [ ] T077 Ampliar ensayo de upgrade desde 0009 y reinicio en `ops/recovery/rehearse-classes.ps1`, con `specs/005-clases-chat/evidence/upgrade-restart.md`: constraints, estados/lastEventSeq/orden, mensajes/moderación/receipts conservados, sin clase/señal/reenvío automáticos; laboratorio separado. FR-022; SC-006. Tras T076.
- [ ] T078 Ejecutar restore cifrado aislado con tablas/índices/contadores/mensajes/ocultación/silencio y referencia/versiones de video (sin señal audiovisual), accesos restaurados invalidados y decisiones post-backup perdidas revisadas en `ops/recovery/rehearse-classes.ps1`; registrar `specs/005-clases-chat/evidence/recovery.md`, sin restaurar sobre BD existente o dar D13 externo por cumplido. FR-022; SC-006. Tras T077.
- [ ] T079 Medir recursos locales con corpus de chat y cliente lento/avisos perdidos en `apps/api/tests/support/classes-resources.mjs` y `specs/005-clases-chat/evidence/local-resources.md`: memoria, sockets/plazas, pool, consultas/fanout, confirmaciones/sync, reconexión, BD/WAL/backups; distinguir límite configurado de carga alcanzada. FR-011/014/023; SC-008 parcial. Tras T076.
- [ ] T080 Preparar y ejecutar observación consentida de gestión/chat/moderación con docente/alumno/responsable en `specs/005-clases-chat/evidence/human-acceptance.md`; registrar éxito/ayuda/dispositivo/modalidad sin nombres, no inferir consentimiento del ensayo 004 y declarar móvil/teclado no observados. FR-021/023; SC-007 parcial. Tras T076 y participantes disponibles.
- [ ] T081 Completar recorrido consentido de emisión/reproducción YouTube con docente/alumno y responsable en `specs/005-clases-chat/evidence/human-video.md`: acceso propio, aviso de límite externo, moderación/finalización y detención manual en proveedor; registrar dificultad/ayuda/dispositivo/modalidad, sin cerrar SC-007 con mocks o modalidades no observadas. FR-008/009/021/023; SC-003/007. Tras T039 y participantes/entorno autorizados disponibles.
- [ ] T082 Acordar y verificar custodia/copia/clave/destino externo/retención/RPO/RTO y recuperación real de la versión de clases en `specs/005-clases-chat/operation.md`, enlazando pendientes D13 previos; protocolo no es operación ejecutada. FR-022/023; SC-006. Tras T078 y decisiones/equipo disponibles; antes de demo persistente o publicación.
- [ ] T083 Preparar escenario de chat con cliente Socket.IO real y lecturas HTTP, alinear D10 con rúbrica y ejecutar solo en destino/generador autorizados en `load-tests/classes/scenario.ts` y `specs/005-clases-chat/capacity.md`; población≥15.000, meta2.500 activos con mezcla/ventana/conexiones/mensajes/reproducciones/latencia/errores/recursos/costo separados; pagos simulados y video real aparte, sin contratar o afirmar capacidad desde ensayo local. FR-023; SC-008. Tras T079, rúbrica/infraestructura autorizada disponibles; aprobación combinada sigue en 007.
- [ ] T084 Sincronizar estado actual en `specs/005-clases-chat/spec.md`, `specs/005-clases-chat/plan.md`, `specs/005-clases-chat/quickstart.md`, `specs/005-clases-chat/verification.md` y `docs/planificacion/hoja-ruta-005-007.md`, conservando checkpoints, V04/V05 y Cloudflare fuera del MVP, resultados parciales, límites externos y validación académica si aplica; no reescribir specs cerrados o cerrar pendientes heredados. FR-023. Tras T076–T079; registrar T080–T083 pendientes si faltan personas/acuerdos/entorno, sin esperar su ejecución para actualizar documentos.
- [ ] T085 Elaborar revisión preliminar FR/SC/24 escenarios y límites pendientes en `specs/005-clases-chat/evidence/final-acceptance.md`; registrar implementado/probado/simulado/no observado/pendiente, controles propios versus video externo, tareas y validación académica si aplica; puede entregarse con brechas, sin llamar completo al spec. FR-023; SC-001–SC-008. Tras T084.
- [ ] T086 Cerrar aceptación integral en `specs/005-clases-chat/evidence/final-acceptance.md` solo con evidencia de todos los requisitos/escenarios vigentes, T040/T078/T080–T083 y D13/D10 aplicables; conservar validación del profesor pendiente si cambia criterios de evaluación y no declarar aceptación académica sin ella. **PENDIENTE DE EVIDENCIA** mientras falte una condición; presupuesto de tiempo, aprobación documental o mocks no cierran el spec. FR-001–FR-023; SC-001–SC-008. Tras T040/T078/T080–T085 y todas las condiciones anteriores.

## Dependencias y orden de entrega

```text
T001 → T002 → {T003,T004} → T005–T009
                           → {T010,T011,T012,T013} → T014–T017
→ US1 backend T018–T023 → consultas compartidas T030–T031
→ US1 cliente/UI/E2E T024–T029 → US2 aula T032–T033
                  ├→ T034 → T035 → T036 → T037 → T038 → T039 → T040
                  │                                    (ensayo real pendiente)
                  └→ US3 T041–T062 → US4 T063–T074 → T075–T079 → T084–T085
                                                           ├→ T080–T083 (condiciones externas)
                                                           └→ T086 [evidencia pendiente; exige también T080–T083]
```

Las dependencias «Tras» de cada tarea son la autoridad cuando el dibujo resume
varias cadenas. Los IDs ordenan dentro del bloque; **no** obligan a esperar video
para US3/US4. No generar rama/spec 006/007 o implementación post-MVP desde esta lista.

## Paralelismo y criterios de prueba independientes

| Historia | Ejemplo de trabajo en archivos distintos tras prerrequisitos | Entrega verificable |
| --- | --- | --- |
| US1 | T018 dominio y T019 HTTP | Gestión sin señal; competencia deja una LIVE |
| US2 | T030 matriz y T034 propuesta documental tras sus respectivos prerrequisitos | Consulta autorizada y ensayo real separado; aceptación pendiente |
| US3 | T041/T042/T043/T044 en suites distintas tras T033 | Chat de dos clases, replay, reconexión e historial vigente |
| US4 | T063 backend y T064 UI tras T062 | Ocultación/silencio propios persistidos, sin efecto en otra clase |

T003/T004 y T010–T013 son paralelizables dentro de sus ventanas. No paralelizar
ediciones del controlador, AppModule, manifests o lockfile. PG y E2E comparten
recursos del harness: aislar fixtures/configuración y medir antes de lanzar más
runners. Una marca [P] no permite saltar dependencias, gates o pruebas previas.

## Estrategia incremental y evidencia

Primer incremento técnico: T001–T017 y US1, verificable sin video. Después consulta
US2 parcial, chat y moderación. Cada checkpoint registra commit, pruebas y límites;
las tareas humanas/operativas mantienen [ ] si faltan personas, acuerdos o entorno.
YouTube de prueba requiere evidencia real para G-V005 y límites externos explícitos.
La protección multimedia completa pertenece al incremento posterior; ninguna tarea
exige Cloudflare dentro del MVP. El cierre integral sigue pendiente de verificación.

El análisis de consistencia posterior debe revisar cobertura real, alcance
de video aprobado y evidencia pendiente antes de `speckit-implement`. Enumerar una tarea condicional
no resuelve su diseño ni demuestra cumplimiento; el informe no debe dar un pase global.
