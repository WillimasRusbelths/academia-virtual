# Tareas: materiales de estudio por grupo — 004

**Fecha**: 2026-11-17, America/Lima. **Estado**: T001–T064 y T067 completadas,
65/68 tareas; 3 pendientes. T060 verifica MV01–MV11 y corrige nombres aceptados
por API pero rechazados por el cliente, con 14 casos nuevos. Actualiza cuatro
inventarios de migraciones, conservando checksums y reglas de negocio. API:
3961 casos aprobados en 171 archivos, cobertura compuesta entre ampliada y focal
final 687/687; web 614/614 y E2E real 42/42 sin reintentos. Tipos Linux, lint y
builds aprobados. [Evidencia transversal](evidence/automated.md).
T061–T062 comprueban upgrade 0007, reinicio y restore cifrado separado con
bytes/hashes, permisos, sesiones y decisiones perdidas: [evidencia](evidence/recovery.md).
T063 mide recursos locales al límite de 20 MB, cliente lento y fallos inyectados:
[evidencia](evidence/local-resources.md). T064 completada en laptop por confirmación del responsable tras corregir el PDF: [registro humano](evidence/human-acceptance.md). Móvil no observado; teclado, navegador/SO y ayuda sin desglose comunicado.
T065–T066 preparadas documentalmente: [operación](operation.md) y [capacidad](capacity.md).
El responsable confirmó que D13 aún no está definido y D10 aún no está disponible;
ambas tareas siguen pendientes: [informe](evidence/t065-t066-report.md).
T067 completada: spec/plan/guía/arquitectura sincronizados, con registros originales íntegros. T068 mantiene la [revisión preliminar FR/SC/escenarios](evidence/final-acceptance.md), pendiente de T065–T066. CI remoto y puertas operativas pendientes. [Cierre T064/T067](evidence/t064-t067-report.md).
IDs locales a este spec; T001 no es T001 de 001–003.
**Entrada**: [spec](spec.md), [plan](plan.md), [investigación](research.md),
[modelo](data-model.md), [API](contracts/api.md), [integración](contracts/integration.md),
[UI](contracts/ui.md) y [validación](quickstart.md). Constitución 1.2.1.

Los documentos anteriores describen sus etapas originales; su texto «pendiente de
plan/tareas» no invalida estos artefactos posteriores. Este documento es el estado
de ejecución actual. No modifica decisiones M01–M03 o evidencia histórica.

## Formato y reglas de ejecución

Cada tarea tiene checkbox, ID, [P] solo si admite trabajo en archivos diferentes,
[USn] en fases de historia y rutas desde la raíz. Dependencias «Tras» son obligatorias;
sin indicación adicional, seguir orden dentro de fase. [P] no autoriza lanzar agentes.

El spec exige pruebas de autorización/integridad/recuperación y recorridos humanos;
por eso se incluyen tests de comportamiento. Escribirlos antes del comportamiento
y confirmar fallo por funcionalidad ausente, sin dejar imports rotos como evidencia
de rechazo correcto. Aceptación humana, D10/D13 y cierre integral son tareas separadas.
No marcar [x] por crear un test, escribir una guía o ejecutar un comando sin resultado.

## Fase 1 — Preparación (T001–T004)

Objetivo: hacer reproducible y reversible el primer incremento sin tocar datos manuales.

- [X] T001 Registrar baseline de archivos/configuración y estado Git, hashes de evidencia y pendientes 001–003 en `specs/004-materiales-estudio/evidence/t001-baseline.json`; confirmar rama real y feature activa, sin imprimir secretos ni cambiar rama.
- [X] T002 Definir la configuración y comandos del entorno aislado reutilizando `ops/docker/test-harness.md` y documentarlos en `specs/004-materiales-estudio/evidence/implementation-environment.md`; preservar BD/puertos/cuentas manuales, sin reset o bootstrap repetido.
- [X] T003 [P] Precisar matriz ejecutable MV01–MV13, FR-001–FR-020, SC-001–SC-007 y los 19 escenarios de historias en `specs/004-materiales-estudio/verification.md`; separar pruebas automáticas, observación humana y puertas operativas. Tras T001–T002.
- [X] T004 [P] Preparar manifiesto y corpus ficticio PDF/JPEG/PNG válido/truncado en `apps/api/tests/support/materials-files.ts` y sus comprobaciones de fixture; incluir «1–20 000 000 bytes», 20 000 001, extensión falsa, mismo nombre y hashes reproducibles, sin padding que invalide formato. Tras T001–T002.

**Checkpoint**: T001–T004 habilitan diseñar y comprobar el entorno de pruebas;
no exponen rutas ni publican materiales. Primer bloque recomendado de implementación.

Ejecutado el 2026-11-16: [checkpoint de preparación](evidence/preparation-checkpoint.md),
18 entradas de corpus, 6/6 pruebas, lint y tipos focalizados aprobados. Docker no
disponible; ninguna migración o prueba PostgreSQL/E2E ejecutada en este bloque.
En ese checkpoint la siguiente tarea era T005; el bloque de persistencia posterior
se registra a continuación, conservando la evidencia original.

## Fase 2 — Fundamentos compartidos (T005–T016)

Bloquea las historias hasta comprobar contratos, almacenamiento y reautorización.

