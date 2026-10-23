# Tasks: oferta académica

**Rama**: `feat/002-oferta-academica`. **Fecha**: 2026-10-19.
**Estado**: T001–T031 y T034 completas. Checkpoint de fundamentos T018 aprobado el
2026-10-20 con integración API completa y puertas T005/T006/T012/T017 verdes.
T019/T020 verificadas con reglas reales de T023 y aserciones completas en UTC y
America/Lima; 150 casos únicos, 300 ejecuciones dirigidas finales aprobadas. T021
verificada con las diez rutas reales de T026; 74/74 casos HTTP aprobados. T027 cliente
y contratos verificados. T028/T029 verificadas; T022 cierra con sus 19 casos originales
en escritorio y móvil, sin modificar sus expectativas. T030 verifica US1 completa en
su alcance de preparación. T031/T034 verificadas con implementación real de T036.
T032/T033/T035 pendientes de HTTP/catálogo/UI. T036 implementada y verificada en
dominio/persistencia, pendiente del criterio integrado T032 verde en T038.
T037–T074 sin iniciar.
Hallazgo histórico de bootstrap abierto.
T005/T006 pasaron sus 42 pruebas originales tras implementar T007/T008.
Se conservan las cinco aclaraciones. Evidencia: [inventario](evidence/baseline.md) y
[entorno y harness](evidence/environment.md), [rojo T005/T006](evidence/t005-t006.md) y
[modelo y migración T007/T008](evidence/t007-t008.md) e
[interfaces y contratos T009/T010](evidence/t009-t010.md) y
[permisos y pruebas de protocolo T011/T012](evidence/t011-t012.md) y
[implementación del protocolo T013](evidence/t013.md) y
[escritor atómico y cierre T012–T014](evidence/t014.md) y
[errores, composición y arquitectura T015–T017](evidence/t015-t017.md) y
[checkpoint de fundamentos T018](evidence/foundations.md) y
[pruebas UNIT T019/T020](evidence/t019-t020.md) y
[pruebas PG/HTTP y E2E T021/T022](evidence/t021-t022.md) y
[reglas puras y cierre T019/T020/T023](evidence/t023.md) y
[comandos y consultas T024/T025](evidence/t024-t025.md) y
[rutas y cliente T026/T027](evidence/t026-t027.md) e
[interfaz, navegación y cierre T022/T028/T029](evidence/t028-t029.md),
[checkpoint US1 T030](evidence/us1.md) y
[pruebas de visibilidad/publicación T031/T032](evidence/t031-t032.md) y
[pruebas de catálogo, carreras y recorridos T033–T035](evidence/t033-t035.md) y
[publicación real, visibilidad y avance T036](evidence/t036.md).
**Input**: [spec](spec.md), [plan](plan.md), [investigación](research.md),
[modelo](data-model.md), [API](contracts/api.md), [integración](contracts/integration.md),
[UI](contracts/ui.md), [guía local](quickstart.md) y constitución 1.1.0.

La instrucción de generar tareas sucede a las etapas históricas descritas en spec/plan;
no cambia su negocio. Después de escribir y ejecutar T005/T006 en rojo, se autorizó
T007/T008 para implementar/verificar modelo y migración aditiva, y después únicamente
T009/T010 para interfaces y contratos, y T011/T012 para permisos/pruebas. El bloque
actual autoriza únicamente T036; se detiene antes de T037.
Las demás tareas siguen siendo destinos futuros;
este cierre no acredita funcionalidad académica.

## Formato y convenciones

- Cada checkbox representa trabajo futuro con ruta y condición de terminación.
- `[P]` permite trabajar solo con las tareas del mismo lote indicado al final, una vez
  satisfechas sus dependencias; no permite modificar archivos compartidos simultáneamente.
- `[US1]`–`[US4]` corresponden a las cuatro historias de la especificación.
- UNIT = reglas puras; PG/HTTP = integración real PostgreSQL y autorización; E2E = navegador.
  Escribir pruebas antes de su implementación, observar el fallo relevante y registrar
  el resultado final; compilar no sustituye las comprobaciones de comportamiento.
- Un checkpoint automatizado no cierra aceptación humana. Todos los informes futuros
  indican revisión/fuente pendiente, comandos, códigos de salida, fallos, omisiones y límites.
- Las restricciones literales del anexo forman parte de T007–T010 y T023–T024;
  no quedan a criterio de quien implemente. No agregar longitudes, nombres únicos ni reglas.

## Fase 1: preparación compartida (T001–T004)

Objetivo: preparar una ejecución reproducible sin tocar la instalación manual.

- [X] T001 Registrar inventario inicial en `specs/002-oferta-academica/evidence/baseline.md`: rama, diff, huellas de nueve documentos previos y primer spec, versiones y pendientes; comprobar que configuración, quince cuentas y evidencia manual se conservarán sin copiar secretos al informe. Termina con fuente reproducible e inventario sin datos privados (FR-016).
- [X] T002 Preparar copia de trabajo y proyecto Compose exclusivos siguiendo `specs/002-oferta-academica/quickstart.md`; documentar destino y guardas en `specs/002-oferta-academica/evidence/environment.md`. Incluir fuente pendiente, no solo HEAD; generar configuración solo si no existe, verificar puertos/esquemas propios y detener ante destino ambiguo. No reset, db push, purgas, bootstrap manual ni down -v (FR-016).
- [X] T003 Crear soporte de fixtures académicas en `apps/api/tests/support/academic-offering.ts` sobre identityDatabase, test-environment y locks existentes; crear cuentas ficticias por mecanismos de identidad, esquemas únicos y conexión observadora separada. Termina con aislamiento verificado y limpieza limitada al esquema de esta suite (FR-010/016).
- [X] T004 Crear `apps/web/tests/support/academic-offering-fixture.ts` y `apps/web/playwright.academic-offering.config.ts` siguiendo fixtures de identidad: API real, origen loopback, esquemas aislados, móvil/escritorio y teclado. Verificar arranque/cierre sin usar PLAYWRIGHT_BASE_URL manual ni añadir servicios o paquetes (FR-014/016).

## Fase 2: fundamentos obligatorios (T005–T018)

Depende de T001–T004. No habilitar historias hasta completar esta fase. Las pruebas de
fundamentos son comunes; la lógica de publicación y consulta se entrega en las historias.

- [X] T005 [P] Escribir PG de migración nueva/incremental en `apps/api/tests/integration/academic-offering-migration.spec.ts`: aplicar 0001–0004 a fixtures, luego nueva migración; comparar cuentas, hashes, authVersion, sesiones, tokens, auditoría y SystemState, salvo columna default 0; comprobar runtime sin DDL, vista/trigger en esquema no public y rechazos por restricciones (FR-016; V-A11).
- [X] T006 [P] Escribir PG de generación en `apps/api/tests/integration/academic-offering-eligibility.spec.ts`: pérdida de rol/estado/verificación incrementa una vez, recuperación/nombre/reset/no-op no incrementan, UPDATE no sustituye generación, overflow aborta y rollback conserva acceso/auditoría juntos (FR-012/016; V-A06).

Historial T005/T006, 2026-10-19: inicialmente 42 casos ejecutados, un control aprobado y
41 fallos de aserción por objetos ausentes. Tras T007/T008, los 42 pasan sin modificar
sus expectativas; se ejercieron también las ramas antes inaccesibles. Se agregaron seis
comprobaciones SQL del nuevo esquema y pasaron. Los informes en rojo se conservan como
históricos; el cierre actualizado está en la evidencia T007/T008. E1 se conserva.

