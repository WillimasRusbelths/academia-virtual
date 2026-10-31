# Tareas: reservas, órdenes y matrícula

**Rama**: feat/003-reservas-ordenes-matricula. **Fecha**: 2026-10-30, America/Lima.
**Estado**: 94 tareas previstas, todas pendientes; cero implementación o pruebas de producto por generarlas.
Entradas: [spec/quince respuestas](spec.md), [plan](plan.md), [datos](data-model.md),
[verificación integrada](verification.md), [investigación](research.md), [guía](quickstart.md),
[API](contracts/api.md), [integración](contracts/integration.md), [tiempo](contracts/time.md),
[pagos](contracts/payments.md), [UI](contracts/ui.md) y [constitución1.2.1](../../.specify/memory/constitution.md).

## Convenciones y finalización

Cada línea contiene ID, [P] cuando los archivos son independientes, historia cuando
corresponde, rutas, dependencias y criterio de finalización. Las rutas son relativas
al repositorio; llaves enumeran archivos concretos bajo ese directorio. Dependencias
explícitas mandan sobre numeración: US3/US4 pueden continuar después del núcleo local
de US2 sin esperar acceso externo D02; tareas humanas no bloquean desarrollo posterior.

Las tareas de **preparación de pruebas** se completan por escritura y ejecución real
de casos independientes, incluso en rojo por comportamiento todavía ausente si ese es
su alcance. Registrar rojo por caso y aserciones no alcanzadas; imports/config/sintaxis
o fixtures inválidos se corrigen y no cuentan como rojo válido. Cada checkpoint de
implementación exige todas sus aserciones verdes: preparar pruebas no aprueba comportamiento.
Si falta el módulo objetivo, el soporte mínimo permitido es una entrada tipada que
falla explícitamente por operación no implementada, junto a su contrato; registrar
esa superficie en la tarea de pruebas, sin implementar reglas, rutas ficticias o
resultados simulados para atribuir integración. Cada caso debe alcanzar su frontera
real; un import fallido no sustituye esa ejecución.
No un único fallo de carga que oculte casos, no aserciones debilitadas, no helper como
protocolo, no sleeps como única evidencia. Guardar comandos/commit/casos únicos,
repeticiones UTC/Lima o móvil/escritorio, resultados, recursos y límites en evidence/.

Conservar entorno manual, cuentas/.env/volúmenes, cinco migraciones históricas,
quince aclaraciones, PA-01–PA-05/E1 y evidencia001/002. T103 completo como informe sin
capacidad aprobada; T104/T108, T073/T074 y bootstrap continúan pendientes. D02/sandbox,
economía previa a cobros reales, D10/capacidad y D13/operación son puertas distintas.
Nada de matrícula manual, devolución/traslado, cambios/cancelación voluntaria,
materiales/clases/video/chat, AWS o contratación en estas tareas funcionales.

## Fase 1: Preparación compartida

**Objetivo**: Inventario, entorno aislado y fixtures ejecutables; cero comportamiento académico supuesto.

- [ ] T001 Documentar inventario y puntos de integración en specs/003-reservas-ordenes-matricula/evidence/preparation.md y specs/003-reservas-ordenes-matricula/evidence/inventory.json: Git/base, contratos públicos, cinco migraciones, scripts, CI, pendientes heredados y manifiesto privado de archivos protegidos. **Dep.**: base revisada. **Fin**: Hashes y estado inicial reproducibles; sin secretos, sobrescrituras o tareas001/002 cerradas. **Traza**: FR-022.

- [ ] T002 Reanudar exclusivamente el destino descrito en specs/003-reservas-ordenes-matricula/quickstart.md; registrar proyecto/servicios/mounts y configuración comprobada en specs/003-reservas-ordenes-matricula/evidence/environment.md, conservando volumen y .env existentes. **Dep.**: T001. **Fin**: Destino test acreditado, PostgreSQL saludable y cuentas manuales separadas; si Docker/config faltan, pendiente, no revisión sustitutoria. **Traza**: FR-022.

- [ ] T003 Preparar fixtures ficticias propias en apps/api/tests/support/enrollment.ts y apps/web/tests/support/enrollment-fixture.ts usando identity-database.ts, locks.ts y academic-offering.ts existentes. **Dep.**: T002. **Fin**: Titular/ajeno/admin/docente, oferta visible/oculta y estados financieros separados en schemas t_; limpieza solo del schema propio. Sin bootstrap ni cuentas manuales. **Traza**: FR-015, FR-016, FR-022.

- [ ] T004 Preparar apps/web/playwright.enrollment.config.ts y tipado selectivo de soportes/tests; incluir esa configuración en apps/web/package.json y apps/web/eslint.config.js cuando corresponda. Registrar comandos en specs/003-reservas-ordenes-matricula/evidence/preparation.md. **Dep.**: T003. **Fin**: Runner descubre un control de infraestructura realmente ejecutado; tipos incluyen fixtures/config y lint los revisa; no simular comportamiento académico ausente. **Traza**: FR-017, FR-022, FR-024.

**Checkpoint / prueba independiente**: T001–T004: destino confirmado y controles reales, sin migraciones o rutas nuevas.

## Fase 2: Fundamentos compartidos

**Objetivo**: Evolución aditiva, tiempo/dinero, puertos/autorización, transacciones, guard, auditoría y precio mínimo necesario para US1.

- [ ] T005 [P] Escribir UNIT de precisión, calendario y dinero en apps/api/src/modules/enrollment/domain/instant.test.ts, calendar.test.ts y money.test.ts: TV01–TV09, negativos, acarreo, año10000, PEN exacto y ausencia de precio. **Dep.**: T004. **Fin**: Casos independientes descubiertos y ejecutados; rojo atribuible a regla ausente, no imports; aserciones exactas sin Date truncado o límites comerciales inventados. **Traza**: FR-004, FR-005, FR-008.

- [ ] T006 [P] Escribir pruebas PG de evolución aditiva y restricciones en apps/api/tests/integration/enrollment-migration.spec.ts y apps/api/tests/support/enrollment-migration.ts, desde snapshot0005 con datos ficticios previos. **Dep.**: T004. **Fin**: Cada entidad/UNIQUE/FK/CHECK del modelo tiene intento válido e inválido; conservar filas anteriores, permisos runtime y evidencia de generación/aplicación posterior. **Traza**: FR-003, FR-004, FR-006, FR-007, FR-008, FR-010, FR-011, FR-019, FR-020, FR-022.

- [ ] T007 Modelar entidades de data-model.md en apps/api/prisma/schema.prisma y generar la migración aditiva posterior a0005 en apps/api/prisma/migrations/0006_enrollment/migration.sql; numeración real revalidada antes de crear. Aplicar las restricciones literales de la tabla al final de este archivo. **Dep.**: T005, T006. **Fin**: SQL revisado, sin alterar0001–0005 ni backfill financiero ficticio; coordinadoras AdmissionSequence/DispatchState distintas y descripción de grupo nullable; ninguna aplicación al entorno manual. **Traza**: FR-003, FR-004, FR-006, FR-007, FR-008, FR-010, FR-011, FR-019, FR-020, FR-022.

- [ ] T008 Generar cliente y aplicar/ensayar migración solo en destino aislado mediante scripts vigentes; completar apps/api/tests/integration/enrollment-migration.spec.ts y specs/003-reservas-ordenes-matricula/evidence/migration.md. **Dep.**: T007. **Fin**: T006 verde con aserciones posteriores alcanzadas, runtime sin DDL y filas/hashes preservados; si no hay PostgreSQL ejecutable queda pendiente. **Traza**: FR-022.

- [ ] T009 Implementar apps/api/src/modules/enrollment/domain/instant.ts, calendar.ts y money.ts y conversión PG de límites originales: timestamptz(6), bigint microsegundos, UTC seis fracciones, 86_400_000_000n y America/Lima. **Dep.**: T005, T008. **Fin**: T005 verde UTC/Lima, epoch negativo y límite+010000 conservados sin parser global, flotantes, offset fijo o Date intermedio; precio cero no matricula. **Traza**: FR-004, FR-005, FR-008.