- [X] T005 Definir DTO cerrados y puertos en `apps/api/src/modules/materials/public/materials.ts` y `apps/api/src/modules/materials/application/ports.ts`: UUID, «revisiones bigint positivas como string», «timestamptz(6) sin perder microsegundos», PREPARED/PUBLISHED/WITHDRAWN, PENDING/COMPLETED y APPLIED/NO_CHANGE; sin SQL/Buffer/Nest en puertos.
- [X] T006 Escribir pruebas de constraints/rollback SQL directo en `apps/api/tests/integration/materials-schema.spec.ts`: FK restrict, material sin contenido, immutable archivo/grupo/autor, tamaño y duplicados de intención/comando; deben fallar antes de T007. Tras T004–T005.
- [X] T007 Añadir entidades/índices en `apps/api/prisma/schema.prisma` y migración `apps/api/prisma/migrations/0008_materials/migration.sql` sin editar 0001–0007: «Trim 1–200 caracteres; sin controles», «Opcional hasta 2000 caracteres; vacío normaliza a null; texto sin HTML ejecutable», «Nombre seguro hasta 180 caracteres, extensión coherente; nunca ruta», «Hexadecimal minúsculo 64, recalculado por servidor», «bytea privado; 1–20 000 000 bytes; CHECK de octet_length igual a byteSize»; unique, FK y trigger diferido conforme a `data-model.md`, revisión inicia 1 y timestamps nullable según modelo. Tras T006.
- [X] T008 Crear fixture aislado en `apps/api/tests/support/materials.ts`: dos grupos del mismo curso, cancelado, actores/matrículas de la matriz y materiales completos de tres estados; reutilizar propietarios públicos de 001–003, sin proveedor real ni alterar sus reglas. Tras T007.
- [X] T009 Escribir pruebas de permisos, orden de locks y admisión en `apps/api/tests/integration/materials-authority.spec.ts` y `apps/api/tests/integration/materials-admission.spec.ts`; cubrir reasignación/revocación/cancelación, desconocido denegado, 2 global/1 actor, liberación en abortos y permiso antes de bytes. Tras T008.
- [X] T010 Añadir permisos materiales a `apps/api/src/modules/authorization/domain/permissions.ts` y sus pruebas existentes: ADMIN manage-all, TEACHER manage-own, STUDENT read-enrolled; conservar permisos previos y denegación por defecto. Tras T009.
- [X] T011 Añadir contrato público `apps/api/src/modules/academic-offering/public/materials-access.ts` y adaptador `apps/api/src/modules/academic-offering/infrastructure/materials-participant.ts`; contexto/grupos mínimos, estado/asignación/elegibilidad mediante contrato público de usuarios, sin filtrar por oferta visible ni abrir otra transacción. Tras T010.
- [X] T012 Implementar `apps/api/src/infrastructure/database/materials-transaction.ts`: cuentas UUID → sesión → curso → grupo → material/intención; SHARE/UPDATE, recheck topología y reloj exacto después de locks, un presupuesto accountTransaction, revalidación antes del ledger; liberar antes de red y no adquirir locks financieros. Tras T011.
- [X] T013 Implementar admisión de binarios en `apps/api/src/modules/materials/infrastructure/transfer-admission.ts` y parámetros validados en `apps/api/src/infrastructure/config/environment.ts`: 2 por proceso/1 por actor y recepción inicial 60 s configurable; 429/503 antes de buffer, sin cola ilimitada, liberación finish/close/error y sin modificar entorno real. Tras T012.
- [X] T014 Definir errores públicos de materiales en `apps/api/src/modules/materials/domain/material-error.ts`, allowlist en `apps/api/src/http/error.filter.ts` y plantillas seguras en `apps/api/src/infrastructure/logging/security-events.ts`; no cuerpos/bytes/textos libres/secretos/digests internos en registros, conservar contratos de otras familias. Tras T013.
- [X] T015 Implementar contexto y listado mínimo de gestión en `apps/api/src/modules/materials/infrastructure/material-queries.ts`: pertenencia antes de conteo/paginación, páginas 1–50 (20 defecto), grupos name/id y materiales createdAt/id descendentes, sin seleccionar bytes ni SQL de tablas ajenas; cancelado solo administrador histórico. Tras T014.
- [X] T016 Componer dependencias compartidas en `apps/api/src/app.module.ts` y validar límites de capas en `apps/api/tests/architecture/import-boundaries.spec.ts` y `apps/api/tests/architecture/endpoint-policies.spec.ts`; ejecutar T006/T009 y regresión de permisos antes de habilitar handlers de historias. Tras T015.

Bloque T005–T008 ejecutado: [checkpoint de persistencia](evidence/t005-t008.md).
11 pruebas SQL primero fallaron sin 0008 y después pasaron; 139 pruebas de fixture,
instalación/upgrade y limpieza, y 749 unitarias/arquitectura aprobadas. Lint,
build API, tipos focalizados, validación y generación Prisma aprobados. Solo esquemas
aleatorios de una BD de ensayo nueva, sin puertos publicados o datos manuales.
En ese checkpoint quedaban T009–T016. Su evidencia histórica conserva ese alcance.

Bloque T009–T016 ejecutado: [checkpoint de fundamentos](evidence/t009-t016.md).
45/45 pruebas de materiales (incluido corpus/esquema), 770/770 unitarias/arquitectura,
lint/build/generación Prisma y tipos focalizados aprobados. Regresión de configuración,
sesión, transporte, errores y privacidad de oferta/matrícula verificada; se corrigió la
limpieza de un fixture para añadir únicamente dependencias vacías del mismo esquema.
No hay handlers de materiales. El permiso del alumno se registra, pero su derecho de
consulta se implementará en US2 con T035–T042; gestión sigue separada de matrícula.
Siguiente bloque: T017–T019, pruebas US1 antes del comportamiento de carga/publicación.

**Checkpoint**: fundamentos aprobados en BD de prueba. Nada concede acceso a un
alumno por reserva, pago pendiente, catálogo o rol de gestión sin pertenencia.

## Fase 3 — US1: preparar y publicar (P1, T017–T034)

**Objetivo**: docente actual/admin prepara archivo completo y publica explícitamente.
**Prueba independiente**: grupo y gestores ficticios, sin cobrar o crear matrícula;
observar preparado/publicado, contenido íntegro y rechazo de actores ajenos.

