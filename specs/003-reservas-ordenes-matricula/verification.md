# Verificación integrada — reservas, órdenes y matrícula

**RV001/RP007, 2026-10-30, America/Lima. Diseño de verificación, cero pruebas de
producto implementadas o ejecutadas en esta etapa.** [Spec](spec.md), [plan](plan.md),
[tareas](tasks.md), [datos](data-model.md), [guía](quickstart.md),
[contratos](contracts/integration.md), [API/permisos](contracts/api.md),
[tiempo](contracts/time.md) y [pagos](contracts/payments.md) son las fuentes vigentes.
Las quince respuestas, constitución1.2.1 y el checklist12/16 no se modifican.

## Niveles, preparación y criterio de evidencia

- **UNIT**: reglas puras sin Nest/PG ni reloj global; adaptadores de tiempo y pruebas
  web cerradas por audiencia. Reloj controlado permite límites, no demuestra24h físicas.
- **PG real**: PostgreSQL del entorno aislado existente, schemas t_ propios, migración
  aditiva y rol runtime; dos conexiones/barreras observables y datos finales de todas
  las tablas. Inyección controlada de fallo no sustituye persistencia real.
- **HTTP real**: aplicación/Nest y PG reales, sesiones/CSRF/origen/permisos/propiedad,
  JSON estricto16KiB y cuotas actuales; no mocks para atribuir autorización o atomicidad.
- **E2E**: Playwright/Compose existentes, navegador→API→PG, teclado/móvil/escritorio.
  Fixtures ficticias y pagos simulados solo bajo test; no endpoints de aprobación productivos.
- **SANDBOX**: adaptador/procedencia y recuperación reales del proveedor, fuera de carga,
  con acceso/modalidad D02 acreditados; una simulación local no cumple este nivel.
- **HUMANA**: alumno/responsable reales, observación y resultados propios; pendiente
  si faltan participantes, sin personas/umbrales de uso inventados ni cierre de001/002.
- **OPERACIÓN/CAPACIDAD**: D13/24h y D10/VPS/k6 desde otro equipo, solo en su etapa
  autorizada con presupuesto. No ejecutar smokes,10/25VU, carga o servicios aquí.

Antes de cada suite: comprobar proyecto/destino/APP_ENV y mounts, conservar .env y
volumen existentes, manifestar commit/imagen/versión/PG/tzdata y fixtures separadas del
manual. Reutilizar tests/support/identity-database.ts, academic-offering.ts y locks.ts
a través de soportes003; no pools/destinos manuales ni bootstrap/reset/down-v.

Para cada caso registrar ID semántico, entradas, conexiones/barrera, comando, resultado
esperado/obtenido, filas/revisiones/auditoría finales y aserciones alcanzadas/no alcanzadas.
Separar infraestructura aprobada, comportamiento verde, rojo esperado y bloqueos.
Imports/config/sintaxis/fixtures no cuentan como rojo válido. No debilitar expectativas
o ampliar timeout para aprobar. Los55IDs TV/PV son referencias de diseño con cruces;
no afirmar55casos únicos o ejecuciones. Desglosar antes/igual/después y ambos órdenes
al preparar tests; reportar repeticiones UTC/Lima o proyectos de navegador aparte.

## Matriz de los24 requisitos

V001–V024 son agrupaciones de cobertura, no casos ejecutados. Las referencias T
se resuelven en tasks.md; cada fila requiere las pruebas de sus capas, no basta
que una tarea mencione el requisito.