- [X] T007 Describir las cinco entidades académicas y `User.teacherEligibilityVersion` en `apps/api/prisma/schema.prisma`, aplicando literalmente las restricciones del anexo. Termina con relaciones RESTRICT, nulabilidad/enums y bigint coherentes con data-model, sin Occupancy, Enrollment ni datos académicos iniciales (FR-002/005/015/016).
- [X] T008 Preparar y revisar `apps/api/prisma/migrations/0005_academic_offering/migration.sql` después de comprobar numeración real: aditiva, checks/índices, pertenencia inmutable y trigger de estados, snapshot emparejado, generación y vista AcademicTeacherDirectory en esquema configurado. Aplicar solo en destino T002/T005; probar SQL personalizado y generación Prisma con scripts existentes. No modificar migraciones aplicadas ni conceder DDL/CREATEDB al runtime; sombra exclusiva si se usa create-only (FR-002/005/008/012/015/016).
- [X] T009 Publicar tipos mínimos en `apps/api/src/modules/users/public/teaching-directory.ts` y adaptador en `apps/api/src/modules/users/infrastructure/teaching-directory.ts`: userId/name/eligible/eligibilityVersion; selector solo elegibles. Termina sin UserView/email, pool nuevo, preview Prisma ni tipos pg en contrato público (FR-011/012).
- [X] T010 Crear contratos puros en `apps/api/src/modules/academic-offering/public/offer.ts`, `application/offering-store.ts` y `domain/offering-error.ts`; cerrar DTO por audiencia, errores y tipos conforme al API y anexo. Termina sin Nest/pg en núcleo ni generación docente expuesta al cliente (FR-002/010/011/013).
- [X] T011 Extender `apps/api/src/modules/authorization/domain/permissions.ts` y su `permissions.test.ts` con academic:manage ADMIN, academic:read-published ADMIN/STUDENT y academic:read-own TEACHER; mantener los permisos de identidad y denegación por defecto. Termina con todas las combinaciones unitarias aprobadas (FR-010/016).
- [X] T012 Escribir PG del protocolo en `apps/api/tests/integration/academic-offering-transaction.spec.ts`: locks User ordenados → Session → Course → Group; redescubrimiento por cambio de conjunto, tres intentos totales compartidos, rollback fallido y COMMIT ambiguo sin replay automático. Antes de T014, probar también el contrato del ledger/auditoría con agregados ficticios: reautorización antes de replay, unicidad actor/commandId, hash distinto rechazado, proyección actual/revisión original y fallo de auditoría revierte ledger/agregado. Termina con barreras observadas desde tercera conexión y aserciones persistidas; T045/T052 ampliarán estos casos a comandos HTTP completos (FR-015/016).
- [X] T013 Implementar `apps/api/src/infrastructure/database/account-locks.ts` y `academic-transaction.ts` reutilizando accountTransaction una sola vez; descubrir dentro de cada intento, revalidar sesión existente, abortar antes de adquirir User nuevos tras padre, consultar conflictos en sentencia posterior. Sin SystemState, locks de grupos ajenos ni bucle exterior; T012 verde y semántica de identidad intacta (FR-004/010/015).
- [X] T014 Implementar ledger canónico y escritor atómico en `apps/api/src/modules/academic-offering/infrastructure/offering-store.ts` y `offering-audit.ts`: PK actor/commandId, digest incluye operación/destino/expectedRevision, reautorizar antes de replay, proyección actual con appliedRevision original, sin nuevo efecto/auditoría; fallo revierte todo, sin purga. Termina con T012 verde e interfaces listas para comandos de historias (FR-015).
- [X] T015 Extender allowlists en `apps/api/src/http/error.filter.ts` y `apps/api/src/infrastructure/logging/security-events.ts`: códigos/campos de api.md, conflictingGroupIds solo en los dos 409 administrativos, targets COURSE/GROUP y requestId separado de commandId. Termina sin serialización genérica, SQL, motivos, cuerpos, emails ni USER_REFERENCE ficticio (FR-011/013/015).
- [X] T016 Preparar ensamblaje en `apps/api/src/modules/academic-offering/academic-offering.module.ts` y `apps/api/src/app.module.ts`; inyectar pool único, directorio y revalidateInTransaction existente por capacidades estructurales. Termina con composición compilable, sin callbacks identidad→oferta ni cambios a SessionRepository (FR-010/016).
- [X] T017 Ampliar `apps/api/tests/architecture/endpoint-policies.spec.ts`, `layers.spec.ts` e `import-boundaries.spec.ts` para módulo/superficies nuevos y mantener reglas de `ops/lint/import-boundaries.mjs`. Termina con núcleo puro y ningún controlador sin ACCESS_POLICY; repetir al agregar rutas (FR-010/016).
- [X] T018 Ejecutar checkpoint de fundamentos y registrar `specs/002-oferta-academica/evidence/foundations.md`: T005/T006/T012/T017 aprobadas, migración nueva/incremental y regresión PG de acceso, sesiones, reset y bootstrap sin alteración. Registrar hallazgo bootstrap heredado aunque una ejecución pase; no habilitar historias con una regresión (FR-016; V-A11/A12).

Historial T011/T012 antes de T013, 2026-10-19: T011 completa; matriz unitaria 24/24 y PG de permisos
13/13, con regresión de identidad 33/33. T012 contiene 33 casos descubiertos/ejecutados:
seis controles PG/helper existente aprobados y 27 fallos esperados de precondición por
capacidades académicas T013/T014 ausentes (12 y 15). Las aserciones posteriores de esos
27 casos aún no se alcanzaron; no son imports fallidos ni pruebas de comportamiento
aprobadas. T012 sigue sin marcar: exige barreras y estado persistido del protocolo real,
no solo escribir pruebas rojas. B01 sí observó la barrera de PK desde tercera conexión;
no acredita los locks del adaptador académico. E1 y sus líneas T012/T014 se conservan.

Historial T013 antes de T014, 2026-10-19: implementación real conectada sin modificar T012 ni su soporte.
Los 12 casos P01–P08 ahora pasan, con barreras y aserciones persistidas; B01–B06 pasan
por separado como controles. Quedan 15 fallos de precondición L01–L11 exclusivamente
por T014 ausente. Ocho comprobaciones PG adicionales del protocolo pasan; guard de
padre omitido corregido en producción, sin debilitar expectativas. Regresión de identidad
seleccionada: 56/56; unitarias/arquitectura finales: 101 casos únicos aprobados por archivo.
T012 no se cierra. T013 conserva su checkbox pendiente por el criterio literal «T012
verde», aunque su implementación y verificaciones propias están aprobadas; el cierre
conjunto requiere T014. No se cambia ese criterio ni se implementa ledger/auditoría.

Cierre T012/T013/T014, 2026-10-20: avance T013 guardado en commit local 1892805 con
sus marcas aún pendientes; después se implementó el escritor real y la auditoría.
Los quince L01–L11 ahora alcanzan sus aserciones y pasan. T012 completa 33/33 sin
omitidos: 12 protocolo + 15 escritor + 6 controles auxiliares separados. T013 completa
8/8 propios y su puerta T012 verde; regresión afectada 56/56. T014 completa con siete
PG adicionales (restricción SQL de auditoría, revisión obsoleta, presupuesto compartido,
canonicalización, permiso, UUID de alta y bigint de grupo); interfaces listas para
adaptadores posteriores, sin rutas. Unitarias/arquitectura 101/101 en una ejecución;
se conserva el timeout anterior y su repetición aprobada en evidencia T013. No reaparece,
sin ampliar límites o debilitar expectativas. Tipos, lint y build aprobados. Cinco
aclaraciones/E1 intactas, sin cambiar criterios, migraciones o datos manuales. Detenido
antes de T015; checkpoint de fundamentos T018 y aceptación funcional siguen pendientes.

Cierre T015/T016/T017, 2026-10-20: bloque T014 guardado en commit local dfd7bf0 con
sus marcas justificadas. T015 completa con catálogo/allowlists y 25 pruebas de errores/logs;
se corrigió una combinación de código académico/destino de identidad aceptada indebidamente,
con rojo conservado y repetición aprobada. T016 completa con módulo de capacidades reales,
pool/sesiones compartidos y tres pruebas Nest/PG/HTTP; sin rutas de producto o fachada ficticia.
T017 completa con tres suites ampliadas: 14 casos de arquitectura, dentro de 106 unitarias/
arquitectura aprobadas. Privacidad/HTTP/auditoría/retención 109/109; protocolo/escritor 48/48
(seis controles auxiliares y un control de hook identificados); regresión afectada 56/56.
Tipos, lint y compilación aprobados, cero omisiones finales. 347 casos únicos sin sumar
repeticiones. Criterios, cinco aclaraciones, E1 y fuentes T014 intactos; entorno manual
preservado. Sin bloqueos conocidos de estas tres tareas; detenerse antes de T018 y ejecutar
su checkpoint completo en el siguiente bloque. No se acredita funcionalidad o capacidad.

Cierre T018, 2026-10-20: checkpoint aprobado sobre base limpia 461bba9. T005 24/24,
T006 18/18, T012 33/33 y T017 14/14 verdes; integración API completa 896/896 en 52
archivos y unitarias/arquitectura 106/106 en 16 archivos, cero fallos/omitidos finales.
Se corrigieron solo listas explícitas de limpieza de cinco suites tras observar 0A000
por las FK nuevas; aserciones, CLI, parser y timeouts intactos. Primer lote amplio
895/896 por API local ausente; repetido completo con main real compilado y preflight
ready/live 200, sin cambiar esa prueba. Ambos informes iniciales conservados, sin
contarlos como aprobación funcional. Acceso 30/30, sesiones 35/35, reset 49/49 y
bootstrap 42/42 dentro del lote; ocho pares del diagnóstico pasan sin confirmar la
causa de la intermitencia heredada, que sigue abierta. Compilación/tipos API y lint
aprobados; 72 archivos protegidos y 19 fuentes anteriores idénticos, entorno manual
intacto. No hay regresión actual pendiente; no se inicia T019 ni se acepta funcionalidad.

## Fase 3: US1 — Preparar cursos y grupos (P1, T019–T030)