- [ ] T010 Definir apps/api/src/modules/enrollment/public/{enrollment,commitments,payments}.ts y application/ports.ts; añadir apps/api/src/modules/academic-offering/public/{reservation-boundary,schedule}.ts y participante propio sin exponer adaptadores o PoolClient. **Dep.**: T009. **Fin**: Puertos entre dueños, tipos mínimos, snapshots y reautorización por composición; dominio/aplicación/public sin dependencias externas o imports internos ajenos. **Traza**: FR-001, FR-014, FR-015, FR-021.

- [ ] T011 [P] Preparar pruebas de matriz/arquitectura en apps/api/src/modules/authorization/domain/permissions.test.ts y apps/api/tests/architecture/{layers,import-boundaries,endpoint-policies}.spec.ts para enrollment. **Dep.**: T010. **Fin**: Todos los permisos del API permitidos/denegados por actor y pertenencia; rutas futuras no se declaran existentes; no relajar reglas de imports. **Traza**: FR-015, FR-016, FR-022.

- [ ] T012 Ampliar apps/api/src/modules/authorization/domain/permissions.ts y capacidades de apps/api/src/modules/enrollment/application/ports.ts usando session/account públicos existentes. **Dep.**: T011. **Fin**: T011 reglas verdes: alumno propio, admin precio/consulta/seguimiento, docente/visitante sin finanzas; SYSTEM solo composición técnica, no entrada de cliente. **Traza**: FR-015, FR-016.

- [ ] T013 [P] Escribir integración PG en apps/api/tests/integration/enrollment-foundation.spec.ts del orden global de locks, recheck/topología, ledger/auditoría, presupuesto único y COMMIT ambiguo. **Dep.**: T010. **Fin**: Dos conexiones y barreras observables; distinguir helper de protocolo, probar 40001/40P01/aborto y55P03 sin bucle3×3; corrupción/errores de entorno no son rojo válido. **Traza**: FR-010, FR-011, FR-012, FR-013, FR-019.

- [ ] T014 Implementar apps/api/src/infrastructure/database/enrollment-transaction.ts y participantes de apps/api/src/modules/enrollment/infrastructure/enrollment-store.ts bajo accountTransaction existente. **Dep.**: T012, T013. **Fin**: Mismo cliente, cuentas→sesión→cursos→grupos→órdenes→intentos→recibos→pagos→matrículas/incidencias→auditoría; red fuera de locks, token tras recheck y redescubrimiento acotado. **Traza**: FR-010, FR-012, FR-013, FR-015.

- [ ] T015 Implementar apps/api/src/modules/enrollment/infrastructure/audit.ts y EnrollmentCommand para precio/seguimiento, con puertos en application/ports.ts. **Dep.**: T014. **Fin**: Clave(actorKind,actorReference,commandId), operación en digest y UNIQUE de efecto(ORDER_EXPIRED,orderId); resultado/cambio/auditoría atómicos. ReservationRequest e intento serán sus propios ledgers, sin duplicarlos. **Traza**: FR-011, FR-019.

- [ ] T016 [P] Escribir PG/HTTP de guard y metadatos en apps/api/tests/integration/enrollment-maintenance.spec.ts: tres bloqueantes, historial finalizado, retiro/revisión/republicación y descripción opcional. **Dep.**: T010, T015. **Fin**: Carreras en ambos órdenes; curso inmutable siempre, cancelar terminal; reactivar docente no republica y texto/docente no cambia snapshots. **Traza**: FR-014, FR-021, FR-022.

- [ ] T017 Implementar apps/api/src/modules/enrollment/public/commitments.ts con adaptador propio y conectarlo a apps/api/src/modules/academic-offering/infrastructure/offering-store.ts mediante composición en apps/api/src/app.module.ts. **Dep.**: T016. **Fin**: Guard real en todos los escritores pertinentes tras locks, sin consulta directa financiera desde oferta; antes de habilitar reservas ya protege período/horario/capacidad/cancelación. **Traza**: FR-014, FR-021.

- [ ] T018 Incorporar descripción nullable aprobada en apps/api/src/modules/academic-offering/domain/group.ts, apps/api/src/modules/academic-offering/public/offer.ts y DTO/lectores estrictos afectados, usando columna de T007. **Dep.**: T017. **Fin**: No traslada curso, no cambia PA-01–PA-05/E1 ni NOT_CALCULATED; T016 alcanza pruebas de metadatos y regresión002 afectada sin romper consumidores existentes. **Traza**: FR-014, FR-021, FR-022.

- [ ] T019 [P] Escribir pruebas de errores/DTO cerrados en apps/api/tests/integration/enrollment-errors.spec.ts y apps/web/src/app/enrollment-api.test.ts, según contratos/api.md. **Dep.**: T010. **Fin**: Allowlist por ruta/audiencia y campos; exclusión de credenciales, callback, SQL, sesión, evidencia y causas privadas; estados inciertos distintos de rechazo confirmado. **Traza**: FR-015, FR-016, FR-017.

- [ ] T020 Ampliar apps/api/src/http/error.filter.ts, infrastructure/logging/security-events.ts y apps/web/src/{shared/api-client,app/http}.ts para errores y tipos003. **Dep.**: T019. **Fin**: T019 verde con envelope existente y errores seguros; conservar16KiB, CSRF/origen/cuotas y null/null/NOT_CALCULATED002; no logger de payload financiero. **Traza**: FR-015, FR-016, FR-017.

- [ ] T021 [P] Preparar PG/HTTP de precio en apps/api/tests/integration/enrollment-prices.spec.ts: ausencia, PEN exacto, revisión/null alta, commandId idéntico/distinto, concurrencia y fallo de auditoría. **Dep.**: T008, T012, T015, T020. **Fin**: Casos descubiertos/ejecutados, permisos admin sí/resto no y snapshots no alterados; sin inventar mínimo/descuento/gratuidad. **Traza**: FR-005, FR-011, FR-015, FR-019.

- [ ] T022 Implementar precio compartido en apps/api/src/modules/enrollment/application/prices.ts, infrastructure/enrollment-store.ts, entrypoints/http/admin.controller.ts y enrollment.module.ts; conectar AppModule. **Dep.**: T021, T018. **Fin**: GET/PUT de precio reales con revisiones y ledger/auditoría atómicos; T013/T016/T019/T021 verdes en alcance fundamentos, sin atribuir protocolo de reserva aún ausente. **Traza**: FR-005, FR-011, FR-015, FR-019.

**Checkpoint / prueba independiente**: T005–T022: suite de restricciones y fundamentos verde, guard real conectado antes de reservas; ninguna aprobación financiera funcional por helper.

## Fase 3: US1 — Reservar y consultar orden (P1)

**Objetivo**: Selección/admisión/reserva conjunta y orden recuperable; primer incremento técnico utilizable sin pago.

- [ ] T023 [P] [US1] Preparar UNIT en apps/api/src/modules/enrollment/domain/{reservation,order,compatibility}.test.ts: conjunto, curso único, compromiso vigente incluso oculto, inventario1–50 y coincidencias efectivas/contiguos. **Dep.**: T022. **Fin**: Entradas válidas/inválidas independientes y aserciones de negocio, no duplicación literal de implementación; snapshots y total exactos. **Traza**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-011, FR-020, FR-021.

- [ ] T024 [P] [US1] Preparar PG/HTTP de admisión en apps/api/tests/integration/reservations-admission.spec.ts: secuencia durable, duplicados, commits adversos, revocación y una orden activa. **Dep.**: T022. **Fin**: Admisión no retiene ni inicia plazo; identidad repetida recupera después de vencer; fallo de infraestructura no es rechazo terminal; RA-02 no se prueba con orden de respuestas. **Traza**: FR-001, FR-003, FR-011, FR-012, FR-015, FR-020.

