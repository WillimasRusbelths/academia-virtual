# Backlog trazable — reservas, matrícula y VPS

Planificación del 2026-10-23; CT001 verificada en continuidad de oferta, RP001 en el
inventario, RP002 como borrador/checklist, RP003 con tres rondas de aclaración y RP004
como plan base, RP005 temporal y RP006 de conciliación del 2026-10-30. Hay siete tareas
documentales/continuidad completas y 15 pendientes;
este backlog no autoriza implementar reservas, matrícula ni VPS.
[Requisitos RC, decisiones RA y escenarios RE](reservas-capacidad.md).
Numeración 003 confirmada: se conservan el inventario RP001 y su evidencia; RP002
añade `spec.md` y checklist en ese directorio. RP003 resuelve/delimita el núcleo
funcional; RP004 prepara plan/modelo/contratos/guía, con puertas D02/D05/D10/D13
explícitas y sin aprobación global. RP005 concreta reloj/worker y RP006 conciliación;
RV001 integrará las matrices antes de RP007;
todavía no existe tasks.md de implementación ni se ejecuta código o migraciones.
Las tareas de oferta [002](../../specs/002-oferta-academica/tasks.md) conservan IDs,
checkboxes y dependencias; este backlog no las mezcla ni renumera.

## Especificación futura

- [X] RP001 Inventariar interfaces/estado real de oferta e identidad en `specs/003-reservas-ordenes-matricula/research.md`, con base, pendientes reales de 002 al iniciar ese spec y contratos consumibles; sin cerrar tareas de 002. Dep.: revisión del checkpoint disponible. RC-03/05; RE-09/10.

RP001: [inventario](../../specs/003-reservas-ordenes-matricula/research.md) y
[revisión](../../specs/003-reservas-ordenes-matricula/evidence/rp001-results.json),
base adca8e6 desde oferta, rama `docs/003-reservas-inventario`. Contratos públicos,
dependencias ausentes y RA-01–RA-06 diferenciados; T073/T074 de 002 siguen pendientes.
Sin pruebas nuevas de producto ni operaciones sobre bases/entornos. RP002 es el
siguiente bloque; no se ejecuta specify/clarify/plan en RP001.

- [X] RP002 Ejecutar specify y redactar `specs/003-reservas-ordenes-matricula/spec.md` y checklist con RC-01–RC-07, historias priorizadas de reserva/orden/pago verificado/matrícula y RE-01–RE-10; distinguir lo confirmado de RA-01–RA-06, sin implementación. Dep.: RP001.

RP002 completa en su alcance documental: [borrador](../../specs/003-reservas-ordenes-matricula/spec.md),
[checklist](../../specs/003-reservas-ordenes-matricula/checklists/requirements.md) y
[revisión](../../specs/003-reservas-ordenes-matricula/evidence/rp002-results.json).
Cuatro historias, 24 FR, ocho SC y diez casos RE; checklist 10/16, seis pendientes,
sin declaración de preparación para plan ni aceptación funcional. Se registran dos
respuestas parciales: reservas todas juntas o ninguna y referencia al terminar
verificación servidor; composición de orden/pago, límite exacto/tardío, precios y
demás reglas quedaban abiertos en ese checkpoint. En el cierre RP002, RP003 quedaba pendiente;
las respuestas siguientes actualizan el spec sin reescribir la evidencia RP002.
Sin migraciones ni código.

- [X] RP003 Ejecutar clarify y registrar respuestas RA-01–RA-06 en el futuro `spec.md`: reserva múltiple/atomicidad, prioridad, pago exacto/tardío, reembolsos, cancelación y abuso; conservar bloqueos si faltan respuestas. Dep.: RP002; D01/D03–D06.