Cierre T022/T028/T029, 2026-10-21: pantallas de preparación, selector docente,
validaciones, horarios y rutas administrativas reales. T022 original se conserva
íntegra: 19 casos únicos en dos perfiles, 38 ejecuciones aprobadas con aserciones
posteriores. Once casos funcionales nuevos aportan 22 ejecuciones; dos controles
auxiliares completan 62/62. Unitarias web 141/141; API/reglas/arquitectura 266/266;
HTTP/PostgreSQL 74/74; regresión E2E login/perfil/cuentas 49/49. Tipos, lint y builds
aprobados. Setenta y dos archivos protegidos y 46 fuentes previas sin cambios;
volúmenes conservados y ambos entornos detenidos, sin SQL manual. T022/T028/T029
completas; T030 sigue pendiente. Bootstrap abierto, E1 y PA-01–PA-05 conservados.
Evidencia y límites en [t028-t029.md](evidence/t028-t029.md).

Avance acotado T019/T020, 2026-10-20: 150 casos UNIT independientes (20 curso,
39 grupo, 91 horario), descubiertos y ejecutados en UTC y America/Lima. Los 150
fallan en su propia precondición por capacidades de T023 ausentes; cero omitidos,
errores de carga o títulos duplicados en los informes finales. Aserciones de negocio
escritas pero aún no alcanzadas; no equivalen a reglas verificadas. Se conservan ambos
checkboxes pendientes, sin cambiar sus descripciones. El comando unitario completo
conserva 106 pruebas existentes verdes, incluidas 14 de arquitectura; tipos/lint/build
aprobados. E1, cinco aclaraciones y checkpoint T018 conservados. Véase la
[evidencia y dependencia de T023](evidence/t019-t020.md). No se inicia T021.

Avance acotado T021/T022, 2026-10-20: pruebas contra AppModule, PostgreSQL, Vite y
Chromium reales del entorno aislado, con fixtures T004 y sin rutas/datos de producto
simulados. T019/T020 permanecen pendientes de T023. T021/T022 conservan sus marcas
pendientes hasta alcanzar las aserciones de comportamiento de T024–T029; escribir y
ejecutar pruebas rojas no acredita los recorridos. Resultados y casos únicos separados
de las repeticiones móvil/escritorio en [evidencia del bloque](evidence/t021-t022.md).
Las descripciones originales, cinco aclaraciones, E1 y hallazgo de bootstrap se conservan.

Cierre T023, 2026-10-21: dominio puro de cursos/grupos/horarios, edición solo en
preparación, capacidad omitida versus configuración inválida y calendario civil con
coincidencia semanal exacta sin Date ni expansión de clases. T019 59/59 y T020 91/91
alcanzan sus aserciones completas, sin modificar pruebas ni enlace de conformidad;
150 únicos en UTC y America/Lima (300 ejecuciones dirigidas finales). Regresión API
final 266/266: los mismos 150, diez comprobaciones adicionales y 106 existentes,
incluidas 14 de arquitectura. Tipos/lint/build aprobados; sin PG/E2E nuevos ni rutas.
T019, T020 y T023 completas; T021/T022 siguen pendientes de T024–T029.
Evidencia, corrección de validación de array disperso, repeticiones históricas y
conservación en [t023.md](evidence/t023.md). Bootstrap continúa abierto; sin aceptación
funcional integrada ni capacidad concurrente acreditada. Detenido antes de T024.

Cierre T024/T025, 2026-10-21: comandos de preparación y consultas administrativas
conectados a PostgreSQL y a la composición real, sin rutas nuevas. 58/58 casos de
capas (43 comandos/composición y 15 consultas); regresión PG/identidad 105/105 y
UNIT/arquitectura 266/266; tipos/lint/build aprobados. T024/T025 completas; las aserciones
aplicables de T021 se comprobaron en comandos/consultas reales, sin sustituir HTTP.
T021 original conserva 6 controles aprobados y 68 casos bloqueados por rutas T026;
T021/T022 siguen pendientes de sus criterios integrados. Evidencia y limitaciones en
[t024-t025.md](evidence/t024-t025.md). E1/cinco aclaraciones intactas, bootstrap abierto,
archivos y entorno manual conservados. Detenido antes de T026.

Cierre T026/T027, 2026-10-21: diez rutas administrativas reales, política academic:manage,
JSON/query estrictos y cliente web de preparación con DTO cerrados, UUID por intención,
revisión decimal y reintento solo manual. T021 74/74, capas 58/58, regresión PG/identidad
105/105, UNIT API/arquitectura 266/266 y UNIT web 100/100; tipos/lint/build aprobados.
T021/T026/T027 completas. T022 sigue pendiente de pantallas T028/navegación T029 y sus
criterios E2E; no se atribuye aceptación de recorrido ni humana. Evidencia, correcciones
y conservación en [t026-t027.md](evidence/t026-t027.md). E1/cinco aclaraciones intactas,
bootstrap abierto y entorno manual conservado. Detenido antes de T028.

Objetivo: administrador crea un curso y dos grupos independientes y los recupera tras
recargar, todavía en preparación. Prueba independiente: seis escenarios US1 con fixtures
vacías, capacidad 1/50 y franjas contiguas; sin depender de publicación o matrícula.

- [X] T019 [P] [US1] Escribir UNIT en `apps/api/src/modules/academic-offering/domain/course.test.ts` y `group.test.ts`: campos independientes, referencias estables, recorte, borrador incompleto versus capacidad enviada null/vacía/0/fracción/51; 1 y 50 válidos y edición solo en preparación (FR-001/002/005; V-A01/A03).
- [X] T020 [P] [US1] Escribir UNIT en `apps/api/src/modules/academic-offering/domain/schedule.test.ts`: fecha real inclusiva, día ISO, America/Lima, 00:00/23:59, duplicados, adyacencia, medianoche, fin igual/invertido, fecha efectiva común y franjas sin ocurrencia. Verificar fórmula sin expandir clases ni depender de zona del host (FR-003/004; V-A02).
- [X] T021 [P] [US1] Escribir PG/HTTP en `apps/api/tests/integration/academic-offering-preparation.spec.ts`: altas/lecturas/PATCH/PUT de API, dos grupos independientes, pertenencia inmutable, campos desconocidos, cuerpo 16 KiB, revision y persistencia; validar 401/403 para cada ruta y cero efectos en fallo (FR-001/002/003/005/010/015).
- [X] T022 [P] [US1] Escribir E2E en `apps/web/tests/e2e/academic-offering-preparation.spec.ts`: seis escenarios US1, listado vacío versus fallo, cancelar sin guardar, entradas conservadas y recarga; ejecutar móvil/escritorio y teclado con fixtures T004 (FR-001/013/014; SC-005).
- [X] T023 [US1] Implementar reglas en `apps/api/src/modules/academic-offering/domain/course.ts`, `group.ts` y `schedule.ts` según anexo y PA-04/05; fecha civil, comparación exacta de ocurrencias y no expansión a Clase. Termina con T019/T020 verdes y nulabilidad inicial diferenciada de valor configurado inválido (FR-002–005).
- [X] T024 [US1] Implementar altas/ediciones/reemplazo de franjas en `apps/api/src/modules/academic-offering/application/commands.ts` y `infrastructure/offering-store.ts`: protocolo T013/T014, padre bloqueado, revision propia, snapshot preservado y horario completo revalidado al cambiar periodo. Termina con escrituras atómicas y T021 verde en comandos (FR-001–005/015).
- [X] T025 [US1] Implementar lecturas administrativas paginadas en `apps/api/src/modules/academic-offering/application/queries.ts` y `infrastructure/offering-queries.ts`: búsqueda/estado/página permitidos, orden name/id, conteo coherente sin N+1; vista mínima docente. Termina con detalles/listados cerrados, no confundir fallo con vacío (FR-001/010/011/013).
- [X] T026 [US1] Exponer administración y selector en `apps/api/src/modules/academic-offering/entrypoints/http/admin.controller.ts`: rutas de preparación y teachers de api.md, ACCESS_POLICY, JSON estricto, 201/200, errores seguros y revalidación transaccional. Termina con T021 y políticas T017 verdes; ninguna ruta de escritura abierta (FR-001/010/012/013).
- [X] T027 [US1] Extender `apps/web/src/shared/api-client.ts`, `apps/web/src/app/http.ts`, `http.test.ts` y crear `apps/web/src/features/academic-offering/api.ts` con `api.test.ts`: queries por ruta, DTO cerrados, errores tipados, UUID por intención y revision decimal; replay idéntico manual, cambios con ID nuevo, sin storage ni nuevas cabeceras. Termina con rechazo de DTO inesperado y sin retry tras login (FR-011/013/015).
- [X] T028 [US1] Crear `apps/web/src/features/academic-offering/admin-courses-page.tsx`, `admin-course-page.tsx`, `admin-group-page.tsx`, `course-form.tsx`, `group-form.tsx`, `schedule-editor.tsx` y `offering-state.tsx`: preparación y selector, «Sin configurar», validaciones textuales, cancelación, espera/error/éxito y foco. Termina con T022 verde tras T029 (FR-001–005/013/014).
- [X] T029 [US1] Integrar rutas administrativas y política de rutas académicas en `apps/web/src/app/App.tsx`, `router.tsx`, `protected-route.tsx` y `apps/web/src/features/profile/home-page.tsx`; conservar perfil/logout/cuentas, incluir isProtectedPath y limpieza ante pérdida de sesión. Termina con acceso directo denegado y navegación por teclado (FR-010/014/016).
- [X] T030 [US1] Ejecutar checkpoint y registrar `specs/002-oferta-academica/evidence/us1.md`: T019–T022, arquitectura y persistencia tras recarga; dos grupos sin cambios cruzados, todos los casos US1 y notas de revisión. Primer incremento demostrable de preparación, sin afirmar SC-001 completo antes de US3 ni aceptación humana (FR-001–005/013–016).