- [ ] T025 [P] [US1] Preparar PG en apps/api/tests/integration/reservations-dispatch.spec.ts de último cupo, multigrupo, cabeza bloqueada/reinicio, precio concurrente, rollback y expiración oportuna anterior fuera de selección. **Dep.**: T022. **Fin**: Dos conexiones/barreras, todos los grupos anteriores/nuevos, mismo token y cero parcialidad; TV06/10–12/15/17–19 y RA-02 sin SKIP LOCKED. **Traza**: FR-001, FR-003, FR-004, FR-006, FR-010, FR-011, FR-012, FR-013, FR-018, FR-019, FR-020, FR-021.

- [ ] T026 [P] [US1] Preparar PG/HTTP en apps/api/tests/integration/enrollment-queries.spec.ts: oferta/preview, propiedad, estado histórico, contador real e inventario anómalo. **Dep.**: T022. **Fin**: P06/PV25–26: lector espera conversión, sentencia posterior/evaluatedAt, topología cubierta; timeout503 sin cifra ficticia. Legado002 sigue no calculado. **Traza**: FR-001, FR-002, FR-015, FR-016, FR-018.

- [ ] T027 [P] [US1] Preparar UNIT web en apps/web/src/features/enrollment/{api,reservation-page,order-page}.test.tsx para DTO, espera ADMITTED, reserva confirmada, intención estable, recarga/logout y errores. **Dep.**: T022. **Fin**: No pago en espera, no éxito por reloj local, no persistir tokens/intenciones privadas en localStorage ni reenvío automático tras login. **Traza**: FR-017, FR-018.

- [ ] T028 [P] [US1] Preparar E2E apps/web/tests/e2e/enrollment-reservation.spec.ts con fixtures PG reales y teclado/móvil/escritorio. **Dep.**: T022. **Fin**: Recorrido selección→espera→orden, vacíos/error/incierto y consulta desde otra sesión del titular; runner real, sin mocks HTTP para atribuir persistencia. **Traza**: FR-001, FR-003, FR-004, FR-006, FR-017, FR-018.

- [ ] T029 [US1] Implementar apps/api/src/modules/enrollment/domain/{reservation,order,compatibility,enrollment-error}.ts con puertos públicos de calendario. **Dep.**: T023. **Fin**: T023 verde; corte antes00:00 inicial Lima, selección toda/ninguna, un grupo/curso, reserva/matrícula vigente excluyen duplicado; contiguos permitidos, ocultos cuentan y vencidos/finalizados no. **Traza**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-011, FR-020, FR-021.

- [ ] T030 [US1] Implementar apps/api/src/modules/enrollment/infrastructure/admission.ts y application/reserve.ts para admisión persistida bajo AdmissionSequence→alumno→sesión→intención. **Dep.**: T024, T029. **Fin**: Contador y ADMITTED confirman juntos; UNIQUE(studentId,intentionId), UNIQUE(admissionSequence); misma intención/contenido recupera, diferente409, sin nueva secuencia o plaza. **Traza**: FR-003, FR-011, FR-012, FR-015.

- [ ] T031 [US1] Implementar apps/api/src/modules/enrollment/infrastructure/dispatch.ts y su arranque/cierre: menor secuencia ADMITTED con DispatchState hasta COMMIT. **Dep.**: T025, T030. **Fin**: Nunca salta cabeza, no toma AdmissionSequence ni mantiene conexión por alumno en espera; error temporal deja ADMITTED, denegación comprobada guarda REJECTED/auditoría. **Traza**: FR-010, FR-012, FR-018.

- [ ] T032 [US1] Implementar confirmación en apps/api/src/modules/enrollment/application/reserve.ts y normalizador compartido application/expire-reservations.ts con infrastructure/expiration-store.ts. **Dep.**: T031. **Fin**: Una transacción bloquea unión de referencias, captura único t, normaliza anterior vencida y confirma nueva; expiresAtUs-confirmedAtUs=86_400_000_000n, snapshots originales, sin retención extra. Normalizador real ya funciona antes del schedulerUS3. **Traza**: FR-001, FR-003, FR-004, FR-006, FR-009, FR-010, FR-011, FR-012, FR-013, FR-019, FR-020, FR-021.

- [ ] T033 [US1] Completar escrituras de orden/detalles/reservas y resultado en apps/api/src/modules/enrollment/infrastructure/enrollment-store.ts; enlazar auditoría sin otro ledger de intención. **Dep.**: T032. **Fin**: UNIQUE(requestId), UNIQUE(orderId,courseId), UNIQUE(orderItemId); RESERVED/CONFIRMED y su resultado solo tras COMMIT, rollback/corrupción/auditoría dejan cero parcialidad. **Traza**: FR-003, FR-006, FR-010, FR-011, FR-019.

- [ ] T034 [US1] Implementar apps/api/src/modules/enrollment/application/queries.ts y infrastructure/queries.ts para oferta/preview, solicitudes y órdenes propias. **Dep.**: T026, T033. **Fin**: P06: actor/sesión→FOR SHARE cursos/grupos→órdenes, otra sentencia READ COMMITTED y token posterior; datos finales cubiertos o redescubrimiento. Capacidad−retenciones−ocupación real sin clamp; no contador mutable. **Traza**: FR-001, FR-002, FR-005, FR-015, FR-016, FR-018.

- [ ] T035 [US1] Exponer apps/api/src/modules/enrollment/entrypoints/http/{reservations,orders}.controller.ts: oferta/preview, admitir/consultar/listar solicitudes y órdenes/current/detalle del API. **Dep.**: T034. **Fin**: 200 ADMITTED explícito, paginación20/máximo técnico50, backend propietario, JSON estricto/CSRF y allowlists. Dinero/titular/fechas del cliente no son autoridad. **Traza**: FR-001, FR-003, FR-006, FR-011, FR-015, FR-016, FR-018.

- [ ] T036 [US1] Implementar apps/web/src/features/enrollment/api.ts y adaptarlo desde apps/web/src/app/http.ts usando shared/api-client.ts. **Dep.**: T027, T035. **Fin**: DTO y seis fracciones exactas, errores cerrados, consulta/replay manual recuperable; sin imports internos de otra feature o reinterpretación de202. **Traza**: FR-016, FR-017, FR-018.

- [ ] T037 [US1] Implementar apps/web/src/features/enrollment/reservation-page.tsx: selección un grupo/curso, preview no vinculante, confirmación explícita/intentionId y espera. **Dep.**: T036. **Fin**: Capacidad, retenciones, ocupación/disponibilidad y evaluatedAt separados; precio sin definir no se convierte en cero; carga/vacío/error/validación accesibles. **Traza**: FR-001, FR-002, FR-003, FR-006, FR-017.

- [ ] T038 [US1] Implementar consulta inicial en apps/web/src/features/enrollment/order-page.tsx: listado propio, orden actual/detalle e intención recuperable desde servidor. **Dep.**: T037. **Fin**: Referencia/desglose/PEN/plazo exactos y estado real; desconexión/logout no renuevan ni reenvían; nueva intención tras vencer sin sanción, antigua solo replay; no botón financiero funcional aún. **Traza**: FR-004, FR-006, FR-017, FR-018, FR-020.

- [ ] T039 [US1] Integrar navegación/composición en apps/web/src/app/router.tsx y apps/api/src/app.module.ts, enlazando oferta002 con proyección003 sin importar internos. **Dep.**: T038. **Fin**: Rutas registradas y protegidas, docente/visitante denegados; identidad/oferta afectadas conservan recorridos y NOT_CALCULATED; no activar producción financiera por ruta nueva. **Traza**: FR-001, FR-015, FR-017, FR-022.