RP003, primera ronda del 2026-10-30: cinco preguntas y cinco respuestas integradas en el
[spec](../../specs/003-reservas-ordenes-matricula/spec.md): precio por curso en PEN
fijado por administrador y conservado 24 h; una orden desglosada/un pago total/una
matrícula por curso y grupo elegido; verificación terminada antes de vencer,
incidencia al vencer o después sin matrícula/reembolso automáticos; una sola orden
con reservas vigentes por alumno; y bloqueo de cancelación de grupo con reservas
vigentes, matrículas o incidencias de pago sin resolver. Checklist
10/16 → 11/16: desaparecen las marcas de aclaración, pero permanecen cinco
criterios pendientes y otras reglas abiertas. Las notas del checklist son el
registro RP002 conservado; sus marcas se reevaluaron contra el spec actualizado.
En el cierre de esa primera ronda RP003 seguía pendiente: alcanzado el máximo
de cinco preguntas, se diferían prioridad RA-02, resolución económica/responsables RA-04, cancelación
voluntaria/cambios/resto de RA-05, reiteraciones/excepciones/resto de RA-06,
condiciones/unicidad PD-02, matriz PD-03 y D03/D06/D10/D13. La siguiente ronda de
clarify debe resolver o delimitar expresamente estos bloqueos; no habilita RP004/plan
ni implementación. [Revisión documental RP003](../../specs/003-reservas-ordenes-matricula/evidence/rp003-results.json).

RP003, segunda ronda del 2026-10-30: otras cinco preguntas y cinco respuestas,
con base 5dc380e; las cinco respuestas previas y su JSON quedan intactos. Se
confirman RA-02 (admisión autenticada/válida y secuencia servidor), unicidad vigente
alumno/curso y un grupo por curso, matriz PD-03 (alumno propio, administrador consulta
y seguimiento; docente/visitante sin acceso financiero) y vigencia D03 (confirmación
por pago hasta fin de fecha final del grupo America/Lima). RA-04 se delimita a
incidencia/seguimiento sin devolución/traslado/asignación manual; resolución económica
previa a cobros reales y seguimiento sin cerrar incidencia ni desbloquear cancelación.
Checklist **11/16 → 11/16**, sin nuevas casillas ni regresiones; notas históricas
conservadas. Constitución 1.2.1 sincroniza aprobación existente, sin cambiar principios.
Al cerrar la segunda ronda, RP003 seguía pendiente por condiciones de oferta PD-02, cancelación/cambios RA-05,
reiteraciones/excepciones RA-06 y conflictos D06. D10/D13 conservan sus etapas.
Siguiente bloque: otra ronda de clarify sobre esos bloqueos; todavía sin plan,
tareas de implementación ni código. [Revisión de segunda ronda](../../specs/003-reservas-ordenes-matricula/evidence/rp003-round2-results.json).

RP003, tercera ronda del 2026-10-30, base 9b0706c: cinco preguntas y cinco
respuestas nuevas, conservando las diez anteriores y todos los informes históricos.
Se confirman elegibilidad/corte de inicio PD-02, pausa de pago/confirmación por
ocultamiento sin acortar/extender compromisos, exclusión de cancelación/modificación
voluntaria y nueva intención tras vencer sin penalización/espera adicional por abandono.
RA-05 precisa bloqueantes vigentes y permite textos/docente según 002, protegiendo
curso/período/horarios/capacidad y conservando historial finalizado sin reactivarlo.
D06 impide solapamientos efectivos propios incluso ocultos; contiguos permitidos,
vencidos/finalizados excluidos, sin parcialidad y con incidencia si ya hay pago.
RA-01–RA-06/PD-01–PD-03 resueltas o delimitadas: RP003 completa en su alcance de
aclaración, sin implementación. Checklist **11/16 → 12/16**: pasan los resultados
de escenarios; sin regresiones. Quedan cuatro criterios globales pendientes por
condiciones de evaluación D10 y dependencias externas/operativas. Las notas del
checklist conservan el checkpoint RP002 por la instrucción de solo cambiar marcas.
No representan el estado corriente; esta revisión y el spec lo actualizan.
D02/sandbox, política/procedimiento económico antes de cobros reales, D10/capacidad
y D13/operación permanecen como puertas. Siguiente bloque: RP004/plan del núcleo
funcional, sin implementar ni prometer capacidad o habilitar cobros.
[Revisión de tercera ronda](../../specs/003-reservas-ordenes-matricula/evidence/rp003-round3-results.json).