| Verificación / requisito | Niveles | Preparación / acción | Resultado verificable | Tareas | Traza |
| --- | --- | --- | --- | --- | --- |
| V001 / FR-001 | UNIT/PG/HTTP/E2E | Oferta visible con/sin precio/docente habilitado/revisión; bloquear hasta cruzar00:00 inicial Lima; cambiar publicación tras preview/admisión. | Solo confirmación actual antes del corte; cero conjunto parcial. Catálogo/espera no dan cupo ni prioridad. | T023–T026,T029–T041 | US1;SC-001/005;RE-02 |
| V002 / FR-002 | UNIT/PG/HTTP/web | Capacidad1 y50; reservas/matrículas vigentes/ocultas, vencidas/finalizadas; conversión en vuelo cruzando límite. | Capacidad/retenciones/ocupación/disponibilidad separados, fórmula real evaluada tras locks; anomalía no clamp a0, error seguro.002 conserva NOT_CALCULATED. | T023,T026,T029,T034,T037,T044,T065 | US1/US3;SC-004/005;RE-02/06 |
| V003 / FR-003 | UNIT/PG/HTTP/E2E | Selección varios cursos, dos grupos de un curso, falta de cupo, orden previa activa y dos intenciones simultáneas. | Un grupo/curso, una orden activa y reserva previa al pago, todas juntas o ninguna, sin modificación voluntaria. | T023–T025,T029–T033,T035–T041,T049 | US1;SC-001/003/005/006;RE-01/02/10 |
| V004 / FR-004 | UNIT/PG/E2E/operación | TV01/02/06–12/22–24: instant exacto, desconexión/logout/reinicio y cliente alterado; ensayo real24h separado. | Diferencia86_400_000_000n e instantes originales; calendario/epoch/año10000 exactos; retraso no extiende. Control de reloj no acredita24h operacionales. | T005,T009,T025,T032,T038,T060–T069,T090 | US1/US3;SC-001/004;RE-03–06 |
| V005 / FR-005 | UNIT/PG/HTTP/E2E | Precio ausente/PEN, total manipulado, revisión vieja, cambio concurrente y orden anterior congelada. | Precio servidor; ausencia distinta de cero, dinero exacto y snapshot conservado. Rol admin requerido; sin mínimo/gratuidad inferidos. | T005,T009,T021,T022,T025,T032,T077 | US1/US4;SC-002;RE-01/02 |
| V006 / FR-006 | UNIT/PG/HTTP/E2E | Selección multigrupo y precio cambiado después de confirmar. | Una orden desglosada con suma exacta, un pago por total y matrícula por cada detalle; sin pagos parciales. | T023,T029,T032,T033,T038,T043,T048,T051 | US1/US2;SC-002/003;RE-01/02 |
| V007 / FR-007 | UNIT/PG/HTTP/sandbox | PV01–03/10–16/21–24/29: auténtico/inválido/no confirmado, IDs/dinero y límite estricto. | Únicamente fin de comprobaciones servidor antes de expiresAt permite aplicar; recepción o éxito navegador no verifica. D02 debe acreditar autenticidad real. | T043–T059 | US2;SC-003/004;RE-05/07/08 |
| V008 / FR-008 | UNIT/PG/HTTP/E2E | Pago completo, ocultamiento, D06 propio/auto-exclusión y fin original de grupo; historial tras editar. | Una matrícula/detalle, validUntil original exclusivo Lima, sin segunda plaza o parcialidad; pago inaplicable incidencia sin resolución económica. | T043,T044,T048,T051,T053–T055,T067,T081 | US2/US4;SC-003/004/005;RE-01/08/09 |
| V009 / FR-009 | UNIT/PG/HTTP/E2E | TV13–20/25, PV03–10: vencer, retardo, doble worker, reinicio, pago/último cupo. | Vencimiento efectivo al límite; una normalización/efecto/auditoría, sin doble liberación o gracia; recibo técnico no extiende. | T025,T032,T044,T051,T060–T069 | US3;SC-004/005;RE-04–06/08 |
| V010 / FR-010 | PG real | Fallar segundo detalle, conversión, registro de resultado o auditoría; múltiples grupos y worker concurrente. | COMMIT de conjunto/resultado/auditoría o rollback total; cero cambios parciales. Aserciones posteriores en todas las tablas. | T013–T015,T025,T032,T033,T044,T051,T061 | US1–US3;SC-005;RE-02/06–08 |
| V011 / FR-011 | UNIT/PG/HTTP/E2E | IntentionId/commandId/initiationId iguales/distintos, simultáneos, respuesta perdida, COMMIT ambiguo y eventos fuera de orden. | Identidad canónica única conserva fecha/referencias; contenido distinto409. Autorización actual antes de replay; no nuevo cobro, plazo, matrícula o ledger duplicado. | T013,T015,T021,T024,T030,T033,T044,T045,T049–T052,T071,T074 | US1/US2/US4;SC-003/006;RE-01/03/04/07 |
| V012 / FR-012 | PG real | Último cupo y admisiones en orden contrario a clic/reloj/respuesta/commit intentado; cabeza bloqueada y reinicio. | RA-02 por contador transaccional/admisión durable y menor secuencia; nadie salta cabeza/SKIP LOCKED, ni sobrevende. | T024,T025,T030–T033,T040 | US1;SC-005;RE-02 |
| V013 / FR-013 | PG real | Pago final, vencimiento, reasignación, cancelación y GET cruzando expiresAt en ambos órdenes. | Resultado serializable por protocolo común: conversión o vencimiento/incidencia, sin resurrección/consumo doble ni cifra transitoria de cupo; t posterior a locks. | T013,T025,T044,T051,T061,T065,T081 | US1–US4;SC-004/005;RE-05–09 |
| V014 / FR-014 | UNIT/PG/HTTP/E2E | Cada tipo bloqueante, solo historial, cancelación directa y metadatos/horarios/capacidad/docente. | Con bloqueantes solo textos/docente tras retiro/revisión/republicación; cancelar/período/horarios/capacidad bloqueados. Curso siempre inmutable. Sin cancelación voluntaria financiera ni historial reactivado. | T016–T018,T070–T072,T080–T083 | US4;SC-005/006;RE-09/10 |
| V015 / FR-015 | UNIT/PG/HTTP/E2E | Matriz de seis permisos por cuatro actores, cada ruta propia/ajena, sesión revocada/rol cambiado y SYSTEM falso. | Admin precio/consulta/seguimiento, alumno propio, docente/visitante denegados. Reautorización transaccional; no datos/efectos en denegación. | T011,T012,T019,T021,T024,T026,T035,T046,T071,T075,T088 | US1–US4;SC-006;RE-10 |
| V016 / FR-016 | HTTP/UNIT web/revisión | Proyecciones/logs/errores por audiencia; notas administrativas, referencia desconocida y causas privadas de docente. | Campos cerrados,404 ajeno seguro, sin credenciales/callback/SQL/sesión/tarjeta/evidencia privada. Alumno solo resumen autorizado; desconocido solo admin mínimo. | T019,T020,T026,T046,T071,T073,T076,T088 | US1–US4;SC-006;RE-07/09/10 |
| V017 / FR-017 | UNIT web/E2E/HUMANA | Cuatro recorridos con carga/vacío/validación/conflicto/error/incierto y teclado/móvil/escritorio. | Espera≠reserva, pago pendiente≠matrícula y seguimiento≠resolución. Confirmaciones respaldadas por servidor, entradas conservadas y foco/labels accesibles; humanos reales separados. | T027,T028,T037–T042,T047,T054,T062,T066,T072,T077–T083,T089 | US1–US4;SC-007;RE-03 |
| V018 / FR-018 | PG/HTTP/E2E | Desconexión/reinicio antes/después de COMMIT, logout y retorno; pérdida de respuesta de iniciación y callback posterior. | Consultar por titular e identidad durable sin sesión abierta24h; sin reenvío automático al login o cobro ciego. COMMIT incierto consulta antes de reejecutar. | T024–T028,T031,T038,T044,T045,T049,T052,T060–T069,T079 | US1–US4;SC-001/004/007;RE-03/04 |
| V019 / FR-019 | PG/HTTP/E2E/revisión | Fallo de auditoría, duplicados de efectos y follow-up repetido/distinto. | Actor/origen/referencia/instante/resultado mínimos, transacción atómica, seguimiento append-only. No cierra incidencia ni cambia dinero/compromiso/plazo/guard. Retención D13 pendiente. | T013,T015,T021,T032,T044,T051,T061,T070,T071,T074,T078,T088 | US2–US4;SC-004/006;RE-07–09 |
| V020 / FR-020 | UNIT/PG/HTTP/E2E | Dos intenciones del mismo alumno, nueva tras vencer, replay anterior y cancelación/modificación directa. | Como máximo una orden con reservas vigentes; rechazo no retiene. Nueva intención sin sanción/espera adicional por abandono; anterior no renueva. Varias cuentas no resueltas. | T023–T025,T029,T032,T038,T062,T066,T071 | US1/US3/US4;SC-006;RE-01/10 |
| V021 / FR-021 | UNIT/PG/HTTP/E2E | Retiro/habilitación frente a reserva/pago, sustitución docente, republicación/historial, ocurrencias comunes/contiguas/ocultas. | PA-01–PA-05/E1 conservados; reactivar no republica, reservas/plazas/plazo y matrículas previas intactos; pago oculto incidencia total. D06 usa ocurrencias originales, excluye auto-reserva y vencidos/finalizados. | T016–T018,T023,T025,T029,T032,T043,T044,T048,T051,T070,T080,T081 | US1/US2/US4;SC-001/003/005;RE-02/09 |
| V022 / FR-022 | Inventario/arquitectura/PG/restore | Hashes/entornos, migración desde0005 y restore aislado; regresión identidad/oferta y configuración. | Sin tocar manual, migraciones históricas, cuentas o evidencia. Pendientes001/002/bootstrap siguen reales; restore no supuesto. CI remoto/SMTP externo solo con evidencia propia. | T001–T004,T006–T008,T010–T022,T039,T040,T081,T084–T090,T094 | Transversal;principiosI/II/IX/X;RE-04/09/10 |
| V023 / FR-023 | VPS/capacidad posterior | VP001–VP008/D10: población, mezcla/ventana/duración, generador externo, recursos y costo. | Distinguir≥15000 cuentas/2500 activos/RPS/en vuelo/tasa reservas. Sin rúbrica o evidencia suficiente objetivo pendiente; S/300 total, sin adopciónAWS o extrapolar1000 históricos. | T091–T094 | SC-008;RC-01/02/07;D10 |
| V024 / FR-024 | Test local/sandbox/capacidad separados | Simulador solo fixtures, proveedor real sandbox separado, controles de cobros/operación. | Simular no acredita Izipay; pasarela no recibe carga. Cobros reales bloqueados hasta política/procedimiento económico aprobado y demás puertas; sin devolución/traslado/asignación manual en alcance. | T046,T050,T055–T059,T084,T088,T091–T094 | PrincipiosV–VII/XI;RA-04;D02/D05/D10 |