- [ ] T040 [US1] Ejecutar UNIT/PG/HTTP T023–T027 y regresión de fundamentos/identidad/oferta afectada; registrar comandos, casos, aserciones posteriores y filas finales en specs/003-reservas-ordenes-matricula/evidence/us1.md. **Dep.**: T039. **Fin**: Todas las expectativas de esas capas verdes, último cupo/RA-02/rollback/recheck demostrados con PG real; tipos/lint/build y arquitectura apropiados sin ampliar límites. **Traza**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-010, FR-011, FR-012, FR-015, FR-016, FR-018, FR-020, FR-021, FR-022.

- [ ] T041 [US1] Ejecutar E2E T028 en móvil/escritorio y comprobar US1.01–US1.17 en specs/003-reservas-ordenes-matricula/evidence/us1.md. **Dep.**: T028, T040. **Fin**: Recorrido persistido real, teclado y estados vacíos/error/incierto; separar casos únicos/repeticiones y fallos históricos, sin atribuir aceptación humana. **Traza**: FR-001, FR-003, FR-004, FR-006, FR-017, FR-018.

- [ ] T042 [US1] Registrar observación humana de US1 en specs/003-reservas-ordenes-matricula/evidence/human-acceptance.md con alumno real y responsable del ensayo. **Dep.**: T041. **Fin**: Participantes/consentimiento y resultados reales sin datos privados publicados; si no están disponibles, pendiente. No bloquea desarrollar otros incrementos ni cierra T073/T104 ajenas. **Traza**: FR-017. **Puerta**: HUMANA.

**Checkpoint / prueba independiente**: US1.01–US1.17 con datos ficticios y servidor/PG reales. T041 checkpoint automatizado; T042 humana pendiente si no hay participantes.

## Fase 4: US2 — Pagar y obtener matrícula (P1)

**Objetivo**: Iniciación recuperable y confirmación total auténtica o incidencia, con antecedentes y vigencia originales.

- [ ] T043 [P] [US2] Preparar UNIT en apps/api/src/modules/enrollment/domain/payment-verification.test.ts: PV01–03/14/17/20/23 y D06, instante−1µs/igual/+1µs y exclusión de reservas propias. **Dep.**: T040. **Fin**: Hecho auténtico incompatible no es pago aplicable; no redirección como prueba ni parcialidad, extensión, devolución o traslado implícitos. **Traza**: FR-007, FR-008, FR-010, FR-011, FR-013, FR-021.

- [ ] T044 [P] [US2] Preparar PG real en apps/api/tests/integration/enrollment-payments.spec.ts para PV01–20/25–26/28/30, con barreras de pago/vencimiento/reasignación/cancelación y fallo de matrícula/auditoría. **Dep.**: T040. **Fin**: Comprobar todos los efectos y aserciones posteriores por caso, identidad económica confiable, scopes distintos, dinero incompatible/referencia desconocida y lector cruzando límite; fixtures no acreditan Izipay. **Traza**: FR-007, FR-008, FR-010, FR-011, FR-013, FR-019, FR-021.

- [ ] T045 [P] [US2] Preparar PG en apps/api/tests/integration/enrollment-payment-attempts.spec.ts para PV21–24: intención duplicada/distinta, SUBMITTING/UNKNOWN, caída y respuesta tardía tras callback. **Dep.**: T040. **Fin**: Un intento canónico y una llamada por iniciación; recuperación no reenvía a ciegas, terminal no regresa a pendiente, prueba definitiva sin movimiento antes de otro intento. **Traza**: FR-007, FR-011, FR-013, FR-018.

- [ ] T046 [P] [US2] Preparar HTTP en apps/api/tests/integration/enrollment-payment-http.spec.ts: permiso/pertenencia, falsos callbacks, success navegador, logout y entrada SYSTEM. **Dep.**: T040. **Fin**: Usuario no puede fabricar origen técnico; fixture interna no expone aprobación en producción. Recibos/secretos privados excluidos y sin excepción global de CSRF. **Traza**: FR-007, FR-015, FR-016, FR-024.

- [ ] T047 [P] [US2] Preparar UNIT web apps/web/src/features/enrollment/{payment,enrollments-page}.test.tsx y E2E apps/web/tests/e2e/enrollment-payments.spec.ts con pagos simulados solo en soporte test. **Dep.**: T041. **Fin**: Inicio/pending/incierto/APPLIED/incidencia/vencimiento distintos; teclado/móvil/escritorio, respuesta perdida y consulta sin nuevo cobro; no atribuir sandbox a simulación. **Traza**: FR-007, FR-008, FR-017, FR-018.

- [ ] T048 [US2] Implementar apps/api/src/modules/enrollment/domain/{payment-verification,enrollment}.ts y application/payments.ts con decisión pura de aplicabilidad. **Dep.**: T043. **Fin**: T043 verde: total/PEN/asociación/plazo estricto/visibilidad/D06, una matrícula por detalle con validUntil original y exclusión de auto-conflicto. **Traza**: FR-007, FR-008, FR-010, FR-013, FR-021.

- [ ] T049 [US2] Implementar PaymentAttempt en apps/api/src/modules/enrollment/application/payments.ts y adaptador propio: persistir clave/referencia/digest antes de red, replay autorizado antes de condiciones mutables. **Dep.**: T045, T048. **Fin**: Red sin conexión/locks de negocio; nueva initiationId recupera intento incierto canónico, actualización condicional preserva terminal; timeout/404 aislado no es FAILED_NO_CHARGE. **Traza**: FR-003, FR-007, FR-011, FR-018.

- [ ] T050 [US2] Implementar apps/api/src/modules/enrollment/infrastructure/payment-receipts.ts y puerto técnico de recepción mínima: evidencia auténtica normalizada, recibo durable antes de acuse según capacidades acreditables. **Dep.**: T046, T049. **Fin**: Sin FK/lock provisional recibo→orden, PAN/tokens/cuerpo arbitrario o verificación final ficticia. Puerto real aún deshabilitado hasta T056–T059; test usa adaptador explícito solo fixture. **Traza**: FR-007, FR-011, FR-016, FR-018, FR-024.

- [ ] T051 [US2] Implementar apps/api/src/modules/enrollment/application/payment-verification.ts e infrastructure/enrollment-store.ts como finalizador SYSTEM P05. **Dep.**: T044, T050. **Fin**: Termina contrastes locales bajo locks, captura t y confirma VerifiedPayment solo APPLIED/INCIDENT con conversión/incidencia/auditoría; rollback conserva recibo previo. UNIQUE(providerScope,providerPaymentId), nuevo ámbito/topología exige abortar/redescubrir, COMMIT incierto consulta canónico. **Traza**: FR-007, FR-008, FR-009, FR-010, FR-011, FR-013, FR-019, FR-021.

- [ ] T052 [US2] Implementar apps/api/src/modules/enrollment/infrastructure/payment-recovery.ts reutilizando proceso/pool y finalizador: consulta externa sin locks, barridos finitos por(receivedAt,id)/(createdAt,id). **Dep.**: T051. **Fin**: Recupera recibos/intentos tras reinicio sin otro cobro, sin lease financiero o otra autoridad de tiempo; cursor avanza por examinada, reinicia horizonte y conserva presupuesto único/55P03. **Traza**: FR-007, FR-011, FR-013, FR-018.

- [ ] T053 [US2] Añadir POST de intento y GET de lista/detalle propios de matrícula a apps/api/src/modules/enrollment/entrypoints/http/{orders,enrollments}.controller.ts y application/queries.ts. **Dep.**: T052. **Fin**: Rutas del API con autorización/replay, matriculación únicamente por puerto técnico auténtico; hora/importe/titular no vienen del cliente, historial/ocultamiento conserva consulta propia. **Traza**: FR-007, FR-008, FR-015, FR-016, FR-018.

- [ ] T054 [US2] Implementar pago explícito/recuperación en apps/web/src/features/enrollment/order-page.tsx y enrollments-page.tsx, api.ts y navegación app. **Dep.**: T047, T053. **Fin**: No reenvío al login ni botón de simulación en producción; estados/DTO cerrados y matrícula con fechas originales; camino real cerrado mientras D02/economía no aprobados. **Traza**: FR-007, FR-008, FR-016, FR-017, FR-018.