## Fase 4: US2 — Publicar y comparar oferta (P1, T031–T042)

Checkpoint T030 y avance T031/T032, 2026-10-22: US1 aprobó nuevamente 266/266
API (150 reglas T019/T020 y 14 arquitectura), 74/74 HTTP/PostgreSQL, 141/141 web y
62/62 ejecuciones de navegador (30 casos funcionales únicos en dos perfiles + dos
controles). T030 completa; persistencia tras recarga y dos grupos independientes
comprobados. T031 agrega 42 casos únicos, ejecutados en America/Lima y UTC (84):
fallos esperados independientes por reglas puras ausentes, sin error de colección.
T032 ejecuta 58 casos únicos: 2 controles y 3 proyecciones existentes aprobados,
53 fallos esperados por rutas publish ausentes; aserciones posteriores aún no alcanzadas.
T031/T032 permanecen pendientes de verificación con T036/T038; pruebas escritas y
ejecutadas no equivalen a publicación aprobada. Tipos/lint/builds aprobados; arquitectura
final 14/14 tras corregir dist antiguo en el runner privado, sin debilitar pruebas.
PA-01–PA-05 y E1 conservados. Bootstrap histórico abierto. Evidencia en
[US1](evidence/us1.md) y [T031/T032](evidence/t031-t032.md). No se inicia T033.

Avance T033/T034/T035, 2026-10-22: pruebas de catálogo HTTP/PG, publicaciones
concurrentes con observador independiente y seis escenarios US2 en móvil/escritorio.
La regresión seleccionada aprobó 121/121 (arquitectura 14, preparación HTTP 74 y
protocolo T012 33). T033 ejecuta 44 casos: dos controles aprobados, 42 fallos esperados
por rutas ausentes tras corregir el SQL del fixture; su ejecución inicial inválida se
conserva como incidencia. T034 prepara 16 casos: dos controles PostgreSQL y 14 del
publicador ausente. T035 ejecuta diez casos funcionales en ambos perfiles (20) y dos
controles de harness. Las aserciones de negocio posteriores a los gates siguen
pendientes; T033/T034/T035 no se marcan completas. Se corrigen cuatro nombres de
operación en T032 conforme a enums existentes y se repite su suite, sin cambiar reglas.
PA-01–PA-05, E1 y bootstrap abierto conservados. Resultados finales por caso y
conservación en [t033-t035.md](evidence/t033-t035.md). Detenido antes de T036.

Avance T036 y cierre T031/T034, 2026-10-23: visibilidad pura y publicador real de
curso/grupo reutilizan escritor/protocolo existentes. T031 original: 42 casos únicos
en Lima y UTC (84 ejecuciones finales, contando su subconjunto en unitarias API);
T034 original: 16/16, dos controles y 14 casos del publicador con barreras/estado
persistido. Ambas tareas completas sin cambiar pruebas. API unitarias/arquitectura
308/308; persistencia nueva 35/35; regresión PostgreSQL seleccionada 221/221.
Tipos/lint/builds aprobados. T032 original se repite: cinco controles/proyecciones
aprobados y 53 fallos de rutas ausentes, con aserciones HTTP posteriores pendientes.
T036 conserva checkbox pendiente por su criterio literal T032 verde, que requiere
T038; no se adelantan rutas. T033/T035 siguen pendientes. PA-01–PA-05, E1 y bootstrap
abierto conservados. Véase [t036.md](evidence/t036.md). Detenido antes de T037.

Depende de fundamentos y US1. Prueba independiente: fixtures preparadas de varios
estados, publicación completa y alumno desde inicio compara dos grupos. No necesita
interfaz US3/US4; sus invariantes de seguridad ya deben funcionar aquí.

- [X] T031 [P] [US2] Escribir UNIT en `apps/api/src/modules/academic-offering/domain/visibility.test.ts`: estados padre/hijo, docente actual/snapshot/generación, pérdida y recuperación sin consultas, curso sin grupos visibles y proyecciones sin ocupación ficticia (FR-006/007/009/011/012; V-A05/A06).
- [ ] T032 [P] [US2] Escribir PG/HTTP en `apps/api/tests/integration/academic-offering-publication.spec.ts`: curso vacío publicable pero invisible, grupo exige padre publicado/completitud/docente único, captura generación solo en grupo; curso revalida hijos publicados sin renovar snapshot, todo rollback si alguno falla (FR-004/007/008/012; SC-004).
- [ ] T033 [P] [US2] Escribir PG/HTTP en `apps/api/tests/integration/academic-offering-catalog.spec.ts`: todas las rutas catálogo, filtros antes de conteo/paginación, enlaces grupo/curso incompatibles 404 indistinguibles, docente 403/visitante 401, DTO sin privados y capacidadStatus NOT_CALCULATED (FR-006/009–011).
- [X] T034 [P] [US2] Escribir PG concurrente en `apps/api/tests/integration/academic-offering-publication-races.spec.ts`: dos admins/distintas conexiones publican mismo docente/franja y solo uno confirma; distintos docentes pueden publicar; probar fechas efectivas y fronteras, consulta posterior a lock mediante barrera observada (FR-004/007/015; SC-004/006).
- [ ] T035 [P] [US2] Escribir E2E en `apps/web/tests/e2e/academic-offering-catalog.spec.ts`: seis escenarios US2, confirmación de publicación, curso más dos grupos, capacidad máxima/no calculada, vacío/reintento/no disponible, móvil/teclado y cero acciones de compra/reserva (FR-006/007/009/013/014; SC-002/005 automatizado).
- [ ] T036 [US2] Implementar `apps/api/src/modules/academic-offering/domain/visibility.ts` y publicación en `application/commands.ts` y `infrastructure/offering-store.ts`: curso/grupo con revalidación completa, locks de todos los docentes, conflicto contra otros PUBLISHED incluso padre retirado o revisión requerida; snapshot solo en grupo. Termina con T031/T032/T034 verdes, sin refrescar generación al publicar curso (FR-004/007/008/012/015).
- [ ] T037 [US2] Implementar catálogo en `apps/api/src/modules/academic-offering/infrastructure/offering-queries.ts` y `application/queries.ts`: una sentencia por proyección con directorio, franjas y conteo, filtro antes de página; lectura posterior a pérdida de habilitación oculta. Termina con T033 verde y sin cambios en GET (FR-006/009/011/012).
- [ ] T038 [US2] Añadir publish a `apps/api/src/modules/academic-offering/entrypoints/http/admin.controller.ts` y consultas a `catalog.controller.ts`; implementar todos los paths y políticas de api.md, accepted-session existente y errores de conflicto solo administrativos. Termina con T032–T034 y T017 aprobadas (FR-007/009/010/013).
- [ ] T039 [US2] Añadir resumen/confirmación y feedback de publicación en `apps/web/src/features/academic-offering/admin-course-page.tsx`, `admin-group-page.tsx` y `offering-state.tsx`: distinguir Publicado de Visible, faltantes/agenda y COURSE_PUBLICATION_BLOCKED, nunca publicación implícita. Termina con casos admin de T035 verdes (FR-007/013).
- [ ] T040 [US2] Crear `apps/web/src/features/academic-offering/catalog-page.tsx`, `course-page.tsx` y `group-page.tsx`: comparación paginada, zona explícita, textos «Capacidad máxima: N alumnos» y «Ocupación y disponibilidad no calculadas», error/no disponible sin causa privada. Termina con T035 verde (FR-003/006/009/011/014).
- [ ] T041 [US2] Integrar catálogo STUDENT/ADMIN en `apps/web/src/app/App.tsx`, `router.tsx` y `apps/web/src/features/profile/home-page.tsx`; profesor usa solo futura ruta propia, visitante acceso; conservar limpieza de respuestas tardías al perder sesión. Termina con pruebas de rutas y recorrido desde inicio en T035 (FR-009/010/014/016).
- [ ] T042 [US2] Ejecutar checkpoint en `specs/002-oferta-academica/evidence/us2.md`: T031–T035, US1 y políticas; registrar datos/errores realmente probados y estado final de carrera. Dejar observación humana SC-002 expresamente pendiente de T073 (FR-006/007/009–012/015; SC-002/004).