## Trazabilidad de fuentes confirmadas

| Fuente | Cobertura | Tareas principales |
| --- | --- | --- |
| RC-03: reserva antes de pago | V001/V003/V006/V007 | T023–T041/T049 |
| RC-04:24h exactas | V004/V009/V018 | T005/T009/T032/T060–T069/T090 |
| RC-05: pago verificado confirma matrícula | V007/V008/V011 | T043–T059 |
| RC-06: vencimiento/conciliación libera sin sobreventa | V009/V010/V013 | T032/T044/T051/T060–T069 |
| RC-01/02/07: población, concurrencia y presupuesto | V023/V024 | T091–T094 y VP001–VP008 |
| HU10 / RF11 | US1/US3, V001–V006/V009–V013/V017/V018 | T023–T041/T060–T069 |
| HU11 / RF12/RF13 | US2/US3, V007–V014/V018/V019/V024 | T043–T069/T074/T081 |

## Criterios de éxito y puertas

| Criterio | Verificación / tareas | Condición de aceptación |
| --- | --- | --- |
| SC-001 | V001/V003/V004/V018/V021; T040/T041/T067/T069 | Todas las reservas86.400s exactas; cero fuera de corte/condiciones, replay/retirada/inicio no renuevan ni acortan. |
| SC-002 | V005/V006; T021/T022/T040/T055/T077 | 100% de casos de manipulación/precio/conjunto usan desglose/total PEN servidor conservado; cero importe cliente aceptado. |
| SC-003 | V003/V007/V008/V011/V021; T040/T055/T059/T067/T081 | Matrícula/detalle y vigencia original; cero duplicación, matrícula oculta/incompatible, auto-conflicto o rechazo por contiguos sin conflicto efectivo. |
| SC-004 | V004/V009/V013/V019; T055/T067/T069/T074 | Cero extensión/doble liberación; 100% de verificación igual/tardía incidencia sin matrícula/reembolso; seguimiento no resuelve. |
| SC-005 | V010/V012/V013/V014/V021; T040/T055/T067/T081 | Último cupo como máximo uno y prioridadRA02; cero sobreventa/parcialidad/cancelación o cambio protegido con bloqueantes, historial preservado. |
| SC-006 | V011/V014–V016/V019/V020; T040/T055/T071/T074/T082/T088 | 100% matriz/propiedad aprobadas, una orden vigente e intenciones rechazadas sin retenciones; sin cancelación financiera, penalización por abandono o garantía multicuentas. |
| SC-007 | V017/V018; T041/T042/T055/T068/T082/T083/T089 | Cuatro recorridos teclado/móvil/escritorio, vacío/error/incierto y confirmaciones respaldadas; automatización y humanos separados. |
| SC-008 | V023/V024; T091–T094, VP001–VP008 | ≥15000cuentas,2500activos/RPS/en vuelo/reservas/recursos/costo separados. D10/rúbrica/escenario pendientes: capacidad no aprobada por este plan. |