- [ ] T055 [US2] Ejecutar T043–T047 y regresión temporal/fundamentos afectados; registrar PV cubiertos/aserciones finales en specs/003-reservas-ordenes-matricula/evidence/us2.md. **Dep.**: T054. **Fin**: PG/HTTP/E2E locales verdes sin sobreventa, parcialidad o dobles efectos; UNIT/helper separados del protocolo y simulación separada de sandbox. Checkpoint técnico local, no integración externa aprobada. **Traza**: FR-007, FR-008, FR-010, FR-011, FR-013, FR-015, FR-016, FR-017, FR-018, FR-019, FR-021, FR-022, FR-024.

- [ ] T056 [US2] Resolver y documentar contrato real D02 en specs/003-reservas-ordenes-matricula/evidence/provider-contract.md y actualizar solo precisión técnica de contracts/payments.md tras evidencia oficial de modalidad Izipay. **Dep.**: T055. **Fin**: Acceso autorizado a sandbox, comercio/entorno, autenticidad, referencias, dinero, estados, consulta/idempotencia de inciertos, acuses/reintentos/SDK/límites acreditados. Si falta capacidad imprescindible, bloqueo explícito; no adivinarla. **Traza**: FR-007, FR-024. **Puerta**: D02.

- [ ] T057 [US2] Preparar pruebas reales del adaptador en apps/api/tests/integration/enrollment-provider.spec.ts y guía sandbox separada en specs/003-reservas-ordenes-matricula/evidence/provider-sandbox.md, antes de T058. **Dep.**: T056. **Fin**: Casos válidos/inválidos/no confirmados, duplicados y recuperación externa con expectativas del contrato acreditado; runner aislado y secretos fuera de evidencia. No someter pasarela a carga. **Traza**: FR-007, FR-011, FR-024. **Puerta**: D02.

- [ ] T058 [US2] Implementar adaptador apps/api/src/modules/enrollment/infrastructure/payment-gateway.ts y entrada técnica específica bajo entrypoints/http solo según D02; conectar producción con configuración explícita y pruebas primero. **Dep.**: T057. **Fin**: Autenticidad real/IDs/dinero y recuperación segura; excepción de transporte estrecha, sin CSRF global relajado, SDK ficticio o capacidad de aprobación manual. Mantener cobros reales deshabilitados por RA-04. **Traza**: FR-007, FR-011, FR-015, FR-016, FR-024. **Puerta**: D02.

- [ ] T059 [US2] Ejecutar sandbox separado PV29 y regresión del adaptador/recorrido autorizado en specs/003-reservas-ordenes-matricula/evidence/provider-sandbox.md y specs/003-reservas-ordenes-matricula/evidence/us2.md. **Dep.**: T058. **Fin**: Resultados y fallos reales del proveedor; USER no activa matrícula por retorno y callbacks duplicados no duplican efectos. US2 externa solo completa con evidencia; no aprueba economía ni cobros reales. **Traza**: FR-007, FR-008, FR-011, FR-024. **Puerta**: D02.

**Checkpoint / prueba independiente**: US2.01–US2.12: T055 verifica protocolo local con simulación explícita; T059 acredita proveedor real. Sin D02 solo checkpoint local, no historia externa completa.

## Fase 5: US3 — Vencer y liberar consistentemente (P1)

**Objetivo**: Worker/reinicio sobre normalizador ya real, plazo efectivo y recuperación sin doble liberación.

- [ ] T060 [P] [US3] Preparar UNIT de scheduler/normalización en apps/api/src/modules/enrollment/application/expire-reservations.test.ts e infrastructure/expiration-scheduler.test.ts: TV13–24. **Dep.**: T040, T051. **Fin**: Reloj controlado solo test, límites exactos, single-flight, horizonte finito, fallidas revisitadas y cierre/pool; regla de86.400s de producto intacta. **Traza**: FR-004, FR-009, FR-013, FR-018.

- [ ] T061 [P] [US3] Preparar PG en apps/api/tests/integration/reservations-expiration.spec.ts: worker detenido/doble, mismas órdenes, oportuna+nueva, rollback y carreras PV03–10/25–26. **Dep.**: T040, T051. **Fin**: TV10–20/24–25 y total final de compromisos, una auditoría ORDER_EXPIRED; no reutilizar instantes de intento abortado o recuperar plaza reasignada por recibo anterior. **Traza**: FR-004, FR-009, FR-010, FR-013, FR-018, FR-019, FR-020.

- [ ] T062 [P] [US3] Preparar HTTP/E2E en apps/api/tests/integration/enrollment-expiration-http.spec.ts y apps/web/tests/e2e/enrollment-expiration.spec.ts. **Dep.**: T041, T051. **Fin**: Plazo no depende de sesión/contador/worker; recarga/logout/reinicio conserva resultado y nueva intención no sanciona abandono. Error temporal no fabrica expiración o disponibilidad. **Traza**: FR-004, FR-009, FR-017, FR-018, FR-020.

- [ ] T063 [US3] Implementar apps/api/src/modules/enrollment/infrastructure/expiration-scheduler.ts sobre application/expire-reservations.ts y expiration-store.ts reales de T032. **Dep.**: T060, T061. **Fin**: Mismo proceso/pool, arranque,5s/lote20/concurrencia1 medibles, horizonte(expiresAt,id), cursor por examinada y única transacción por orden; no segundo algoritmo, broker o ledger del timer. **Traza**: FR-009, FR-013, FR-018, FR-019.

- [ ] T064 [US3] Integrar ciclo de vida/recuperación en apps/api/src/modules/enrollment/enrollment.module.ts y puertos temporales: shutdown espera trabajo antes de cerrar pool. **Dep.**: T063. **Fin**: Estado durable reconstruido tras caída, clock wall con salud D13 y fallo seguro ante retroceso detectado/config inválida; no promesa de detección universal o reloj global alternativo. **Traza**: FR-004, FR-009, FR-018, FR-022.

- [ ] T065 [US3] Completar estados efectivos en apps/api/src/modules/enrollment/infrastructure/queries.ts y contratos propios: vencimiento lógico separado de expirationProcessedAt. **Dep.**: T062, T064. **Fin**: GET no normaliza, ni depende del worker; P06 locks/proyección posterior preservados, ENROLLED no se expira, recibo pendiente no extiende, incidencia permanece sin ocupar por sí misma. **Traza**: FR-002, FR-004, FR-009, FR-013, FR-018.

- [ ] T066 [US3] Completar UX de vencimiento/reintento explícito en apps/web/src/features/enrollment/order-page.tsx y reservation-page.tsx. **Dep.**: T065. **Fin**: Hora servidor exacta, sin auto-liberación/cancelación, nueva intención tras vencimiento sin penalización o plazo renovado, anterior conserva resultado; no pagos automáticos. **Traza**: FR-004, FR-009, FR-017, FR-018, FR-020.

- [ ] T067 [US3] Ejecutar TV01–TV25 según niveles y PG carreras con finalizador de T051 en specs/003-reservas-ordenes-matricula/evidence/us3.md; repetir reglas temporales en procesos UTC/America/Lima. **Dep.**: T066. **Fin**: Todas las aserciones alcanzadas, incluido negativo/año10000, materialización y fallos de reloj detectables; mismos casos por zona, no casos únicos nuevos; no equivale a observar24h físicas. **Traza**: FR-004, FR-009, FR-010, FR-013, FR-018, FR-019, FR-020, FR-022.

- [ ] T068 [US3] Ejecutar T062 E2E y regresión de consultas/selección/pago afectada en specs/003-reservas-ordenes-matricula/evidence/us3.md. **Dep.**: T067. **Fin**: Reinicio y worker retrasado reales en aislamiento, filas finales/cupos sin dobles efectos; helpers/fixture/control del reloj distinguidos de protocolo y sandbox. **Traza**: FR-004, FR-009, FR-017, FR-018, FR-020.