## Fase 5: US3 — Mantener, retirar o cancelar (P2, T043–T054)

Depende de US2. Prueba independiente: oferta publicada de fixture y diez escenarios
US3, incluyendo dos editores y dos publicaciones incompatibles. No requiere alumnado matriculado.

- [ ] T043 [P] [US3] Escribir UNIT de transiciones en `apps/api/src/modules/academic-offering/domain/lifecycle.test.ts`: retiro antes de edición, curso sin CANCELLED, cancelación terminal de grupo, snapshot preservado y cambios efectivos versus NO_CHANGE; transición inválida nunca no-op (FR-008/015).
- [ ] T044 [P] [US3] Escribir PG/HTTP en `apps/api/tests/integration/academic-offering-state.spec.ts`: withdraw/cancel y edición/republicación, padre retirado sin cambiar hijos ni liberar agenda PUBLISHED, curso bloqueado por revisión y recuperación retirando hijos; motivo solo admin y no DELETE (FR-007/008/011/012).
- [ ] T045 [P] [US3] Escribir PG en `apps/api/tests/integration/academic-offering-commands.spec.ts`: revisión obsoleta, altas/replay simultáneos, mismo payload/ID distinto actor, ID reutilizado con payload diferente, digest con destino/operación/revision, respuesta perdida/commit ambiguo, replay sin permisos y fallo de auditoría. Termina con cero duplicados/sobrescrituras y una auditoría por comando aceptado (FR-010/013/015; SC-006).
- [ ] T046 [P] [US3] Escribir PG en `apps/api/tests/integration/academic-offering-concurrency.spec.ts`: retiro/cancelación vs publicación, retiro de curso vs grupo, cursos/docentes cruzados, conjunto/assignación cambiante durante descubrimiento y agotamiento compartido de tres intentos. Confirmar esperas desde observador y estado final sin interbloqueo evitable ni falso conflicto por timeout (FR-004/008/015).
- [ ] T047 [P] [US3] Escribir E2E en `apps/web/tests/e2e/academic-offering-maintenance.spec.ts`: ciclo SC-001 con dos grupos, dos administradores con formularios obsoletos, cancelación, guardar sin republicar y 503 incierto/reintento explícito. Termina con verificaciones móvil/teclado y formularios conservados (FR-008/013/014/015).
- [ ] T048 [US3] Implementar transiciones en `apps/api/src/modules/academic-offering/domain/course.ts`, `group.ts`, `application/commands.ts` e `infrastructure/offering-store.ts`; conservar snapshots/datos, cancelar con motivo/fecha del servidor y liberar agenda solo al retirar/cancelar grupo. Termina con T043–T046 verdes y publicación del curso atómica (FR-007/008/012/015).
- [ ] T049 [US3] Completar rutas withdraw/cancel en `apps/api/src/modules/academic-offering/entrypoints/http/admin.controller.ts`; expectedRevision y commandId obligatorios, sin DELETE/cancelación de curso ni estado enviado por PATCH. Termina con T044/T045 y matriz de políticas aprobadas (FR-008/010/013/015).
- [ ] T050 [US3] Implementar confirmaciones de retiro/cancelación, motivo, edición tras retiro y republicación en `apps/web/src/features/academic-offering/admin-course-page.tsx`, `admin-group-page.tsx` y `offering-state.tsx`. Termina con curso/hijo diferenciados, cancelado solo lectura y T047 verde en ciclo editorial (FR-008/013/014).
- [ ] T051 [US3] Completar resolución de conflictos y respuesta incierta en `apps/web/src/features/academic-offering/api.ts`, `api.test.ts` y `offering-state.tsx`: conservar intención exacta en memoria, comprobar estado, reintento manual igual ID, intención corregida nuevo ID, sin sobrescribir ni replay tras login. Termina con T045/T047 verdes (FR-013/015).
- [ ] T052 [US3] Añadir verificación de auditoría/replay y logs a `apps/api/tests/integration/academic-offering-audit.spec.ts`: actor/recurso/acción/momento/resultado, sin motivo/cuerpo/SQL, ledger y cambio atómicos, snapshot previo conservado y sin segundo hecho APPLIED en replay (FR-011/015; SC-006).
- [ ] T053 [US3] Ejecutar matriz completa de diez escenarios US3 y regresión US1/US2, registrando `specs/002-oferta-academica/evidence/us3.md`; incluir casos efectivos comunes, contiguos, distintos docentes y dos admins, con consultas finales persistidas (FR-004/008/015; SC-001/004/006).
- [ ] T054 [US3] Documentar ciclo editorial y recuperación de conflictos en `specs/002-oferta-academica/quickstart.md`, vinculando evidencia T053 y manteniendo comandos seguros; checkpoint aprobado solo si T043–T047/T052 pasan, sin efectos sobre matrícula ni reembolsos (FR-008/013/016).

## Fase 6: US4 — Asignación y permisos vigentes (P2, T055–T066)

Depende de US3 para retiro/republicación y conserva desde fundamentos la seguridad.
Prueba independiente: administrador/alumno/docente propio/ajeno/visitante y cuentas
activas/desactivadas con todos los estados académicos; ocho escenarios US4.

- [ ] T055 [P] [US4] Escribir PG/HTTP en `apps/api/tests/integration/academic-offering-authorization.spec.ts`: matriz enumerada de cada ruta/método × actor × estado, docente asignado/ajeno, sesión revocada/expirada y cambio de rol; 401/403/404 y cero efectos/datos denegados (FR-009/010/016; SC-003).
- [ ] T056 [P] [US4] Escribir PG en `apps/api/tests/integration/academic-offering-teacher.spec.ts`: publicación vs pérdida de habilitación en ambos órdenes con barreras, pérdida→recuperación sin lecturas, recuperación sin republicar, reset sin ocultar, grupo cancelado no recuperable, publicar curso no limpia revisión. Termina con snapshot/generación/visibilidad final correctos (FR-007/010/012/016; SC-004).
- [ ] T057 [P] [US4] Escribir PG/HTTP en `apps/api/tests/integration/academic-offering-privacy.spec.ts`: DTO/contadores/filtros por audiencia, docente propio en cualquier estado y contexto curso sin hermanos; no email, cuenta, generación, revisión ni motivo de cancelación; GET no muta ni habilita (FR-009–012; SC-003).
- [ ] T058 [P] [US4] Escribir E2E en `apps/web/tests/e2e/academic-offering-teaching.spec.ts`: Mis grupos propios en todos los estados, revocación/cambio de rol con vista abierta, respuestas tardías descartadas, visitante y enlaces ajenos, móvil/teclado (FR-009/010/013/014).
- [ ] T059 [P] [US4] Escribir E2E en `apps/web/tests/e2e/academic-offering-teacher-review.spec.ts`: selector elegible/homónimos, desactivar y reactivar vía identidad existente, aviso solo admin, retirar/revisar/republicar explícitamente y consulta alumno; no crear roles/cuentas mediante asignación (FR-007/012/016).
- [ ] T060 [US4] Completar consultas propias y diagnóstico admin en `apps/api/src/modules/academic-offering/infrastructure/offering-queries.ts` y `application/queries.ts`: asignación actual por actor en misma sentencia, revisión derivada sin nuevo estado/flag mutable, proyecciones cerradas. Termina con T055/T057 verdes para lecturas (FR-009–012).
- [ ] T061 [US4] Exponer `/teaching/groups` y `/:id` en `apps/api/src/modules/academic-offering/entrypoints/http/teaching.controller.ts`; academic:read-own, paginación y contexto autorizado, sin acciones de escritura ni consulta general de curso. Termina con T055/T057 y T017 verdes (FR-009/010/011).
- [ ] T062 [US4] Completar asignación/revisión administrativa en `apps/web/src/features/academic-offering/admin-group-page.tsx` y `group-form.tsx`: referencia previa, «Docente no habilitado»/«Revisión docente requerida», edición solo tras retirar y publicación explícita. Termina con T059 verde y sin alterar reglas de identidad (FR-012/013/016).
- [ ] T063 [US4] Crear `apps/web/src/features/academic-offering/teaching-groups-page.tsx` y `teaching-group-page.tsx`, sin controles de gestión ni incidentes privados; campos incompletos «Sin configurar». Termina con T058 verde tras integración de rutas (FR-009/011/013/014).
- [ ] T064 [US4] Integrar Mis grupos y enlaces por rol en `apps/web/src/app/App.tsx`, `router.tsx`, `protected-route.tsx` y `apps/web/src/features/profile/home-page.tsx`; verificar limpieza/cancelación al revocar sesión en `apps/web/src/app/session.tsx` sin replay. Termina con T058/T059 verdes y regresión de acceso/perfil (FR-009/010/014/016).
- [ ] T065 [US4] Ejecutar regresión de identidad afectada conforme a `specs/002-oferta-academica/quickstart.md` y registrar `specs/002-oferta-academica/evidence/identity-regression.md`: todas las configuraciones E2E originales y PG acceso/reset/bootstrap/sesión/último ADMIN, CSRF/CSP; resultados nuevos separados de evidencia 001 y bootstrap intermitente sigue abierto (FR-016; V-A12).
- [ ] T066 [US4] Ejecutar checkpoint en `specs/002-oferta-academica/evidence/us4.md`: ocho escenarios US4, T055–T059 y T065, tabla completa SC-003 sin combinaciones omitidas, carrera en ambos órdenes y ocultamiento persistente tras reactivación. No cerrar con fallos de autorización/privacidad (FR-009–012/016; SC-003/004/005).