Bloque T017–T019 ejecutado: [pruebas previas de US1](evidence/t017-t019.md).
60 casos nuevos: 59 fallos esperados por funcionalidad ausente y un control de
transporte aprobado. Regresión anterior 197/197; lint, tipos y build API aprobados.
Estas tres tareas acreditan pruebas escritas y ejecutadas antes del comportamiento,
no aceptación funcional de US1. Siguiente tarea: T020; las suites generales que
incluyen estas pruebas permanecen en rojo hasta implementar T020–T028.

T020 implementada después de ese checkpoint: [validadores](evidence/t020.md).
50/50 casos de normalización/formatos y regresión seleccionada total 865/865;
lint, tipos y build API aprobados. Sin dependencias nuevas ni rutas habilitadas.
T018/T019 siguen pendientes de comportamiento; siguiente tarea T021.

T021 implementada: [intenciones persistidas](evidence/t021.md). Las 18 pruebas
iniciales fallaron por capacidad ausente y luego pasaron; 21/21 al ampliar casos.
Regresión seleccionada 886/886 con dos workers, lint/tipos/build aprobados. Sin
material parcial, expiración implícita o handlers. Siguiente tarea T022.

T022 implementada: [completado atómico](evidence/t022.md). 19 casos de completado
y regresión seleccionada 905/905, lint/tipos/build aprobados. Material PREPARED,
contenido, enlace COMPLETED y auditoría en un commit; recheck de permiso, replay
y recuperación tras respuesta de COMMIT perdida. Siguiente tarea T023; no HTTP/UI.

T023–T024 implementadas: [publicación y receptor](evidence/t023-t024.md).
Publicación/ledger/auditoría: 9 casos; receptor con transporte/guard reales: 13;
protección de errores tardíos: 2 casos nuevos. Regresión 944/944 y filtro 5/5
(tres casos solapados: 946 distintos aprobados). Lint, tipos y build API aprobados.
El controlador de recepción es solo de ensayo: T025/T026 siguen pendientes y las
pruebas completas de rutas T018 aún no acreditan handlers de producción.

- [X] T017 [P] [US1] Escribir pruebas de normalización/formatos/tamaño en `apps/api/src/modules/materials/domain/material.test.ts` y `apps/api/tests/integration/materials-format.spec.ts`; corpus real PDF/JPEG/PNG, 0/exacto/exceso, estructura truncada, CRLF/nombres/separadores y hash incompatible, no solo magic bytes. Tras T016.
- [X] T018 [P] [US1] Escribir contrato HTTP upload/publicación en `apps/api/tests/integration/materials-upload.spec.ts`: CSRF/origen, JSON 16 KiB, excepción PUT exacta, framing válido sin Content-Length, compresión/multipart rechazados y pérdida de autoridad antes de commit. Tras T016.
- [X] T019 [P] [US1] Escribir estados de formulario/reintento en `apps/web/src/features/materials/management-page.test.tsx`; rechazo conserva textos, preparado no publica, confirmación explícita y respuesta incierta sin replay automático. Tras T016.
- [X] T020 [US1] Implementar metadatos puros en `apps/api/src/modules/materials/domain/material.ts` y validador binario acotado en `apps/api/src/modules/materials/infrastructure/file-validation.ts`; aplicar límites textuales exactos de T007, PDF terminación/estructura, JPEG marcadores/fin, PNG chunks/CRC/IEND, longitud y SHA-256 servidor. Si hace falta parser externo, documentar compatibilidad antes de añadirlo; sin visor/antivirus prometido. Tras T017.
- [X] T021 [US1] Implementar registrar/consultar intención en `apps/api/src/modules/materials/application/uploads.ts` y `apps/api/src/modules/materials/infrastructure/uploads.ts`: unique actor/intentionId, groupId/metadata esperados inmutables, digest de todos los campos, materialId nullable unique, PENDING no material; replay reautoriza, payload distinto conflicto, sin expiración/purga automáticas. Tras T020 y T018.
- [X] T022 [US1] Implementar completar upload en `apps/api/src/modules/materials/infrastructure/material-store.ts` y `apps/api/src/modules/materials/infrastructure/content-store.ts`: preparado+bytea+COMPLETED+resultado+auditoría en commit único; contenido/grupo/autor inmutables, recheck permiso después de recepción, rollback/COMMIT incierto y PUT duplicado sin segundo material. Tras T021.
- [X] T023 [US1] Implementar publicación explícita y ledger en `apps/api/src/modules/materials/application/commands.ts`, `apps/api/src/modules/materials/infrastructure/commands.ts` y `apps/api/src/modules/materials/infrastructure/audit.ts`; PREPARED→PUBLISHED, revision +1, publishedAt servidor; duplicado reautoriza y devuelve vista actual/appliedRevision, misma identidad distinta intención conflicto. Publicar ya publicado es NO_CHANGE con revisión válida. Tras T022.
- [X] T024 [US1] Añadir excepción binaria a `apps/api/src/http/transport.ts` y receptor `apps/api/src/modules/materials/entrypoints/http/content-receiver.ts`: solo PUT /materials/uploads/:uuid/content, JSON global intacto, permiso/plaza antes de consumir, bytes reales ≤20 000 000, encoding identity, plazo/abortos y sin transacción abierta durante red. Tras T018 y T023.
- [X] T025 [US1] Implementar POST intención, GET intención, PUT contenido, POST publish y consultas de gestión en `apps/api/src/modules/materials/entrypoints/http/materials.controller.ts`; DTO cerrados, errores allowlist, 201/200 y actor dueño de intención además de gestor actual. Tras T024.
- [X] T026 [US1] Conectar handlers/servicios de US1 en `apps/api/src/modules/materials/materials.module.ts` y `apps/api/src/app.module.ts`; demostrar que no quedan rutas públicas o adaptadores ficticios de producción y pasar pruebas T017–T018. Tras T025.