- [ ] T069 [US3] Cerrar checkpoint técnico US3 en specs/003-reservas-ordenes-matricula/evidence/us3.md y actualizar matriz verification.md con evidencia de US3.01–US3.05. **Dep.**: T068. **Fin**: UNIT/PG/HTTP/E2E apropiados verdes y limitaciones registradas; D13, ensayo operacional24h y aceptación humana siguen sus propias tareas. **Traza**: FR-004, FR-009, FR-013, FR-018, FR-022.

**Checkpoint / prueba independiente**: US3.01–US3.05: UNIT/PG/HTTP/E2E con finalizador local T051; no necesita esperar adaptador externo T059. Ensayo físico24h separado T090.

## Fase 6: US4 — Consulta y seguimiento autorizados (P2)

**Objetivo**: Precio UI y consulta propia/admin, seguimiento sin efectos económicos y mantenimiento protegido.

- [ ] T070 [P] [US4] Preparar UNIT de seguimiento y mantenimiento en apps/api/src/modules/enrollment/domain/commitments.test.ts y application/follow-up.test.ts. **Dep.**: T040, T051. **Fin**: Tres bloqueantes, historial no vigente no bloqueante, no cierre económico por texto, cambio de docente/textos permitido según002 y curso siempre inmutable. **Traza**: FR-014, FR-015, FR-016, FR-019, FR-021.

- [ ] T071 [P] [US4] Preparar PG/HTTP en apps/api/tests/integration/enrollment-admin.spec.ts y reservation-authorization.spec.ts: admin/propietario/ajeno/docente/visitante, follow-up/revisión/commandId y escrituras concurrentes. **Dep.**: T040, T051. **Fin**: Todos los permisos concedidos y denegados, seguimiento append-only atómico, sin efectos económicos ni bloqueo arbitrario por referencia desconocida; sin cancelación/modificación voluntaria por URL directa. **Traza**: FR-011, FR-014, FR-015, FR-016, FR-018, FR-019, FR-020, FR-021.

- [ ] T072 [P] [US4] Preparar UNIT web apps/web/src/features/enrollment/{prices-page,incidents-page}.test.tsx y E2E apps/web/tests/e2e/enrollment.spec.ts. **Dep.**: T041, T051. **Fin**: Vacío/error/conflicto/incierto, teclado/móvil/escritorio, textos de seguimiento no equivalen a resolución; vistas docentes/visitantes no acceden. **Traza**: FR-014, FR-016, FR-017, FR-019, FR-021.

- [ ] T073 [US4] Implementar consultas administrativas en apps/api/src/modules/enrollment/application/queries.ts e infrastructure/queries.ts para órdenes e incidencias/lista/detalle según API. **Dep.**: T070, T071. **Fin**: Identificación mínima necesaria, referencia desconocida solo admin, no secretos/datos de tarjeta o asignación manual; paginación/locks críticos y propiedad preservados. **Traza**: FR-015, FR-016, FR-018, FR-019.

- [ ] T074 [US4] Implementar apps/api/src/modules/enrollment/application/follow-up.ts y adaptador de IncidentFollowUp mediante EnrollmentCommand/auditoría existentes. **Dep.**: T073. **Fin**: Append-only, UNIQUE(actor,commandId), payload distinto409, autor/hora servidor; fallo de auditoría revierte anotación/resultado; cero cambios de pago/reserva/matrícula/plazo/bloqueante. **Traza**: FR-011, FR-015, FR-016, FR-019.

- [ ] T075 [US4] Completar apps/api/src/modules/enrollment/entrypoints/http/admin.controller.ts y composición para órdenes/incidencias/seguimiento. **Dep.**: T074. **Fin**: Rutas cerradas, permiso admin específico, errores seguros; no confirmar pago, matrícula, devolución, traslado, resolución o cancelación financiera manual. **Traza**: FR-015, FR-016, FR-019.

- [ ] T076 [US4] Completar apps/web/src/features/enrollment/api.ts y tipos/allowlists de apps/web/src/app/http.ts para vistas propias/administrativas separadas. **Dep.**: T072, T075. **Fin**: No serialización por spread ni notas administrativas arbitrarias al alumno; resumen autorizado de conciliación, sin claves proveedor/evidencia privada. **Traza**: FR-015, FR-016, FR-017, FR-019.

- [ ] T077 [US4] Implementar apps/web/src/features/enrollment/prices-page.tsx reutilizando GET/PUT real T022 con expectedRevision y commandId estable. **Dep.**: T076. **Fin**: Precio sin definir/PEN/desglose claros, conservar entradas ante conflicto y comparar datos sin sobrescribir; cambios no reprecian orden existente. **Traza**: FR-005, FR-011, FR-017.

- [ ] T078 [US4] Implementar apps/web/src/features/enrollment/{commitments-page,incidents-page}.tsx y rutas /admin/compromisos y /admin/incidencias/:id en app/router.tsx. **Dep.**: T077. **Fin**: Consulta/seguimiento autorizados, actor/momento y pendiente económica explícitos, sin botones de facultades no aprobadas. **Traza**: FR-015, FR-016, FR-017, FR-019.

- [ ] T079 [US4] Integrar navegación unificada propia en apps/web/src/features/enrollment/order-page.tsx, enrollments-page.tsx y apps/web/src/app/router.tsx. **Dep.**: T078, T054. **Fin**: Alumno consulta reservas/órdenes/matrículas incluso ocultas, historial original no revive; desconocido/ajeno404 seguro, cierre de sesión limpia y descarta respuestas tardías. **Traza**: FR-015, FR-016, FR-017, FR-018.

- [ ] T080 [US4] Adaptar apps/web/src/features/academic-offering/{group-form.tsx,admin-group-page.tsx,api.ts,validation.ts} para descripción opcional y error GROUP_COMMITMENTS_BLOCK_OPERATION, manteniendo sus rutas002. **Dep.**: T079, T018. **Fin**: Retiro antes de editar, revisión/republicación explícitas; explicar bloqueo sin datos financieros privados, solo textos/docente con compromisos; curso no se traslada ni sin bloqueantes. **Traza**: FR-014, FR-017, FR-021.

- [ ] T081 [US4] Ejecutar regresión PG/HTTP del guard con reserva, matrícula, incidencia, expiración e historial finalizado en specs/003-reservas-ordenes-matricula/evidence/us4.md. **Dep.**: T080, T069. **Fin**: Ambos órdenes de cancelación/pago y habilitación frente a reserva/confirmación demostrados; bloqueo/no cambio parcial y snapshots originales, notas no resuelven economía. **Traza**: FR-008, FR-014, FR-019, FR-021, FR-022.

- [ ] T082 [US4] Ejecutar T070–T072 y E2E US4.01–US4.13, más regresión002/identidad afectada, en specs/003-reservas-ordenes-matricula/evidence/us4.md. **Dep.**: T081. **Fin**: Tipos/lint/build y UNIT/PG/HTTP/E2E verdes según alcance; fixtures reales y conteos únicos/repetidos separados, sin atribuir aceptación humana. **Traza**: FR-005, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-021, FR-022.

- [ ] T083 [US4] Observar recorrido administrativo con responsable real y alumno cuando aplique en specs/003-reservas-ordenes-matricula/evidence/human-acceptance.md. **Dep.**: T082. **Fin**: Registrar uso real y comprensión de seguimiento pendiente, sin participantes/umbrales inventados; conservar tareas humanas001/002 abiertas hasta evidencia propia. **Traza**: FR-017, FR-019. **Puerta**: HUMANA.

**Checkpoint / prueba independiente**: US4.01–US4.13: T082 checkpoint técnico; T083 humana real. El guard común T017 ya protege reservas desde US1.

## Fase 7: Verificación transversal y puertas de aceptación

**Objetivo**: Regresión, CI mínimo, recuperación, documentación, seguridad y aceptación por evidencia; capacidad en etapa futura.