## Fase 7: integración, documentación y aceptación (T067–T074)

Depende de los cuatro checkpoints. Separar siempre evidencia automática, humana y
condiciones operativas pendientes; ninguna marca se obtiene por redactar este documento.

- [ ] T067 Incorporar un paso E2E de oferta en `.github/workflows/v00-linux.yml` usando `npm run test:e2e --workspace @academia/web -- --config playwright.academic-offering.config.ts`; conservar suites originales, Compose y job existente. Confirmar descubrimiento automático de UNIT/PG, incluir nueva config en lint de `apps/web/package.json` si queda fuera y no aumentar timeouts sin diagnóstico (FR-014/016).
- [ ] T068 Ejecutar puerta automática final y registrar `specs/002-oferta-academica/evidence/automated.md`: lint/build, UNIT API/web, probe/check, integración PostgreSQL, crypto-mail, E2E oferta e identidad siguiendo quickstart; adjuntar resultados de CI disponible sin afirmar ejecución remota inexistente. Registrar todos V-A01–A12, fallos/omisiones, revisión exacta y estado final de carreras (FR-001–016; SC-001/003–006).
- [ ] T069 Ensayar actualización incremental y recuperación en destino ficticio según `ops/recovery/README.md`, registrando `specs/002-oferta-academica/evidence/recovery.md`: backup/restore consistente de generaciones/snapshots/ledger, credenciales restauradas invalidadas y revisión de decisiones posteriores al backup; comparar identidad y preservar volúmenes manuales. Sin prometer downgrade o recuperación de cambios fuera del RPO; D13 no se cierra por este ensayo (FR-016; constitución X).
- [ ] T070 Actualizar `README.md`, `docs/alcance-mvp.md` y `ops/local/architecture.md` con estado efectivamente implementado/verificado, navegación, módulo y límites, enlazando spec/evidencia. No convertir planes o tests omitidos en capacidad acreditada ni reescribir evidencia 001 (FR-014/016).
- [ ] T071 Actualizar `docs/decisiones-pendientes.md` y `specs/002-oferta-academica/quickstart.md` con delimitación D04, D06 matrícula, D10/D13, T104/T108, SMTP real y bootstrap; PA-01–05 siguen aprobadas. Conservar video/alojamiento y cargas diferidas; registrar bloqueo real sin sustituir reglas (FR-006/016).
- [ ] T072 Preparar protocolo humano en `specs/002-oferta-academica/evidence/human-acceptance.md`: alumno real recorre desde inicio y reconoce sin ayuda curso/grupo/días/horas/fechas/zona/capacidad de dos grupos, sin nuevas muestras/porcentajes impuestos; datos ficticios, acceso loopback exclusivo y observación pendiente hasta ejecución (FR-006/009/014; SC-002, V-A13).
- [ ] T073 Realizar observación humana con responsable y alumno, registrar resultado real en `specs/002-oferta-academica/evidence/human-acceptance.md`. Si no hay participante, mantener esta tarea sin marcar y SC-002 pendiente, identificando esa dependencia; el agente o Playwright no sustituyen al alumno (SC-002).
- [ ] T074 Elaborar cierre en `specs/002-oferta-academica/evidence/acceptance.md`: matriz FR/SC, cuatro checkpoints, constitución I/II/IV/IX/X/XI, resultados automáticos y humanos separados, cambios/configuración conservados y riesgos heredados. Si T073 u otra puerta falta, declarar aceptación parcial y mantener esta tarea pendiente; cero afirmaciones de 1000 concurrentes, sin despliegue implícito (FR-016; SC-001–006).

## Dependencias y orden de ejecución

Orden predeterminado secuencial T001→T074, excepto los lotes `[P]` siguientes.
Esto resuelve los archivos compartidos commands/store/queries/controladores y App/router:
no hay permiso para editarlos concurrentemente entre historias.

`Preparación → Fundamentos → US1 → US2 → US3 → US4 → Integración/aceptación`.

- T005/T006 dependen de T003 y se escriben antes de T007/T008; la ejecución completa
  espera la migración. T012 precede T013; T018 exige todo fundamento verde.
- US1 T019–T022 son independientes entre sí después de T018; T023–T029 integran sus
  respectivas capas y T030 exige el lote completo aprobado.
- US2 T031–T035 dependen de T030; T036 integra reglas/locks, T037 consultas, T038 HTTP,
  T039–T041 interfaz. T042 exige todos, incluidas carreras y privacidad.
- US3 T043–T047 dependen de T042; T048–T051 usan los mismos escritores/cliente,
  T052 verifica auditoría y T053/T054 cierran la historia.
- US4 T055–T059 dependen de T054; T060–T064 completan lecturas/UI, T065/T066 validan.
- T067–T071 esperan T066. T072 prepara aceptación humana, T073 depende de participante
  real y T074 de evidencia completa. Falta de participante no bloquea implementación
  o tests automáticos; sí impide declarar aceptación completa.

Las historias son comprobables con fixtures propias sin ejecutar UI de historias previas,
pero no se promete independencia de implementación inexistente: publicar requiere el
agregado y el protocolo; mantener/revisar requiere publicación segura.

## Ejemplos de trabajo en paralelo

| Lote disponible | Tareas sobre archivos distintos | Puerta previa |
| --- | --- | --- |
| Fundamentos | T005 + T006 | T001–T004 |
| US1 | T019 + T020 + T021 + T022 | T018 |
| US2 | T031 + T032 + T033 + T034 + T035 | T030 |
| US3 | T043 + T044 + T045 + T046 + T047 | T042 |
| US4 | T055 + T056 + T057 + T058 + T059 | T054 |

Son oportunidades de edición de pruebas, no obligación de ejecutar suites PG en paralelo
ni de delegar a agentes. Los helpers compartidos se cambian fuera de esos lotes.

## Estrategia incremental y comandos existentes

Primer bloque recomendado: T001–T004 (inventario, aislamiento y fixtures), seguido por
T005/T006 y migración controlada T007/T008. US1 es la primera demostración de preparación;
US1+US2 entrega el recorrido de oferta publicada. Las cuatro historias son necesarias
para cerrar este spec, sin habilitar externamente una entrega que omita seguridad.

Reutilizar los comandos de quickstart dentro del proyecto de prueba T002:

| Nivel | Comando existente / ajuste |
| --- | --- |
| UNIT API y arquitectura | `npm run test:unit --workspace apps/api -- --maxWorkers=1` recoge src/modules y tests/architecture. |
| UNIT web | `npm run test:unit --workspace apps/web -- --maxWorkers=1` recoge src. |
| PG/HTTP | `npm run test:integration` genera clientes probe/app y recoge tests/integration; no esconder fallos seleccionando solo oferta. |
| Compatibilidad | `npm run probe:migrate`, `npm run probe:check`, `npm run test:crypto-mail` en entorno aislado. |
| Código/capas | `npm run lint` y `npm run build`; T017 extiende comprobaciones actuales. |
| E2E oferta | `npm run test:e2e --workspace apps/web -- --config playwright.academic-offering.config.ts`; única configuración nueva. |
| E2E identidad | Mantener las configuraciones originales y comandos exactos de quickstart; no reducirlas a un grep. |
| CI | T067 agrega el paso al workflow existente, sin otro job/servicio/pool ni upgrades. |

No ejecutar comandos de esa tabla ahora. `npm test` por sí solo no garantiza ejecutar
todas las configuraciones E2E; quickstart enumera las suites. DDL solo por migración
versionada con propietario en destino exclusivo, nunca desde runtime. Migración generada
requiere revisar SQL manual de triggers/vista/checks y comprobar sombra si se utiliza.

## Trazabilidad de cobertura prevista

Cobertura de tareas significa trabajo planificado, no requisito demostrado.