## Cobertura de escenarios de aceptación

USx.nn corresponde al ordinal del Acceptance Scenario del spec, sin renumerarlo.
Las47 entradas se cubren a través de estos rangos completos; cada variante concreta
se identificará al preparar pruebas. Checkpoint independiente por historia en tasks.md.

| Escenarios del spec | Conducta | Tareas | Verificación |
| --- | --- | --- | --- |
| US1.01–04 | Reserva previa, espera no reserva, dinero servidor y replay tras respuesta perdida | T023–T041 | V001/V003–V006/V011/V018 |
| US1.05–10 | Último cupo/prioridad, conjunto atómico, precio congelado, orden única y una orden vigente | T024,T025,T029–T033,T038,T040,T041 | V003/V005/V006/V010/V012/V020 |
| US1.11–14 | Curso/grupo único, compromiso vigente, corte Lima y revalidación tras cambios | T023–T026,T029,T032,T040,T041 | V001/V003/V008/V021 |
| US1.15–17 | Plazo conservado tras inicio/replay, solapamiento efectivo y adyacencia permitida | T023,T025,T029,T032,T038,T040,T041 | V001/V004/V020/V021 |
| US2.01–04 | Pago auténtico completo, navegador no autoridad, alterados y duplicados | T043–T059 | V006–V008/V010/V011/V024 |
| US2.05–08 | Carrera/vencimiento/incidencia, reinicio y vigencia original de matrícula | T043,T044,T048,T051,T053–T055,T059 | V004/V007–V009/V013/V018 |
| US2.09–12 | Ocultamiento, republicación, matrícula previa conservada y D06 sin auto-conflicto | T043,T044,T048,T051,T054,T055,T059 | V008/V014/V021 |
| US3.01–05 | Reloj cliente, vencimiento, retardo/reinicio, repetición y último cupo frente a pago | T060–T069,T090 | V004/V009/V013/V018 |
| US4.01–04 | Consulta propia, permiso, cancelación bloqueada y resultado incierto | T070–T083 | V014–V018 |
| US4.05–09 | Orden activa, seguimiento, docente/visitante, economía pendiente y no cancelación voluntaria | T070–T083 | V014–V020 |
| US4.10–13 | Nueva intención tras vencer, datos protegidos, sustitución docente e historial sin reactivar | T070–T083 | V014/V018/V020/V021 |