T025–T026 implementadas: [gestión HTTP real](evidence/t025-t026.md).
Ocho rutas con política cerrada ADMIN/TEACHER y reautorización por recurso;
intención nueva 201/replay 200, PUT nuevo 201/replay 200 y publish 200.
T018 pasa 11/11 sin modificar su contrato; receptor 13/13 ahora sin controlador
de ensayo, gestión HTTP adicional 12/12. Regresión 972/972 en 52 archivos,
lint/tipos/build API aprobados. Continúa T027; T019/UI, descarga/alumno y
edición/retiro permanecen pendientes en sus tareas.
- [X] T027 [US1] Añadir cliente JSON/binario de carga en `apps/web/src/features/materials/api.ts`, contrato inyectable en `apps/web/src/shared/api-client.ts` y composición en `apps/web/src/app/http.ts`; fetch same-origin/no-store/redirect error, envío File sin JSON, códigos/campos cerrados y generación de sesión/aborto. Tras T026 y T019.
- [X] T028 [US1] Implementar formulario/listado gestor en `apps/web/src/features/materials/management-page.tsx`: título/descripción/archivo, digest cliente, intención estable por contenido, preparado/publicado diferenciados, confirmación de publicación y consulta de incierto antes de reintento manual; File/textos solo memoria, sin porcentaje inventado. Tras T027.
- [X] T029 [US1] Integrar `/materiales` y `/materiales/grupos/:groupId` para gestores en `apps/web/src/app/materials-routes.tsx` y `apps/web/src/app/router.tsx`; enlaces desde grupos en composición app, sin imports laterales entre features ni panel general nuevo. Tras T028.

T027–T029 implementadas: [cliente, formulario y rutas](evidence/t027-t029.md).
T019 pasa 7/7 sin cambios a sus pruebas; bloque focal 40/40 y regresión web
526/526. Arquitectura/unidades API 793/793. Build/tipos y lint web aprobados;
Chromium con API simulada pasa siete comprobaciones de flujo/foco/rutas/móvil.
No equivale al E2E con backend real T030 ni a aceptación humana. Continúa T030;
US2/US3, carreras restantes y puertas operativas conservan sus pendientes.
- [X] T030 [US1] Crear fixture navegador en `apps/web/tests/support/materials-fixture.ts`, configuración `apps/web/playwright.materials.config.ts` y E2E `apps/web/tests/e2e/materials-management.spec.ts`; preparar/publicar con docente/admin, acceso ajeno denegado, recuperación de formulario y teclado en escritorio/móvil. Tras T029.
- [X] T031 [US1] Verificar carreras y respuesta perdida con barreras en `apps/api/tests/integration/materials-upload-races.spec.ts`: dos completados, rollback, reinicio PENDING/COMPLETED, mismo nombre/grupos independientes y material previo intacto ante fallo inyectado; comprobar estado persistido. Tras T026.
- [X] T032 [US1] Probar revocación/cambio de rol/docente/cancelación durante recepción, limitación de intenciones y recursos en `apps/api/tests/integration/materials-upload-security.spec.ts`; registrar política técnica de cuota por actor en `specs/004-materiales-estudio/evidence/upload-limits.md` antes de aplicarla, sin cuota agregada de almacenamiento o purga. Tras T031; no declarar cuotas de login como protección suficiente de uploads.

T030–T032 verificadas: [E2E, carreras y seguridad](evidence/t030-t032.md).
E2E real 10/10 (escritorio/móvil, docente/admin); carreras 5/5, seguridad 17/17
y regresión API 994/994. Cuota técnica: 30 intenciones nuevas/actor/60 s, compartida
en PostgreSQL; replay antes de cuota, rollback no consume y sin purga. Índice
aditivo 0009; [política y ajuste por regresión](evidence/upload-limits.md).
Tipos y lint API/web aprobados. Continúa T033; no se acredita US2/US3 ni cierre
operativo, recuperación cifrada, capacidad o aceptación humana.
- [X] T033 [US1] Ejecutar pruebas US1, lint/build y regresión de transporte/sesión/oferta afectada; registrar comandos/resultados y preservación en `specs/004-materiales-estudio/evidence/us1-checkpoint.md`, sin afirmar descarga del alumno o aceptación humana. Tras T030–T032.
- [X] T034 [US1] Actualizar uso local de preparación/publicación y límites reales en `specs/004-materiales-estudio/quickstart.md` y `ops/local/architecture.md`; distinguir prototipo probado, pendiente de US2/US3 y puertas operativas, sin cambiar evidencia previa. Tras T033.

T033–T034 verificadas: [checkpoint US1](evidence/us1-checkpoint.md) y
[resultado estructurado](evidence/t033-t034-results.json). Regresión ampliada API
1629/1629 (63 archivos), web 526/526 (32 archivos), navegador 10/10 sin reintentos;
lint/tipos/builds aprobados. Preservación de 1054 archivos auditada; solo cambia
documentación. Proyecto aislado detenido conservando volumen. Continúa T035;
no se acredita descarga de alumno, US3, aceptación humana o cierre operativo.

## Fase 4 — US2: consultar y descargar (P1, T035–T047)

**Objetivo**: alumno matriculado obtiene solo publicaciones del grupo autorizado.
**Prueba independiente**: fixture publicado y matrículas vigentes/históricas/ajenas;
comparar bytes y límites exactos sin pasar por el flujo de pago o UI de US1.

- [X] T035 [P] [US2] Escribir pruebas de derecho temporal exacto en `apps/api/tests/integration/materials-enrollment.spec.ts`: confirmedAt ≤ at < validUntil a microsegundos, reserva/incidencia sin matrícula, grupo distinto del mismo curso, historial no reactivado y oferta/docente retirados; sin Date intermedio. Tras T016.
- [X] T036 [P] [US2] Escribir matriz HTTP/directa y contrato de descarga en `apps/api/tests/integration/materials-download.spec.ts`; 401/403/404 seguros, preparado/retirado invisibles, HEAD reautorizado sin bytea, Range 200 completo, sesión revocada y errores antes/después de headers. Tras T016.