- [X] RP004 Planificar contratos públicos, identidad de reserva/orden/matrícula y estados en futuros `plan.md`, `data-model.md` y `contracts/`; confirmar disponibilidad/consumo de capacidad y migración aditiva después de RP003, sin alterar cuentas o evidencia de 002. Dep.: RP003; RC-03/05/06, RE-01/02/09.

RP004 completa únicamente diseño base: [plan](../../specs/003-reservas-ordenes-matricula/plan.md),
[investigación](../../specs/003-reservas-ordenes-matricula/research-rp004.md),
[datos](../../specs/003-reservas-ordenes-matricula/data-model.md),
[contratos](../../specs/003-reservas-ordenes-matricula/contracts/integration.md) y
[guía local futura](../../specs/003-reservas-ordenes-matricula/quickstart.md).
RP001 se conserva íntegro dentro de research con un anexo actual; quince respuestas,
checklist 12/16 y constitución 1.2.1 sin cambios. Se diseñan participantes públicos
de una misma transacción, dos coordinadoras de admisión/despacho, inventario desde
compromisos vigentes, identidades idempotentes y snapshots no reactivables.
Migración solo prevista después de 0005, sin SQL generado/aplicado. Autorización,
privacidad y pruebas UNIT/PG/HTTP/E2E trazadas; no son resultados de producto.
RP005 y RP006 conservan sus casillas pendientes: falta diseño especializado de reloj,
worker/normalización y matriz completa de verificación/conciliación/reasignación.
RV001 y RP007 tampoco se cierran por esta guía. D02/sandbox, economía antes de cobros
reales, D10/capacidad y D13/operación permanecen abiertos en sus etapas.
Siguiente bloque: RP005; después RP006, RV001 y RP007, sin saltar a implementación.
[Evidencia documental](../../specs/003-reservas-ordenes-matricula/evidence/rp004-results.json).

- [X] RP005 Diseñar en futuros `research.md`/`data-model.md` plazo persistido de 86 400 segundos, reloj servidor, límites exactos, reinicio y ejecución diferida idempotente; ninguna extensión por reintento/desconexión/worker retrasado. Dep.: RP003/RP004; RC-04, RE-03–RE-06.

RP005 completa solo diseño de reloj/límites y ejecución diferida:
[contrato T01–T07](../../specs/003-reservas-ordenes-matricula/contracts/time.md),
[modelo actualizado](../../specs/003-reservas-ordenes-matricula/data-model.md) y
[25 IDs de comprobación futura](../../specs/003-reservas-ordenes-matricula/temporal-verification.md).
Captura única tras locks/recheck, timestamptz(6)/bigint microsegundos y UTC textual
exacto; período civil America/Lima separado del plazo fijo de 86 400 segundos.
Normalización de orden completa compartida con worker, mismo token en normalización
oportuna/reserva nueva, efecto único y momento de procesamiento separado de expiresAt.
Barrido finito con horizonte/cursor orientativos, single-flight y presupuesto único;
55P03 no crea reintento inmediato. Reloj de pared exige salud operativa D13: fallar
seguro ante retroceso detectado, sin prometer detectar todo salto o extender plazo.
Sin código, SQL, servicios, pruebas de producto ni nuevas reglas de negocio.
RP006 sigue pendiente para pago verificado sin conciliar, recibo durable y carreras
con vencimiento/reasignación. No se supone ausencia de pago ni retención adicional.
RV001/RP007, D02/sandbox, economía antes de cobros reales, D10/capacidad, D13 y los
pendientes heredados no se cierran. Spec/quince respuestas/checklist12/16 intactos.
[Revisión documental RP005](../../specs/003-reservas-ordenes-matricula/evidence/rp005-results.json).
Siguiente bloque al cierre de RP005: RP006, sin adelantar implementación.