| Requisito | Tareas principales | Historia / verificación |
| --- | --- | --- |
| FR-001 | T019,T021,T022,T024–T030 | US1, V-A01/A10 |
| FR-002 | T007,T008,T019,T023,T024 | US1, V-A01 |
| FR-003 | T020,T023,T024,T028,T040 | US1/US2, V-A02 |
| FR-004 | T020,T034,T036,T046,T053 | US1/US2/US3, V-A02/A07 |
| FR-005 | T007,T008,T019,T021,T028 | US1, V-A03 |
| FR-006 | T031,T033,T035,T040,T072,T073 | US2, V-A03/A13 |
| FR-007 | T032,T034,T036,T038,T039,T056 | US2/US4, V-A06/A07 |
| FR-008 | T043,T044,T046–T050,T053 | US3, V-A01/A08 |
| FR-009 | T033,T035,T040,T041,T055,T057–T064 | US2/US4, V-A04/A10 |
| FR-010 | T011,T013,T017,T021,T055,T061 | Todas, V-A04/A12 |
| FR-011 | T009,T010,T015,T033,T052,T057 | Todas, V-A05 |
| FR-012 | T006,T008,T009,T031,T056,T059,T062 | US2/US4, V-A06/A08 |
| FR-013 | T015,T022,T027,T028,T035,T047,T050,T051 | Todas, V-A09/A10 |
| FR-014 | T004,T022,T029,T035,T047,T058,T064,T068 | Todas, V-A10/A12 |
| FR-015 | T012–T014,T024,T034,T045,T046,T051,T052 | Todas, V-A07/A08/A09 |
| FR-016 | T001–T008,T018,T065,T067–T071,T074 | Transversal, V-A11/A12 |
| SC-001 | T022,T047,T053,T068 | Ciclo completo, dos grupos, persistencia |
| SC-002 | T035,T040,T072,T073 | Automatizado + observación humana pendiente |
| SC-003 | T055,T057,T065,T066,T068 | Matriz completa, cero efectos/datos denegados |
| SC-004 | T019,T020,T032,T034,T046,T056,T068 | Fronteras, concurrencia y habilitación |
| SC-005 | T022,T035,T047,T058,T059,T068 | Cuatro historias móvil/escritorio/teclado |
| SC-006 | T034,T045–T047,T052,T068 | Cero duplicados/sobrescrituras, auditoría |

HU08 se concreta en US2; HU09 en US1–US4; RF10 abarca todo el incremento.
No hay tareas de órdenes, pagos, reservas, matrículas, clases, materiales, video o chat.
D04 y D06/matrícula quedan abiertos, igual que T104/T108, bootstrap, SMTP real, D10/D13
y capacidad sin aprobar. Backups/restore antes de demo persistente o publicación siguen
siendo puerta constitucional, no autorización de despliegue por completar tareas.

## Anexo: restricciones literales vinculantes de T007–T010 y T023–T024

Las tablas siguientes se transcriben de data-model.md; son parte de las descripciones
de esas tareas. La verificación T005/T006/T019/T020/T021 comprueba restricciones locales;
T032/T044/T056 comprueba las invariantes que requieren transacción y otras filas.

### Convenciones y propiedad

- UUID identifica entidades; el servidor genera referencias estables. No códigos manuales
  obligatorios, unicidad de nombres ni cambios de curso de un grupo por edición.
- Textos de nombre se recortan en extremos y deben contener al menos un carácter no
  blanco; descripción vacía se normaliza a null durante preparación. No límites de
  negocio nuevos de longitud: rige el límite técnico HTTP existente de 16 KiB.
- revision y generaciones son bigint no negativos; revision comienza en 1 y se entrega
  como cadena decimal canónica para no perder precisión JSON.
- Fechas civiles DATE sin hora/zona del navegador, serializadas YYYY-MM-DD; horas
  HH:mm, sin segundos. Instantes de auditoría timestamptz, serializados UTC.
- Todas las tablas/vista/funciones se crean en el esquema configurado, incluidos
  esquemas de prueba; ninguna referencia fija a public.
- Usuarios/identidad poseen habilitación y su generación; oferta posee estados y
  publicación académica. Infraestructura compartida coordina locks, no decide permisos.

### AcademicCourse

| Campo | Tipo / nulabilidad | Restricción y responsabilidad |
| --- | --- | --- |
| id | UUID, obligatorio | PK, generado por servidor. |
| name | text, obligatorio | No vacío tras recorte; no único. |
| description | text, nullable | Permite preparación incompleta; no vacía al publicar. |
| state | enum DRAFT/PUBLISHED/WITHDRAWN | Inicial DRAFT; sin CANCELLED de curso. |
| revision | bigint, obligatorio | Inicial 1, positivo; aumenta por cambio efectivo de datos/estado de curso. |
| createdAt / updatedAt | timestamptz, obligatorios | Metadatos internos, no reloj del cliente. |

El curso no contiene docente, capacidad, precio, matrícula o franjas.
CHECK exige descripción no vacía si state=PUBLISHED.
Crear un grupo no altera datos/revision del curso; su conjunto se vuelve a descubrir
y comprobar al republicar. Todas las mutaciones de grupos bloquean el curso para
estabilizar esa comprobación, aunque no incrementen su revision.

### Transiciones del curso

| Operación | Estado previo | Estado posterior | Condiciones / efectos |
| --- | --- | --- | --- |
| Crear | Inexistente | DRAFT | Nombre válido. |
| Editar datos | DRAFT o WITHDRAWN | Igual | Revision esperada; no altera grupos. |
| Publicar | DRAFT o WITHDRAWN | PUBLISHED | Descripción completa; revalidar todos los grupos que ya estén PUBLISHED. |
| Retirar | PUBLISHED | WITHDRAWN | Conserva grupos, estados, generaciones y programación docente. |

Ningún DELETE ni cancelación de curso. Publicar sin grupos puede preparar el curso,
pero no lo muestra al alumno hasta tener al menos un grupo visible. Esto permite luego
publicar el primer grupo sin dependencia circular.
Si cualquier grupo ya Publicado incumple integridad, horario o requiere revisión
docente, rechazar publicación del curso completa. No limpiar la revisión ni republicar
grupos implícitamente; retirarlos individualmente permite recuperar primero el curso.

### AcademicGroup

| Campo | Tipo / nulabilidad | Restricción y responsabilidad |
| --- | --- | --- |
| id | UUID, obligatorio | PK, generado por servidor. |
| courseId | UUID, obligatorio | FK AcademicCourse, ON DELETE RESTRICT; inmutable por contrato y trigger de pertenencia. |
| name | text, obligatorio | No vacío tras recorte; no único. |
| state | enum DRAFT/PUBLISHED/WITHDRAWN/CANCELLED | Inicial DRAFT; CANCELLED terminal. |
| periodStart / periodEnd | DATE, nullable | Preparación incompleta permitida; si ambos existen, inicio ≤ fin; ambos obligatorios para publicar. |
| timeZone | text, obligatorio | Siempre America/Lima; default explícito. |
| capacity | smallint, nullable | Sin configurar al crear borrador; todo valor configurado es entero 1–50. Obligatoria para publicar. |
| teacherUserId | UUID, nullable | FK User por interfaz de usuarios, ON DELETE RESTRICT; cero o uno durante preparación. |
| publishedTeacherUserId | UUID, nullable | FK User RESTRICT; última asignación confirmada al publicar. No se reemplaza al editar. |
| publishedTeacherEligibilityVersion | bigint, nullable | Generación capturada por publicación explícita del grupo. |
| cancellationReason | text, nullable | Solo administración; no vacía al cancelar, null mientras no esté cancelado. |
| cancelledAt | timestamptz, nullable | Exigida al cancelar; no usar reloj del cliente. |
| revision | bigint, obligatorio | Inicial 1; aumenta por edición efectiva, reemplazo de horario o transición. |
| createdAt / updatedAt | timestamptz, obligatorios | No son fechas de matrícula ni de inscripción. |

La omisión inicial de capacity en creación deja un borrador incompleto, no configura
una capacidad inválida. Si se envía capacity, null, vacío, fracción o fuera de rango
se rechazan; no se puede borrar una capacidad ya configurada enviando null.
Periodo puede omitirse durante preparación; si se envía se valida forma y coherencia.
La falta de información impide publicar y se muestra como «Sin configurar».

publishedTeacherUserId y publishedTeacherEligibilityVersion son ambos null o ambos
no null. Si state=PUBLISHED: periodo/capacidad/docente/snapshot son obligatorios, la
asignación coincide con publishedTeacherUserId y debe existir al menos una franja.
El CHECK local no puede verificar elegibilidad actual ni número de franjas en otra
tabla: son invariantes del agregado verificadas bajo el protocolo transaccional.

### Transiciones del grupo