## Casos límite de origen

| Caso | Cobertura integrada | Casos temporales/financieros y tareas |
| --- | --- | --- |
| RE-01 | V003/V006/V008/V011/V020 | TV01/02/05/11; PV10–13/21; T024/T025/T044/T045/T067 |
| RE-02 | V001/V003/V005/V010/V012/V021 | TV04/06/10/17–19; T024/T025/T040 |
| RE-03 | V004/V011/V017/V018 | TV11/22; PV09/21/22; T027/T028/T045/T062 |
| RE-04 | V004/V009/V018/V022 | TV12/13/21; PV07–09/22/24; T025/T044/T061/T064 |
| RE-05 | V004/V007/V009/V013 | TV01–09/24/25; PV02–07; T005/T009/T043/T061/T067 |
| RE-06 | V002/V009/V010/V013 | TV13–21/25; PV04–10/25/26; T026/T044/T061/T063 |
| RE-07 | V007/V011/V016/V019 | PV08–16/21–24/27/29; T044–T046/T055/T059 |
| RE-08 | V007–V009/V013/V019 | TV03/25; PV02–09/17/19/28; T044/T051/T061/T074/T081 |
| RE-09 | V008/V014/V016/V019/V021 | TV23; PV17–20/28/30; T016–T018/T070–T083 |
| RE-10 | V003/V015/V016/V018/V020 | TV11/17/18/22; PV21/24/27; T024/T025/T046/T062/T071 |