- [X] RP006 Diseñar en futuros `contracts/`/`research.md` conciliación de pago/vencimiento/reasignación, con fuente temporal y precedencia aprobadas, resultado verificable de pagos tardíos y doble notificación; bloquear diseño no aprobado. Dep.: RP003/RP005; RA-03/04, RC-05/06, RE-07/08.

RP006 completa solo diseño de conciliación: [P01–P07](../../specs/003-reservas-ordenes-matricula/contracts/payments.md),
[modelo](../../specs/003-reservas-ordenes-matricula/data-model.md),
[PV01–PV30](../../specs/003-reservas-ordenes-matricula/payment-verification.md) y
[revisión documental](../../specs/003-reservas-ordenes-matricula/evidence/rp006-results.json).
Se reemplaza explícitamente el estado provisional de pago final pendiente por recibo
técnico durable y finalización/efectos/auditoría atómicos, sin extender las24h o cambiar
reglas aprobadas. Replay autorizado antes de condiciones mutables, respuestas tardías
condicionales e iniciación incierta recuperable; identidad económica con scope confiable.
Lectores esperan locks y proyectan después, sin cifras transitorias o locks tardíos.
Los30IDs son diseño de casos, cero tests implementados/ejecutados; TV03/25 tienen diseño,
no aprobación por ejecución. Evidencia histórica, spec/quince respuestas/checklist12/16,
constitución1.2.1 y entornos intactos. D02/sandbox, política económica, D10/D13 y pendientes
humanos/bootstrap siguen abiertos. Siguiente bloque vigente: RV001; después RP007.

- [ ] RP007 Generar tareas del futuro spec con pruebas antes de implementación y analizar correspondencia `spec.md`/`plan.md`/`tasks.md`; no producir migraciones/código hasta decisiones y puertas constitucionales completas. Dep.: RP004–RP006.

## Verificación a incluir en las tareas futuras

- [ ] RV001 Definir UNIT/PG/HTTP/E2E en futuro `verification.md` para RC-03–RC-06 y RE-01–RE-10, con trazabilidad, permisos por actor y privacidad; separar automatización de aceptación humana. Dep.: RP004/RP006.
- [ ] RV002 Preparar pruebas PG reales con barreras/estado final en futuras `apps/api/tests/integration/reservations-*.spec.ts`: último cupo, duplicado, pago vs vencimiento en ambos órdenes, rollback de auditoría y reinicio; sin simulaciones de atomicidad ni pools manuales. Dep.: RP007/RV001 y diseño aprobado; RE-01–RE-08.
- [ ] RV003 Preparar pruebas de pago duplicado/alterado/tardío y cancelación de grupo en futura `apps/api/tests/integration/enrollment-payments.spec.ts` según RA-04/05; carga con pagos simulados, adaptador Izipay en sandbox aparte. Dep.: RP006/RP007; RC-05/06, RE-07–RE-09; D02/D05.
- [ ] RV004 Preparar pruebas de abuso/operaciones denegadas según RA-06 en futura `apps/api/tests/integration/reservation-authorization.spec.ts` y E2E reserva→pago→matrícula/expiración en futura `apps/web/tests/e2e/enrollment.spec.ts`; no inventar sanciones, ventanas o cuotas, ni automatizar reenvíos al iniciar sesión. Dep.: RP003/RP007; RE-03/10.

## VPS y capacidad, sin contratación en este bloque