| Operación | Estado previo | Estado posterior | Condiciones / efectos |
| --- | --- | --- | --- |
| Crear | Inexistente | DRAFT | Curso existente y nombre; resto puede completarse después. |
| Editar, asignar/desasignar o reemplazar franjas | DRAFT o WITHDRAWN | Igual | Revision esperada y valores válidos; snapshot de última publicación se conserva. |
| Publicar | DRAFT o WITHDRAWN | PUBLISHED | Curso PUBLISHED; integridad completa; docente elegible; sin conflicto; capturar docente/generación actual. |
| Retirar | PUBLISHED | WITHDRAWN | Conserva datos/snapshot; deja de bloquear programación. |
| Cancelar | DRAFT/PUBLISHED/WITHDRAWN | CANCELLED | Confirmación, motivo y revision; conservar datos/snapshot, dejar de bloquear programación. |
| Editar, publicar o retirar cancelado | CANCELLED | Rechazo | No reactivación ni borrado. |

Cambiar datos de un grupo Publicado se rechaza aunque el curso esté retirado:
hay que retirar también ese grupo. Los grupos DRAFT/WITHDRAWN sí pueden prepararse
bajo un curso Publicado, pues no modifican sus datos ni se publican automáticamente.

La pérdida de habilitación docente no cambia state ni revision del grupo:
cambia la generación de User; visibilidad/revisión se derivan al leer. Al corregir,
retirar si continúa Publicado, confirmar o sustituir asignación y publicar expresamente.

### AcademicSlot

| Campo | Tipo | Restricción |
| --- | --- | --- |
| id | UUID | PK; identidad de persistencia, no requerida para editar en interfaz. |
| groupId | UUID | FK AcademicGroup RESTRICT; no se mueve entre grupos. |
| dayOfWeek | smallint | Día ISO 1=lunes … 7=domingo. |
| startMinute | smallint | 0–1439 inclusive. |
| endMinute | smallint | 0–1439 inclusive; endMinute > startMinute. |

UNIQUE(groupId, dayOfWeek, startMinute, endMinute) rechaza duplicados exactos.
Reemplazar todo el conjunto en una transacción, bajo lock del grupo y revision.
Un borrador puede tener cero franjas; las enviadas deben ser válidas y no solaparse
entre sí. Si periodo completo existe, cada franja tiene al menos una ocurrencia.
Cambiar periodo vuelve a validar todas las franjas. No se crean entidades Clase.

### Regla exacta de coincidencia

Dos intervalos horarios se solapan si:
`a.startMinute < b.endMinute && b.startMinute < a.endMinute`.
La igualdad de un fin y otro inicio es adyacencia permitida.

Con día ISO d común, L=max(inicios de periodo), U=min(finales):
si L>U no hay fecha común. En otro caso,
`primera = L + ((d - isoDay(L) + 7) % 7) días`;
hay ocurrencia común si primera≤U. La misma fórmula comprueba que una franja exista
al menos una vez en su propio periodo. No expandir todas las fechas, sumar milisegundos
con zona local del host ni inferir horarios a partir del navegador.

Entre grupos: comparar solo otros grupos con state=PUBLISHED y teacherUserId igual,
incluso si el curso está WITHDRAWN o la publicación requiere revisión docente.
Retirados/Cancelados no bloquean. No comparar el grupo consigo mismo.
Los pares de franjas dentro de un mismo grupo se comprueban al guardar.
Las publicaciones/republicaciones se comprueban después de obtener locks de cuentas.

### Generación de habilitación — propiedad de usuarios/identidad

Campo futuro `User.teacherEligibilityVersion bigint NOT NULL DEFAULT 0 CHECK >=0`.

Elegible: role=TEACHER, status=ACTIVE y emailVerifiedAt no null.
No depende de sesión abierta, authVersion, contraseña o mustSetPassword.

Trigger BEFORE UPDATE de User:
- Si OLD era elegible y NEW deja de serlo: NEW.generation = OLD.generation + 1.
- En cualquier otro UPDATE ordinario: conservar OLD.generation, incluso si el
  llamante intentaba sustituirla. El servidor no acepta generación desde HTTP.
- INSERT usa 0; overflow aborta la escritura antes que reiniciar/reciclar generación.
- Cambio de acceso, incremento y revocación/auditoría de identidad se confirman o
  revierten juntos, utilizando la fila ya bloqueada por identidad.

Vista SQL pública ordinaria `AcademicTeacherDirectory`:
`userId, name, eligible, eligibilityVersion`.
No materializada, sin email, contraseñas, tokens ni estados detallados.
Usuarios es dueño del contrato; oferta no replica UserView ni consulta sus columnas
privadas. No exponer generación en DTO del alumno o docente.
La vista y el trigger se versionan en SQL de la migración; no se necesita habilitar
soporte experimental de vistas en Prisma ni añadir un segundo cliente/pool.

### Revisión persistente y visibilidad derivadas

Si hay snapshot previo, `teacherReviewRequired` es verdadero cuando la asignación
actual no coincide con publishedTeacherUserId, el docente ya no es elegible o la
generación actual difiere de publishedTeacherEligibilityVersion.
Sin snapshot previo se muestra «Sin publicar», no una publicación ya revisada.
Cambiar asignación en WITHDRAWN no borra el snapshot previo ni su trazabilidad.

Grupo visible al alumno solo cuando:
1. Curso PUBLISHED y grupo PUBLISHED.
2. Asignación actual coincide con la última publicada.
3. Docente elegible actualmente y generación capturada igual a actual.

Curso visible al alumno solo si existe al menos un grupo visible de ese curso.
No filtrar docentes/grupos privados al calcular totales o paginar.
Docente autenticado ve sus grupos asignados en cualquier estado, pero no incidencias,
motivo de cancelación o generación. Administrador ve todos y las incidencias mínimas.

Secuencia pérdida→recuperación cambia generación y no el snapshot. Sigue oculto incluso
sin consultas intermedias. Solo publicar explícitamente ese grupo captura generación
nueva. Publicar el curso no lo hace. Reset de contraseña no cambia generación.
Una lectura cuya sentencia comienza después del commit de pérdida debe ocultar;
una sentencia anterior puede finalizar con su instantánea previa.

### AcademicCommand

| Campo | Tipo | Restricción |
| --- | --- | --- |
| actorUserId / commandId | UUID | PK compuesta; actor FK User RESTRICT. |
| operation | enum cerrado | COURSE_CREATE/EDIT/PUBLISH/WITHDRAW; GROUP_CREATE/EDIT/SCHEDULE/PUBLISH/WITHDRAW/CANCEL. |
| targetKind / targetId | COURSE o GROUP / UUID | Referencia del resultado; no rutas arbitrarias. |
| payloadDigest | bytea | SHA-256 (32 bytes) del comando canónico, incluido destino y expectedRevision. |
| resultingRevision | bigint | Revision confirmada por esa operación. |
| appliedAt | timestamptz | Instante del commit lógico; no fecha de futura inscripción. |
| result | APPLIED/NO_CHANGE | Solo comandos aceptados; fallos hacen rollback y no reservan commandId. |

No cuerpos, motivos, cookies, contraseñas ni respuestas completas.
La unicidad y ledger se confirman con agregado/auditoría. Repetir mismo actor/id/payload
no duplica ni reejecuta; otro payload devuelve conflicto. El replay se reautoriza y
devuelve la proyección administrativa actual junto a resultingRevision original.

No se implementa purga automática ni caducidad de commandId en este incremento.
No reutilizar ni borrar entradas mientras puedan repetirse comandos de sus recursos;
cualquier política posterior deberá conservar la garantía de FR-015.

### AcademicAuditEvent

| Campo | Tipo / política |
| --- | --- |
| id | UUID PK. |
| actorUserId | UUID FK User RESTRICT; actor autenticado. |
| resourceKind / resourceId | COURSE/GROUP y UUID; referencia académica, no targetUserId ficticio. |
| action / result | Operación cerrada de AcademicCommand; APPLIED/NO_CHANGE. |
| commandId / requestId | UUID de comando y de intento HTTP, distintos. |
| beforeState / afterState | Estado editorial cerrado, nullable para alta; sin volcar DTO. |
| beforeRevision / afterRevision | bigint nullable/obligatorio según alta. |
| occurredAt | timestamptz UTC. |

Tabla separada de AuditEvent de identidad, cuyo contrato requiere targetUserId y acciones
de cuenta. No deformar ese contrato. Alta/edición/transición y auditoría son atómicas;
fallo de auditoría revierte mutación/ledger. Replay no crea otro hecho APPLIED.
Denegaciones e indisponibilidad se registran en el canal privado existente con nuevas
acciones/targets permitidos, sin entradas ni SQL ni motivos de cancelación.

Conservar los eventos de este incremento; la limpieza de identidad no debe borrarlos
ni asumir que tienen el mismo plazo. Retención operativa posterior se acordará sin
activar cron ni purgas nuevas.
