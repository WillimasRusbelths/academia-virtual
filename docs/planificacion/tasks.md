# Backlog trazable — reservas, matrícula y VPS

Planificación del 2026-10-23; CT001 verificada en el bloque de continuidad de oferta
y RP001 en el inventario del 2026-10-30. Las otras 20 tareas permanecen pendientes;
este backlog no autoriza implementar reservas, matrícula ni VPS.
[Requisitos RC, decisiones RA y escenarios RE](reservas-capacidad.md).
Numeración 003 confirmada: `specs/003-reservas-ordenes-matricula/research.md` contiene
solo el inventario RP001 y su evidencia. RP002 debe reutilizar explícitamente ese
directorio al iniciar Spec Kit; todavía no hay spec ni tasks.md de implementación.
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

- [ ] RP002 Ejecutar specify y redactar `specs/003-reservas-ordenes-matricula/spec.md` y checklist con RC-01–RC-07, historias priorizadas de reserva/orden/pago verificado/matrícula y RE-01–RE-10; distinguir lo confirmado de RA-01–RA-06, sin implementación. Dep.: RP001.
- [ ] RP003 Ejecutar clarify y registrar respuestas RA-01–RA-06 en el futuro `spec.md`: reserva múltiple/atomicidad, prioridad, pago exacto/tardío, reembolsos, cancelación y abuso; conservar bloqueos si faltan respuestas. Dep.: RP002; D01/D03–D06.
- [ ] RP004 Planificar contratos públicos, identidad de reserva/orden/matrícula y estados en futuros `plan.md`, `data-model.md` y `contracts/`; confirmar disponibilidad/consumo de capacidad y migración aditiva después de RP003, sin alterar cuentas o evidencia de 002. Dep.: RP003; RC-03/05/06, RE-01/02/09.
- [ ] RP005 Diseñar en futuros `research.md`/`data-model.md` plazo persistido de 86 400 segundos, reloj servidor, límites exactos, reinicio y ejecución diferida idempotente; ninguna extensión por reintento/desconexión/worker retrasado. Dep.: RP003/RP004; RC-04, RE-03–RE-06.
- [ ] RP006 Diseñar en futuros `contracts/`/`research.md` conciliación de pago/vencimiento/reasignación, con fuente temporal y precedencia aprobadas, resultado verificable de pagos tardíos y doble notificación; bloquear diseño no aprobado. Dep.: RP003/RP005; RA-03/04, RC-05/06, RE-07/08.
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