- [ ] VP001 Registrar en `docs/planificacion/vps-evaluacion.md` recursos/proveedor candidatos y costos fechados totales por duración, tráfico, correo, respaldo y pruebas ≤S/300; mecanismo de detención del gasto, sin contratación ni adopción AWS. Dep.: RC-07 y mediciones locales; D09.
- [ ] VP002 Acordar en futuro `specs/003-reservas-ordenes-matricula/verification.md` D10: ventana de actividad, mezcla/rampas/duración de 2500 activos, población ≥15 000 cuentas, umbrales y conteos distintos de VU/RPS/peticiones en vuelo/reservas. No aumentar perfiles históricos. Dep.: RP003/VP001; RC-01/02.
- [ ] VP003 Diseñar acceso controlado de apertura en futuro `plan.md`/`contracts/`: admisión/espera/errores/recuperación y autorización, diferenciar entrar de reservar; prioridad solo según RA-02 aprobada. No relajar hash, CSRF, cuotas o privacidad para lograr carga. Dep.: RP003/RP004/VP002.
- [ ] VP004 Completar D13 en `ops/recovery/README.md` y futura guía VPS: restauración aislada comprobada, copias/custodia/RPO/RTO acordados, HTTPS y secretos/volúmenes separados antes de demo persistente/publicación. Dep.: VP001; aprobación operativa pendiente, sin marcar D13 resuelta por smokes.
- [ ] VP005 Preparar cliente k6 remoto independiente en futuro `load-tests/enrollment/` con allowlist de VPS autorizado, origen HTTPS/CSRF, cuentas ficticias y guardas; generador en otro equipo físico. Conservar clientes/perfiles históricos de identidad y simular pagos. Dep.: RP007/VP002/VP003.
- [ ] VP006 Verificar generador y VPS por separado antes de carga en futura `docs/planificacion/evidence/vps-preflight.md`: CPU/RAM/IO/red, versiones, cuotas, RTT y costo de observadores; detener por falta de margen, OOM, fallos de monitor o seguridad. Dep.: VP004/VP005, autorización de ejecución/entorno.
- [ ] VP007 Ejecutar futuros incrementos autorizados de carga en VPS y guardar en futura `specs/003-reservas-ordenes-matricula/evidence/load-vps.md` evidencia de población/usuarios activos/RPS/peticiones en vuelo/último cupo/matrículas/conciliación y recursos, incluidos fallos; no inferir 2500 desde identidad local ni umbrales provisionales. Dep.: funcionalidad implementada/verificada, VP002/VP006 y autorización posterior. Este bloque no lo ejecuta.
- [ ] VP008 Revisar resultados contra D10 y presupuesto en `docs/planificacion/vps-evaluacion.md`; decidir ajustes del monolito y solo después evaluar AWS por mediciones/costo. No adoptar AWS ni arquitectura distribuida automáticamente. Dep.: VP007.

## Continuidad y seguimiento local

- [X] CT001 Incorporar el commit documental revisado de `docs/planificacion-reservas-capacidad` antes de continuar T039 y después T040/T041 en `feat/002-oferta-academica`; cerrar T035 solo con E2E completos y conservar las cinco aclaraciones/E1, sin marcar ocupación/disponibilidad en 002. Dep.: checkpoint T038 `eafae88` preservado y revisión de la enmienda vigente. Verificado: merge `b0af757` con dos padres y cierre T035/T039–T041 en el bloque posterior autorizado; [evidencia](../../specs/002-oferta-academica/evidence/t039-t041.md). La restricción de no fusionar correspondía únicamente a la etapa documental anterior.
- [ ] CT002 Retomar T104 con diez participantes reales en versión integrada estable en `specs/001-identidad-acceso-roles/evidence/usability.md` y luego T108 en `specs/001-identidad-acceso-roles/evidence/acceptance.md`; registrar criterio ≥9/10 por flujo en <180 s activos, sin inventar personas/resultados. Conservar bootstrap abierto hasta evidencia de causa/corrección independiente. Dep.: tareas originales T104/T107/T108, sin sustituirlas por este backlog.
- [ ] CT003 Ejecutar más adelante el perfil independiente `load-tests/identity/followup-local.js`, 10/25 VU ×2 min, solo tras autorización, guardas y observación; registrar resultados separados de los smokes/T103. Preparado pero no ejecutado aquí; no hay aceptación de 2500. Dep.: revisión de seguridad/recursos y autorización posterior.