- [ ] T084 Ejecutar revisión técnica local integrada según quickstart.md y consolidar specs/003-reservas-ordenes-matricula/evidence/verification-results.json y specs/003-reservas-ordenes-matricula/evidence/acceptance.md. **Dep.**: T041, T055, T069, T082. **Fin**: UNIT/PG/HTTP/E2E locales, tipos de tests/config, lint/build/arquitectura y regresión afectada verdes; T059/HUMANA/D10/D13 separados; no cerrar aceptación integral con simulación. **Traza**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020, FR-021, FR-022, FR-024.

- [ ] T085 Ajustar mínimamente .github/workflows/v00-linux.yml con el runner E2E003 y tipado de soportes/config; documentar comandos en quickstart.md. **Dep.**: T084. **Fin**: Reutilizar npm/test:unit/test:integration/test:e2e y Compose; SDK/sandbox no corren con carga, secretos protegidos. CI remoto solo acreditado por ejecución real, sin elevar20min para ocultar fallos. **Traza**: FR-017, FR-022, FR-024.

- [ ] T086 Ensayar upgrade desde0005 y restauración de la nueva versión en destino separado en specs/003-reservas-ordenes-matricula/evidence/recovery.md y ops/recovery/README.md. **Dep.**: T084. **Fin**: Copias/restore probados con filas previas/nuevas, cuentas/config preservadas y runtime sin DDL; no asumir rollback de toda migración, sin reset/volúmenes eliminados o bootstrap manual. **Traza**: FR-022.

- [ ] T087 [P] Sincronizar README.md, docs/alcance-mvp.md y docs/01-analisis-de-sistema/{01-actores,02-historias-del-usuario,03-requisitos-funcionales}.md con código realmente verificado y anotar INV-DOC-01 en specs/003-reservas-ordenes-matricula/evidence/acceptance.md. **Dep.**: T084. **Fin**: Distinguir propuesto/implementado/verificado, mantener evidencia histórica y pendientes, sin trasladar disponibilidad al contrato002. **Traza**: FR-001, FR-002, FR-005, FR-006, FR-007, FR-008, FR-009, FR-014, FR-021, FR-022.

- [ ] T088 [P] Revisar datos/errores/logs y fronteras en specs/003-reservas-ordenes-matricula/evidence/security-review.md con pruebas negativas de HTTP y clientes financieros. **Dep.**: T084. **Fin**: No secretos/SQL/tarjetas/callbacks en DTO/logs/evidencias, no confirmación manual o simulatorproductivo, cuotas/CSRF preservadas; retención/custodia no aprobadas por revisar código. **Traza**: FR-015, FR-016, FR-019, FR-022, FR-024.

- [ ] T089 Completar aceptación humana integrada de cuatro historias en specs/003-reservas-ordenes-matricula/evidence/human-acceptance.md y specs/003-reservas-ordenes-matricula/evidence/acceptance.md, incluyendo US2/US3. **Dep.**: T042, T059, T069, T083, T084. **Fin**: Participantes/resultados reales separados de automatización y sandbox, teclado/móvil/escritorio y vacío/error/incierto; sin cerrar T073/T074/T104/T108 por estos resultados. **Traza**: FR-017, FR-018, FR-022. **Puerta**: HUMANA_D02.

- [ ] T090 Preparar y ejecutar ensayo operacional autorizado de24h y puertas D13 en specs/003-reservas-ordenes-matricula/evidence/operation.md, coordinado con VP004 y ops/recovery/README.md. **Dep.**: T059, T086. **Fin**: Plazo real86400s, salud de reloj/recuperación/recursos, incidencias sin pérdida; custodia/retención/RPO/RTO acordados antes de demo persistente. Reloj controlado/smoke no sustituye24h físicas. **Traza**: FR-004, FR-009, FR-013, FR-018, FR-022. **Puerta**: D13_AUTORIZACION.

- [ ] T091 Acordar escenario/rúbrica D10 y métricas separadas en verification.md y docs/planificacion/vps-evaluacion.md, trazado a VP001/VP002/VP003. **Dep.**: T084. **Fin**: ≥15000 cuentas, ventana/mezcla/duración de2500 activos, RPS/en vuelo/tasa reservas, recursos/costo≤S/300 y criterios expresamente aprobados; sin umbrales inventados o contratación. **Traza**: FR-023, FR-024. **Puerta**: D10.

- [ ] T092 Preparar cliente futuro load-tests/enrollment/ y preflight en docs/planificacion/evidence/vps-preflight.md, coordinado con VP005/VP006 y destino autorizado. **Dep.**: T091. **Fin**: k6 en otro equipo físico, allowlist HTTPS/CSRF/seguridad, datos ficticios/pagos simulados; recursos del generador y VPS separados, no alterar perfiles históricos o relajar cuotas. **Traza**: FR-023, FR-024. **Puerta**: D10_VP004_VP006.

- [ ] T093 Solo en etapa autorizada VP007/VP008, ejecutar carga y evaluar evidencia en specs/003-reservas-ordenes-matricula/evidence/load-vps.md y docs/planificacion/vps-evaluacion.md. **Dep.**: T059, T085, T086, T088, T090, T092. **Fin**: Autorización de entorno/ejecución y presupuesto previas; comparar D10 con errores/latencia/recursos/inventario finales y población; fallo conserva objetivo pendiente. No contratar, ejecutar carga completa o adoptar AWS al llegar automáticamente a esta tarea. **Traza**: FR-023, FR-024. **Puerta**: AUTORIZACION_VPS_D10_D13.

- [ ] T094 Cerrar aceptación del incremento en specs/003-reservas-ordenes-matricula/evidence/acceptance.md, verification.md y tasks.md solo con trazas de todas las puertas pertinentes. **Dep.**: T085, T086, T087, T088, T089, T090, T093. **Fin**: Diferenciar checkpoint técnico, sandbox, humanos, economía fuera de alcance y capacidad; pendientes reales impiden aprobación integral. Política económica no se implementa aquí y cobros reales siguen deshabilitados hasta aprobación propia. **Traza**: FR-022, FR-023, FR-024. **Puerta**: ACEPTACION_INTEGRAL.

**Checkpoint / prueba independiente**: Checkpoint técnico T084 distinto de T094 integral. D02, humana, D13 y D10 no se cierran con documentación o simulación.

## Restricciones literales obligatorias del modelo

Esta tabla forma parte de las descripciones/criterios de las tareas indicadas: no
deja nullable, enums, relaciones o unicidades a discreción de implementación. Se
transcriben campos y restricciones de data-model.md; T006/T008 deben probar sus
constraints reales, además de las reglas cruzadas transaccionales.