T035/T036 escritas y ejecutadas: [pruebas previas US2](evidence/t035-t036.md).
Temporal: 17 casos (1 control aprobado/16 fallos por acceso alumno pendiente).
HTTP/transporte: 34 (4 controles aprobados/30 fallos por rutas/acceso pendientes).
Rojo válido: 51 casos, 5 aprobados/46 fallidos, cero omitidos; no equivale a US2
funcional. Controles existentes 837/837, tipos/lint/generate/build API aprobados.
Dos errores de fixture se corrigieron y sus informes se conservan separados.
Sin modificar código/pruebas anteriores, migraciones o datos manuales. Continúa T037;
T038–T042 deben implementar el comportamiento y resolver este rojo.

- [X] T037 [P] [US2] Escribir cliente/listado alumno en `apps/web/src/features/materials/student-page.test.tsx` y `apps/web/src/app/materials-client.test.ts`; vacío/error separados, longitud incompatible, cambio de cuenta, respuesta tardía y revocación de Blob URLs. Tras T016.
- [X] T038 [US2] Publicar puerto en `apps/api/src/modules/enrollment/public/materials-access.ts` y adaptador `apps/api/src/modules/enrollment/infrastructure/materials-participant.ts`: derecho mínimo y grupos propios vigentes en conexión/token compartidos, snapshots originales y tiempo exacto; sin pagos/órdenes expuestos ni cambios financieros. Tras T035.

T037/T038: [pruebas de alumno y participante](evidence/t037-t038.md). T037: 11
casos UI +17 cliente nuevos en rojo esperado, con 17 controles cliente previos
aprobados; resto web 509/509. T038: diez casos pasaron de rojo a verde sin cambiar
expectativas; token/conexión reales, límites exactos y finanzas preservadas.
Controles API 847/847; tipos/lint API/web y builds aprobados. T035/T036 intactas,
con rojo esperado 46/51 hasta T039–T042. Continúa T039; no se acredita pantalla,
descarga de alumno, aceptación humana o cierre operativo.

- [X] T039 [US2] Implementar consultas alumno y detalle en `apps/api/src/modules/materials/application/queries.ts` y `apps/api/src/modules/materials/infrastructure/material-queries.ts`; publicado+matrícula antes de proyección/conteo, DTO mínimo, vacío autorizado distinto de error y curso/grupo ocultos sin revocación implícita. Tras T038 y T015.
- [X] T040 [US2] Añadir envoltura binaria interna en `apps/api/src/http/binary-response.ts`, rama segura en `apps/api/src/modules/authorization/entrypoints/http/access.guard.ts` y manejo headersSent en `apps/api/src/http/error.filter.ts`; no JSON.stringify(Buffer), aceptar sesión antes de primer byte sin ampliar expiración absoluta, sin segundo cuerpo tras fallo. Tras T036.

T039/T040: [consultas y binario](evidence/t039-t040.md). T035 original 17/17,
consultas alumno 7/7, transporte binario interno 7/7; regresión API 1670/1670
en 67 archivos. Tipos/lint/generate/build API aprobados. T036 HTTP separada:
4 aprobados/30 fallos esperados, cero omitidos, incluido MD12 verde con log seguro.
Descubrimiento de matrícula no autoriza: vigencia exacta se decide tras locks,
sin dependencia docente/financiera. Continúa T041; no se acredita handler real
de descarga/HEAD, pantalla alumno, aceptación humana o cierre operativo.

- [X] T041 [US2] Implementar lectura autorizada en `apps/api/src/modules/materials/infrastructure/content-store.ts`: plaza antes de SELECT bytea, permiso/estado/matrícula bajo locks y token compartido; Buffer completo fuera de transacción para red, Content-Length/MIME/attachment/nosniff/no-store, no promesa de RAM constante. Tras T039–T040 y, si US1 se ejecutó, T022.
- [X] T042 [US2] Completar GET grupos/contexto/items/material/content y HEAD content en `apps/api/src/modules/materials/entrypoints/http/materials.controller.ts` y composición `apps/api/src/app.module.ts`; gestor descarga sin matrícula, alumno exige vigente, cancelado solo admin histórico, sin enlace público/redirect/304. Tras T041 y coordinación de archivo con T025 si US1 se ejecutó.

T041/T042: [descarga HTTP real](evidence/t041-t042.md). T036 original pasa 34/34
sin cambios; recursos 7/7 y política cerrada por audiencia verificadas. Regresión
API 1714/1714 en 69 archivos, tipos/lint/generate/build aprobados. Plaza antes de
bytea, sostenida durante respuesta lenta y liberada al terminar/cerrar; conexión
y locks SQL libres durante red. HEAD reautoriza sin leer bytes ni ocupar plaza
binaria; GET/HEAD respetan vigencia original exacta. Continúa T043; cliente/pantalla,
E2E alumno, aceptación humana y puertas operativas conservan sus pendientes.

- [X] T043 [US2] Implementar descarga binaria validada en `apps/web/src/features/materials/api.ts` y `apps/web/src/app/http.ts`: comprobar estado/longitud/generación, errores JSON seguros, no-store y abortos; crear Blob URL solo al éxito vigente y revocarla tras uso/logout/desmontaje, sin cache persistente. Tras T037 y T042; serializar edición de archivos con T027.
- [X] T044 [US2] Implementar `apps/web/src/features/materials/student-page.tsx`: contexto/listado/descarga, formato/tamaño/fecha, vacío/error/denegado y reintento manual perceptibles; teclado y móvil, sin datos de gestor/otros alumnos. Tras T043.

T043/T044: [cliente y pantalla alumno](evidence/t043-t044.md). Rojo inicial T037:
28 fallos/17 controles; focal posterior 45/45, mismas expectativas. Regresión web
final 587/587 en 35 archivos, incluidos 33 casos adicionales de seguridad/flujo.
Tipos completos/materiales, lint y build web aprobados. Chromium con API simulada:
ocho comprobaciones escritorio/móvil, teclado, bytes exactos y limpieza de URLs.
Sin nuevos enlaces/rutas de alumno aún: continúa T045 y después E2E real T046.