## Integración TV/PV sin duplicar autoridades ni conteos

[TV01–TV25](temporal-verification.md) y [PV01–PV30](payment-verification.md) conservan
sus IDs y expectativas. Esta tabla asigna implementación/verificación futura; no
cambia la duración, punto de verificación ni precedencia aprobada.

| IDs de diseño | Tareas | Alcance / dependencias |
| --- | --- | --- |
| TV01–TV09 | T005/T009/T023/T025/T043/T067 | Precisión/civil/límites, incluida verificación financiera PV02/03. |
| TV10–TV12 | T013/T025/T032/T040/T044/T061/T067 | Rollback, COMMIT incierto y reinicio. |
| TV13–TV20 | T025/T032/T044/T060/T061/T063/T067 | Vigencia efectiva, normalización única, oportuna y barrido. |
| TV21–TV24 | T027/T038/T060/T062/T064/T066–T068/T090 | Single-flight, UI/reloj, historial y salud operativa separada. |
| TV25 | T044/T051/T061/T065/T067 | Recibo/finalizador contra expiración; comparte PV03–PV10, no doble conteo. |
| PV01–PV10 | T043/T044/T048–T052/T055/T061/T067 | Conversión, límite, carreras, recibo pendiente, rollback y COMMIT ambiguo. |
| PV11–PV20 | T043/T044/T046/T051/T055/T070/T081 | Duplicados/hechos incompatibles, integridad/correlación y mantenimiento. |
| PV21–PV24 | T045/T046/T049/T052/T055 | Iniciación canónica, inciertos/respuesta tardía, reintento definitivo y logout. |
| PV25–PV28 | T026/T034/T044/T051/T055/T065/T071/T081 | Lectores postlocks, referencias cubiertas, autorización y seguimiento sin resolver. |
| PV29 | T056–T059 | Proveedor real, puerta D02; no se aprueba con test local. |
| PV30 | T044/T047/T055/T068/T082/T084/T089 | Recorrido completo y datos finales; humanos separados. |

## Autorización y privacidad por operación