| Entidad / tareas | Campos mínimos literales | Integridad literal |
| --- | --- | --- |
| CoursePrice — T007/T021/T022 | courseId, amountMinor, currency=PEN, revision, changedBy, changedAt | Una fila por curso. Sin fila: no definido. Escritura administrativa bajo curso y revisión; detalle reservado no se actualiza. |
| AdmissionSequence — T007/T030 | id fijo, nextSequence | Fila creada por migración; contador transaccional, bloqueo hasta COMMIT de admisión. No secuencia de PostgreSQL como sustituto de prioridad durable. |
| DispatchState — T007/T031 | id fijo | Coordinadora distinta, sin reloj de negocio ni lease de cupo. Mutex hasta COMMIT de la decisión de la cabeza. |
| ReservationRequest — T007/T030/T033 | id, studentId, intentionId, selectionDigest, groupIds canónicos, admittedAt, admissionSequence, actorSessionReference, authVersion, state, decisionCode, decidedAt | UNIQUE(studentId,intentionId), UNIQUE(admissionSequence). Orden derivada de EnrollmentOrder.requestId único, sin FK inversa redundante. Misma selección/intención recupera resultado. No guardar cookie o token. |
| EnrollmentOrder — T007/T032/T033 | id, studentId, requestId, currency, totalMinor, state, revision, confirmedAt, expiresAt, expirationProcessedAt nullable | UNIQUE(requestId). RESERVED, ENROLLED o EXPIRED. Inicio/vencimiento inmutables; diferencia exacta 86 400 s. expirationProcessedAt registra materialización, no instante efectivo del vencimiento. Una orden con reservas vigentes por alumno. |
| EnrollmentOrderItem — T007/T032/T033 | id, orderId, courseId, groupId, priceMinor, courseName, groupName, periodStart, periodEnd, timeZone, groupStartAt, enrollmentValidUntil, scheduleSnapshot | UNIQUE(orderId,courseId). Un grupo del curso por selección. Detalle, dinero y condiciones originales inmutables. Límites civiles convertidos al confirmar reserva y conservados con el snapshot; matrícula copia su límite original, no lo recalcula tras cambios de tzdata. Relación curso/grupo comprobada bajo locks del dueño oferta. |
| SeatReservation — T007/T032/T033 | id, orderItemId, state | UNIQUE(orderItemId). Usa confirmedAt/expiresAt de su orden; no copiar relojes divergentes. CONFIRMED, CONVERTED, EXPIRED. |
| PaymentAttempt — T007/T049 | id, orderId, studentId, initiationId, payloadDigest, state, merchantReference, externalIdempotencyKey, providerScope, providerReference nullable, createdAt | UNIQUE(studentId,initiationId), FK compuesta (orderId,studentId). Una iniciación no resuelta por orden, referencia/clave estables antes de red. Replay conserva resultado y nunca despacha otra llamada. |
| ProviderReceipt — T007/T050 | id, providerScope, deliveryKey nullable, merchantReferenceHint, providerPaymentIdHint, normalizedEvidenceReference/digest, receivedAt, externalObservedAt nullable, state, processedAt nullable, terminalPaymentId nullable | Entrada/trabajo durable mínimo, no ledger económico. Sin FK provisional a orden que introduzca locks recibo→orden. Deduplicación de entrega solo si D02 acredita ámbito; recepción no es verificación final ni extiende reserva. |
| VerifiedPayment — T007/T051 | id, providerScope, providerPaymentId, orderId nullable, amount exacto y escala, currency real, merchantReference, verificationFinishedAt, reconciliationState, normalizedEvidenceReference | UNIQUE(providerScope,providerPaymentId), scope configurado proveedor/comercio/entorno. Solo APPLIED o INCIDENT terminales, confirmados con efectos/auditoría. APPLIED exige asociación/total/PEN exactos; hecho auténtico incompatible conserva valores reales como INCIDENT. Sin cuerpo arbitrario, tarjeta, tokens o secretos. |
| Enrollment — T007/T048/T051 | id, orderItemId, studentId, courseId, groupId, paymentId, confirmedAt, originalPeriodStart, originalPeriodEnd, timeZone, scheduleSnapshot, validUntil | UNIQUE(orderItemId). Pago aplicado a una sola orden y matrícula por cada detalle. validUntil es 00:00 del día siguiente a fecha final original, America/Lima convertido a UTC. |
| PaymentIncident — T007/T051 | id, orderId nullable, verifiedPaymentId, reason, affectedGroupIds, openedAt | Una incidencia por hecho/motivo, abierta, sin resolución económica. Solo asociación confiable vincula titular/grupos; referencia desconocida no adjudica alumno, usa grupos vacíos y no bloquea oferta arbitraria. Seguimiento administrativo mínimo. |
| IncidentFollowUp — T007/T074 | id, incidentId, adminUserId, commandId, recordedAt, content | Append-only; UNIQUE(actor,commandId) en ledger. No modifica compromisos ni resuelve incidencia. Proyección administrativa y resumen del alumno separados. |
| EnrollmentCommand — T007/T015 | actorKind, actorReference, commandId, operation, payloadDigest, outcomeCode, resourceReferences, resultingRevision, appliedAt | Clave (actorKind,actorReference,commandId); operación incluida en digest, sin namespace separado. Misma clave y operación diferente: conflicto. No reutilizar AcademicCommand ni duplicar payload privado en resultado. |
| EnrollmentAuditEvent — T007/T015/T032/T051 | id, actorKind/reference, operation, targetKind/id, commandId o providerEventId, effectKey nullable, requestId, occurredAt, before/afterRevision, result | Evento mínimo e inmutable; misma transacción que decisión/cambio/resultado. Para expiración, effectKey único (ORDER_EXPIRED,orderId); sin otro ledger del timer ni auditoría por cada sondeo. No fingir targetUserId ni acción GROUP_EDIT. |

Restricciones cruzadas de T007/T009/T014/T017/T029/T032/T034/T048/T051/T063:
capacidad1–50, índice único parcial sobre estado RESERVED sin predicado now(),
unicidad alumno/curso entre reservas y matrículas bajo cuenta del alumno,
86_400_000_000n, revisión positiva, fechas/franjas y límites originales congelados,
importe exacto sin flotantes. CHECK no promete suma entre filas, capacidad o D06.
PEN solo aplicable a órdenes/precios/pago APPLIED; evidencia económica incompatible
conserva moneda/importe/escala reales como INCIDENT sin FK inventada. Grupo.courseId
siempre inmutable y descripción nullable sin backfill; no mínimos comerciales nuevos.

## Dependencias e incrementos

Preparación T001–T004 → fundamentos T005–T022 → US1 T023–T041.
Luego núcleo local US2 T043–T055 y, sin esperar D02, US3 T060–T069 / US4 T070–T082.
D02 habilita T056–T059, nunca se reemplaza con un simulador productivo.
La normalización oportuna se implementa en T032, antes de poder crear otra orden;
US3 añade scheduler y recuperación, no una segunda regla. El guard T017/018 protege
antes del primer compromiso, aunque la UI administrativa completa sea US4.
Precios backend mínimos T021/022 son compartidos; US4 T077 añade su recorrido UI.
T042/T083/T089 son aceptación humana y pueden quedar pendientes sin bloquear
implementación técnica. T084 es checkpoint local; T094 exige las puertas aplicables.
T091–T093 reutilizan VP001–VP008 del backlog y no autorizan cargas/contratación
automáticas. La política económica aprobada antes de cobros reales permanece
externa al alcance de resolución de este incremento y documentada como bloqueo.

### Oportunidades paralelas por historia

- Fundamentos: T005/T006; tras T010, T011/T013/T019 en archivos independientes;
  DB de pruebas usa schemas propios y ejecución secuencial cuando comparta recursos.
- US1: T023–T028 pueden prepararse en archivos distintos tras fundamentos; no
  paralelizar implementaciones que editan reserve.ts/enrollment-store.ts/api.ts.
- US2: T043–T047 son suites distintas. La secuencia T049–T055 permanece ordenada
  por protocolo y archivos compartidos; no red dentro de locks para ganar paralelismo.
- US3: T060–T062 después de T051; T063–T069 secuenciales por módulo/consultas/UI.
- US4: T070–T072 después de T051; T073–T082 secuenciales por consultas/rutas/UI.

[P] identifica posibilidad de trabajo independiente con dependencias satisfechas,
no instrucción de lanzar agentes o pruebas PG concurrentes contra el mismo dataset.

## Estrategia y primer bloque

Primer bloque recomendado: **T001–T004**, inventario/entorno/fixtures/runner, con
evidencia y commit local, deteniéndose antes de fundamentos. Después T005/T006
(pruebas) y T007/T008 (modelo/migración aislada), conforme a autorización por bloque.

MVP técnico inicial: fundamentos + US1, reserva y consulta persistidas sin habilitar
cobros. Antes de demo persistente o publicación cumplir D13. Después verificar
US2 local + US3 + US4, adaptador real/sandbox y humanos por separado. Cada bloque
revisa diff, tipos/lint/build y regresión afectada, registra evidencia y commit;
no ejecutar toda la lista por interpretar un «siguiente bloque» como autorización global.
Smokes identidad solo si cambia el recorrido que comprueban, secuenciales y aislados.
No cargas/perfil10/25, cobros reales o servicios contratados durante esta generación.