- [X] T045 [US2] Conectar alumno desde matrículas en `apps/web/src/app/materials-routes.tsx` y `apps/web/src/app/enrollment-routes.tsx`; URL directa, logout/cambio de cuenta y descarte de resultados antiguos, sin importar internamente otra feature. Tras T044; serializar edición con T029.
- [X] T046 [US2] Ejecutar E2E en `apps/web/tests/e2e/materials-student.spec.ts`: alumno propio/ajeno/histórico, comparación binaria, cambio de cuenta, retirada de oferta y teclado/escritorio/móvil; fixture permite probar US2 sin ejecutar US1. Tras T045; reutilizar soporte/config T030 o crearlo si US2 se ejecuta primero.
- [X] T047 [US2] Ejecutar MV01/MV02/MV07/MV10/MV11 y regresión de matrícula/sesión; registrar resultados/limitaciones y preservación en `specs/004-materiales-estudio/evidence/us2-checkpoint.md`, sin cerrar Izipay, 24 h reales o observación humana. Tras T046 y T035–T036 aprobadas.

T045–T047: [checkpoint US2](evidence/us2-checkpoint.md). Enlaces desde matrículas
vigentes, rutas por audiencia y ámbito por cuenta/grupo. Tres pruebas nuevas
primero fallan y luego pasan; web 590/590. E2E real completo 30/30 (20 alumno y
10 gestión), un worker, cero reintentos/omitidos. Un fixture editorial se corrigió
para respetar DRAFT→PUBLISHED→WITHDRAWN, sin cambiar producto o expectativas.
API ampliada con matrícula/sesión 1813/1813; tipos/lint/generate/build aprobados.
Continúa T048; no se acredita aceptación humana, D10/D13 o cierre de 001–003.

## Fase 5 — US3: corregir y retirar (P2, T048–T058)

**Objetivo**: corregir textos/retirar/republicar con revisión y atribución histórica.
**Prueba independiente**: fixture preparado/publicado/retirado, gestores actual y
anterior; verificar persistencia/permiso directamente, sin modificar oferta real.

- [X] T048 [P] [US3] Escribir transiciones/revisión/inmutabilidad en `apps/api/src/modules/materials/domain/transitions.test.ts`: editar no publica, retirar/republicar explícitos, NO_CHANGE con revisión válida, autor/grupo/archivo inmutables y restricciones de cancelado. Tras T016.
- [X] T049 [P] [US3] Escribir PG/HTTP de edición/retiro/replay en `apps/api/tests/integration/materials-commands.spec.ts`: versiones obsoletas, digest distinto, atribución del nuevo docente sin apropiación de autoría, denegación de anterior y rollback sin auditoría ficticia. Tras T016.
- [X] T050 [P] [US3] Escribir flujos UI de corrección/retiro en `apps/web/src/features/materials/material-actions.test.tsx`; conflicto compara sin sobrescribir, confirmaciones, intención estable en incertidumbre y archivo nuevo separado. Tras T016.
**Checkpoint T048–T050**: pruebas previas de US3 escritas y ejecutadas: 13
de dominio, 25 PostgreSQL/HTTP y 16 UI. Resultado final: 53 fallos esperados y
un control HTTP aprobado. Regresión API/materiales/arquitectura 323/323 y web
590/590, tipos/lint y generate/build API aprobados. [Evidencia](evidence/t048-t050.md).
El comportamiento sigue pendiente de T051–T054; no se acredita cierre de US3.

- [X] T051 [US3] Implementar transiciones puras en `apps/api/src/modules/materials/domain/transitions.ts` y servicios de edición/retiro/republicación en `apps/api/src/modules/materials/application/commands.ts`; sin cambiar archivo/grupo, revisión +1 solo en cambio efectivo y timestamps de transición según modelo. Tras T048 y T049; coordinar archivo con T023.
- [X] T052 [US3] Persistir comando/transición/auditoría en `apps/api/src/modules/materials/infrastructure/commands.ts` y `apps/api/src/modules/materials/infrastructure/audit.ts`: unique actor/commandId, digest incluye expectedRevision, appliedRevision/resultado/momento, replay autorizado con vista actual; exclusión concurrente y admin cancelado solo retiro. Tras T051.
- [X] T053 [US3] Exponer PATCH/withdraw y completar republicación en `apps/api/src/modules/materials/entrypoints/http/materials.controller.ts` y `apps/api/src/modules/materials/materials.module.ts`; campos cerrados, errores/versiones exactos y permisos actuales, sin endpoint de reemplazo o borrado físico. Tras T052; coordinar con T025/T042.
**Checkpoint T051–T053**: dominio/comandos/HTTP implementados; focal final
98/98 y E2E existente 30/30. La ampliada conserva 1851/1851 fuera del archivo
HTTP adicional; sus 14 casos pasan tras corregir aserciones al formato de campos
existente. Tipos/lint/generate/build API aprobados. [Resultados](evidence/t051-t053.md).
UI T054, barreras T055, E2E US3 T056 y auditoría ampliada T057 siguen pendientes.