La matriz cerrada de seis permisos de [API](contracts/api.md#transporte-y-permisos)
se comprueba para **cada ruta**: admin, alumno titular/ajeno, docente y visitante;
cuenta desactivada, rol cambiado, sesión revocada/expirada y CSRF/origen inválidos.
GET propio y POST de replay siguen reautorizando. Admin académico no obtiene permiso
financiero implícito. ADMIN no reserva/paga como alumno; TEACHER no lee ni lo ajeno
ni lo propio financiero. SYSTEM solo compone el finalizador auténtico, incluso tras
logout del alumno, nunca un valor aceptado del cuerpo o un admin ficticio.

Para pago técnico verificar procedencia real D02; no confundir entrega auténtica
con pago aplicable, ni dato de navegador con evidencia. Un recibo falso no crea
bloqueante financiero; referencia económica auténtica desconocida no adjudica alumno
o grupo. Admin ve lo mínimo investigable, alumno no obtiene ese hecho por adivinar
referencia. Notas internas, claves/tokens, callbacks, SQL y causas privadas no salen
en DTO/log/error. Probar allowlist exacta y exclusión de campos, no solo status HTTP.

## Protocolo de concurrencia que deben demostrar las pruebas

Observar barreras reales en cada intercalado, invertir el orden y consultar el
estado final desde una conexión nueva tras COMMIT/ROLLBACK. Cubrir cuentas→sesión
cuando usuario→cursos→grupos→órdenes→intentos→recibos→pagos→matrículas/incidencias→auditoría,
según contratos y prefijos separados AdmissionSequence/DispatchState. No locks tardíos,
upgrades o transacciones anidadas; única captura temporal después de todos los locks.

Admisión durable no es reserva. Despacho espera menor secuencia sin saltar cabeza;
revocación real rechaza con resultado/auditoría, fallo temporal deja pendiente.
Normalizador compartido T032 recibe el mismo token de la reserva nueva, incluso si
sus grupos anteriores no están en selección. Worker no tiene otro algoritmo/ledger.

La red de pago queda fuera de locks. Recibo técnico no tiene hora final de verificación;
APPLIED/INCIDENT y sus efectos/auditoría confirman juntos. Si finalización termina
antes del plazo y confirma después, un lector crítico espera locks y proyecta en
otra sentencia READ COMMITTED; no publica un cupo transitorio. Si vencimiento/reasignación
confirman primero, recibo previo no recupera plaza. Igualdad o posterior siempre
incidencia auténtica, sin nueva reserva/matrícula/gracia. Dinero incompatible conserva
valores reales y no se falsifica como PEN.

Misma identidad económica conserva asociación/fecha. Otra transacción económica de
orden matriculada genera incidencia, sin otra matrícula. COMMIT incierto consulta
canónico; resultado desconocido de iniciación no autoriza otro cobro. Respuesta externa
tardía no rebaja terminal. Rollback completo y auditoría deben probarse con aserciones
posteriores, sin confundir controles del helper con protocolo académico.

Un solo presupuesto de accountTransaction:3 intentos para40001/40P01/cambio de topología
tras rollback confirmado;55P03 no crea bucle inmediato. Reintentos de trabajo técnico
son redescubrimiento futuro, no autorizan reenviar cobro. Orden de sondeo no cambiaRA02.

## Comandos, CI y registro futuro

Usar los cuatro bloques de [quickstart.md](quickstart.md) solo tras implementar
sus soportes; no se ejecutaron aquí. Reutilizar npm run lint/build/test:unit,
test:integration, test:crypto-mail y test:e2e con playwright.enrollment.config.ts.
El build no tipa por sí solo todos los tests/fixtures/config; T004 exige comprobación
selectiva real y lint del config. Las suites PG/HTTP en tests/integration se descubren
por script actual; nuevas rutas de dominio por test:unit. T085 añade solo step/config
E2E003 al workflow existente, sin nuevos servicios o aumento automático de20min.

Cada evidence/usN.md debe listar pruebas escritas, descubiertas/ejecutadas/verdes,
rojas por regla ausente y aserciones no alcanzadas. Mantener las marcas pendientes
cuando no cumplan sus criterios; un checkpoint no se cierra por revisar documentación.
Evidencia automatizada, humanos, sandbox, operación y capacidad llevan resultados separados.
Smokes de identidad solo si cambian sus recorridos, secuenciales y aislados; no
repetirlos por cambios solo documentales o por obligación de llenar un informe.

## Puertas y continuidad

- D02/T056–T059: modalidad/authenticidad/IDs/dinero/idempotencia/consulta/acuse y
  acceso real a sandbox pendientes. Núcleo local puede probarse mediante fixtures
  explícitas; no hay integración del proveedor aprobada ni endpoint simulador productivo.
- RA-04/D05: política y procedimiento económicos aprobados **antes de cobros reales**.
  Seguimiento no resuelve incidencia; devolución/traslado/asignación manual fuera del spec.
- D13/T086/T090: salud de reloj, upgrade/restore, custodia/retención/RPO/RTO y operación
  antes de demo persistente/publicación. Ensayo24h físico distinto de reloj controlado.
- D10/T091–T093/VP001–VP008: escenario/rúbrica/recursos/costo y autorización de VPS/k6
  externo antes de ensayos. SC-008 y objetivo2500 no aprobados. Presupuesto S/300 total.
- T042/T083/T089: humanos reales, no simular participantes. T073/T074 de002 y
  T104/T108 de001 permanecen independientes. T103 mantiene informe sin capacidad aprobada.
- Bootstrap, timeouts históricos arquitectura/B02/D10E2E, CI remoto, SMTP externo y
  INV-DOC-01 siguen con su evidencia; T087 propone sincronizar fuentes, no lo cierra hoy.

RV002 se materializa en T024/T025/T044/T061, RV003 en T044/T046/T056–T059/T081
y RV004 en T071 y apps/web/tests/e2e/enrollment.spec.ts (T072/T082), con recorridos
US1/US2/US3 en sus suites específicas. Solo generar tareas no completa RV002–RV004.
Al terminar planificación RV001/RP007, el primer bloque concreto es T001–T004.
No implementación, esquema, pruebas de producto, smokes o servicios en esta etapa.