- [X] T054 [US3] Implementar acciones UI y cliente en `apps/web/src/features/materials/material-actions.tsx`, `apps/web/src/features/materials/management-page.tsx` y `apps/web/src/features/materials/api.ts`; textos con límites exactos, retirar/republicar confirmados, conflicto visible, conservar entradas y guía para preparar material nuevo. Tras T050 y T053; reutilizar UI US1 o composición mínima de gestión si se prueba aparte.
- [X] T055 [US3] Verificar carreras con barreras en `apps/api/tests/integration/materials-command-races.spec.ts`: editar/publicar/retirar y permiso perdido antes del commit; consultas nuevas posteriores al retiro denegadas sin pretender recuperar bytes ya autorizados. Tras T053 y T041 para carrera con descarga.
- [X] T056 [US3] Ejecutar E2E corrección/retiro/republicación en `apps/web/tests/e2e/materials-actions.spec.ts`; nuevo docente gestiona sin cambiar autor, alumno pierde nuevas descargas, admin conserva histórico cancelado y sesión vieja no vuelve visible. Tras T054 y T044; fixture permite verificar transiciones backend sin UI de otras historias.
**Checkpoint T054–T056**: interfaz/cliente conectados, 16 pruebas de acciones
originales aprobadas; web 614/614, carreras 14/14 y E2E real 42/42 (12 US3 y
30 previos). Regresión API/materiales 388 casos aprobados y un timeout de lint
arquitectónico, después repetido aislado 7/7 sin cambiar reglas/plazo. Cobertura
compuesta 389 casos; tipos/lint y builds aprobados. [Evidencia](evidence/t054-t056.md).
Sigue T057; no se acredita checkpoint integral US3 ni observación humana.

- [X] T057 [US3] Comprobar ledger/auditoría sin secretos/bytes/textos completos y regresión financiera/oferta en `apps/api/tests/integration/materials-audit.spec.ts`; retiro no cancela matrícula ni resuelve incidencia, nuevo archivo no sustituye referencia previa. Tras T055.
- [X] T058 [US3] Ejecutar MV05/MV06/MV08 y registrar checkpoint/preservación en `specs/004-materiales-estudio/evidence/us3-checkpoint.md`, diferenciando pruebas automáticas de aceptación humana. Tras T056–T057.

## Fase 6 — Verificación transversal y cierre (T059–T068)

- [X] T059 Extender CI existente en `.github/workflows/v00-linux.yml` y scripts en `apps/web/package.json` para suites materiales/harness aislado; conservar cobertura 001–003 y documentar ejecución remota pendiente si no se observa. Tras T033/T047/T058.
- [X] T060 Ejecutar lint/build/unit/integración/E2E apropiados y matriz MV01–MV11 completa, revisar carreras/privacidad y comparar baseline; guardar comandos/resultados/versión y fallos en `specs/004-materiales-estudio/evidence/automated.md`. Tras T059; un pase local no acredita CI remoto o capacidad.
- [X] T061 Ampliar backup/manifestación y ensayo en `ops/recovery/rehearse-materials.ps1`, `ops/recovery/backup.ps1` y `ops/recovery/README.md`; pg_dump conjunto de metadatos/bytea/ledger/auditoría, hashes completos y destino separado, invalidación de sesión y actualización fallida sin asumir down migration reversible. Tras T060.
- [X] T062 Ejecutar upgrade desde 0007, reinicio y backup/restore cifrado en destino ficticio separado; comprobar bytes/hashes/grupo/autoría/estados/permisos y decisiones posteriores no recuperadas; registrar MV12 en `specs/004-materiales-estudio/evidence/recovery.md`. Tras T061; no respaldo/purga del entorno manual sin alcance explícito.
- [X] T063 Medir en entorno aislado RSS/copias/BD/WAL/disco/backup y transferencia al límite individual, fallos de espacio inyectados y cliente lento; registrar versión/configuración/volumen/plazas/errores/recursos en `specs/004-materiales-estudio/evidence/local-resources.md`, sin extrapolar a 2500 o aceptar D10. Tras T062.
- [X] T064 Preparar y realizar ensayo con gestor y alumno reales en `specs/004-materiales-estudio/evidence/human-acceptance.md`: consentimiento, publicar/listar/descargar/retirar, resultados/dificultades de teclado/computador/móvil por separado y sin nombres; mantener pendiente lo no observado, sin convertir T042/T083 de 003 en aceptación de materiales. Tras T060–T063 y disponibilidad real de participantes.
- [ ] T065 Incorporar materiales al procedimiento operativo en `specs/004-materiales-estudio/operation.md` y obtener acuerdos D13 de custodio/destino cifrado/retención/recuperación y espacio antes de demo persistente/publicación; sin purga, compra o despliegue implícitos. Tras T062–T063; pendiente hasta acuerdos/evidencia reales.
- [ ] T066 Incorporar volumen/tráfico de materiales al escenario D10 y sus criterios acordados en `specs/004-materiales-estudio/capacity.md`; medir desde generador separado hacia infraestructura autorizada y registrar mezcla/duración/latencia/errores/recursos/costo, distinguir 15 000 cuentas/2500 activos/solicitudes en vuelo. Tras T063 y rúbrica/infraestructura disponibles; no marcar completo por un smoke o solo redactar plan.
- [X] T067 Actualizar estado real/arquitectura/guía y restricciones en `specs/004-materiales-estudio/spec.md`, `specs/004-materiales-estudio/plan.md`, `specs/004-materiales-estudio/quickstart.md` y `ops/local/architecture.md`; enlazar evidencia sin reescribir su historia, conservar pendientes Izipay/24 h/001–003 y distinguir checkpoint local de cierre integral. Tras T060–T064; si T065/T066 pendientes, decirlo expresamente.
- [ ] T068 Revisar todos los FR/SC/escenarios, hashes y tareas con resultados reales en `specs/004-materiales-estudio/evidence/final-acceptance.md`; cerrar integralmente solo tras T001–T067, aceptación humana y puertas aplicables, sin usar generación de documentos como prueba funcional. D02/pendientes de otros specs se conservan con su alcance propio.

Preparación T065–T066 (2026-11-17): procedimiento O01–O12 y escenario C01–C10
redactados. El responsable confirmó que los acuerdos D13 y referencias D10 aún
no están disponibles y pidió conservarlos pendientes. Sin carga externa,
operación persistente o tareas adicionales marcadas: estado 63/68.

Preparación T067–T068 (2026-11-17): estado actual y arquitectura US1–US3
sincronizados sin reescribir registros originales; revisión de 20 FR, 7 SC y
19 escenarios con evidencia histórica y hashes. T067 depende de T064 y T068
requiere sus dependencias/aceptación integral: ambos checkboxes siguen pendientes.

**Cierre T064/T067 — 2026-11-17, America/Lima.** El responsable confirmó «ahora si funciona todos los recorridos», después de repetir el ensayo tras la corrección del PDF. T064 queda completada para el recorrido global de gestor y alumno en laptop, con consentimiento previamente comunicado. Es un resultado comunicado por el responsable, sin observación directa del agente ni desglose de cada paso, formato, ayuda o duración. Móvil no observado; SO, navegador y uso específico de puntero/teclado no informados. H-PDF-01 queda resuelta tras esta repetición humana. T067 completa la sincronización documental; D13/T065, D10/T066 y el cierre integral T068 permanecen pendientes. Avance **65/68**, tres pendientes. [Registro de cierre](evidence/t064-t067-report.md).

Los párrafos de preparación anteriores conservan el estado histórico previo al ensayo.

## Dependencias y oportunidades de paralelismo

Grafo de fases: Preparación → Fundamentos → {US1, US2, US3} → Integración →
Restore/recursos → {Humana, D13, D10} → Cierre integral.

Orden recomendado: T001–T004 → T005–T016 → T017–T034 → T035–T047 → T048–T058 →
T059–T068. La independencia funcional se prueba con fixtures: no todas las historias
deben desarrollarse simultáneamente. SQL/contratos comunes son previos; archivos
compartidos controller/commands/api/rutas se integran secuencialmente. US2 puede
construir su content-store desde el contrato sin ejecutar carga US1. US3 reutiliza
la publicación común y se verifica con fixtures; validación UI final depende de UI
gestor/alumno señalada en cada tarea. No hay falsa independencia en los checkpoints.

Ejemplos permitidos tras sus prerrequisitos, sin lanzar agentes automáticamente:

| Historia | Archivos independientes | Unión posterior |
| --- | --- | --- |
| US1 | T017 (reglas), T018 (HTTP), T019 (UI), tras T016 | T020/T021 y T027 se integran después de sus pruebas. |
| US2 | T035 (tiempo), T036 (HTTP), T037 (cliente), tras T016 | T038/T040/T043 respetan sus dependencias. |
| US3 | T048 (transiciones), T049 (PG/HTTP), T050 (UI), tras T016 | T051 y T054 requieren pruebas y composición respectivas. |

T003 y T004 también admiten preparación simultánea tras T002, sin editar archivos
comunes. Marcadores [P]: 11; no describen ejecución realizada.

## Estrategia de implementación y alcance MVP

Primer bloque: T001–T004, preservación/entorno/matriz/corpus. Después fundamentos
y US1 como primera entrega de gestión verificable. MVP útil para estudio requiere
US1+US2; US1 sola no acredita acceso del alumno. US3 completa mantenimiento.
Validar cada checkpoint antes del bloque siguiente; no demo persistente o publicación
sin recuperación y D13. Capacidad y humanos conservan pendientes por evidencia real.

Distribución: preparación 4, fundamentos 12, US1 18, US2 13, US3 11, cierre 10;
total 68, 65 completadas y 3 pendientes. Los bloques ejecutados incluyen US1–US3,
sus checkpoints automáticos, integración de CI y verificación transversal; no autorizan aplicar
migraciones al entorno manual ni publicar servicios. La verificación transversal y el ensayo
de recuperación y los recursos locales están registrados; aceptación humana en laptop comunicada, modalidades sin observar y puertas operativas explícitas.

## Cobertura para análisis

| Requisito/criterio | Tareas principales | Familia de validación |
| --- | --- | --- |
| FR-001 | T007, T011, T020, T022, T031 | MV01, MV02 |
| FR-002 | T009–T012, T025, T032, T042, T052 | MV02, MV06 |
| FR-003 | T005, T007, T017, T020–T022, T028 | MV01, MV03 |
| FR-004 | T004, T017, T020, T024 | MV01, MV03 |
| FR-005 | T006–T007, T022, T024, T031, T063 | MV03, MV09 |
| FR-006 | T023, T028, T048, T051–T054 | MV01, MV08 |
| FR-007 | T035–T039, T042, T046 | MV02, MV07 |
| FR-008 | T009–T012, T032, T036, T040–T043 | MV02, MV06, MV10 |
| FR-009 | T035, T038–T039, T046 | MV07 |
| FR-010 | T014–T015, T025, T039, T042, T044 | MV02, MV10 |
| FR-011 | T048–T056 | MV05, MV08 |
| FR-012 | T006–T007, T022, T049, T051, T057 | MV05, MV08 |
| FR-013 | T021–T023, T031, T049, T052 | MV04, MV05 |
| FR-014 | T009, T012, T031–T032, T049, T055 | MV05, MV06 |
| FR-015 | T019, T027–T030, T037, T043–T044, T050, T054 | MV04, MV11 |
| FR-016 | T027–T030, T037, T043–T046, T056, T064 | MV11, MV13 |
| FR-017 | T014, T022–T023, T052, T057, T062 | MV05, MV10, MV12 |
| FR-018 | T006–T007, T031, T061–T063 | MV09, MV12 |
| FR-019 | T001–T002, T016, T033, T047, T057–T060, T067 | MV07, MV10, MV12 |
| FR-020 | T002–T004, T008, T061–T066 | MV12, MV13 |
| SC-001 | T017–T034, T041–T047 | MV01 |
| SC-002 | T009–T016, T032, T035–T047, T055, T057, T060 | MV02, MV06, MV10 |
| SC-003 | T004, T006–T007, T017, T020, T024, T031, T063 | MV03, MV09 |
| SC-004 | T019, T021–T023, T031, T049–T055 | MV04, MV05 |
| SC-005 | T035–T047, T051–T056 | MV07, MV08 |
| SC-006 | T061–T063, T065, T068 | MV12 |
| SC-007 | T030, T037, T046, T050, T056, T064 | MV11, MV13 |
