# Decisiones pendientes

**Vigente al 2026-10-30**: al menos 15 000 cuentas, objetivo no demostrado de 2500
activos concurrentes y reserva previa al pago de 24 h exactas desde confirmación
servidor. Pago verificado confirma matrícula; vencimiento sin pago libera cupo por
conciliación consistente. S/300 total. [Requisitos, escenarios y tareas futuras](planificacion/reservas-capacidad.md).
La dirección VPS/acceso controlado es propuesta, AWS diferido. El seguimiento del
2026-10-18 se conserva como historia, no impide preparar el VPS ni autoriza contratar.

Decisiones abiertas o parcialmente resueltas según cada fila.
La elección de Izipay está resuelta; sus condiciones e integración siguen pendientes.
Una propuesta no equivale a una regla aprobada, una contratación ni una capacidad demostrada.

Respuestas parciales del responsable el 2026-10-30, registradas en
[003](../specs/003-reservas-ordenes-matricula/spec.md): reservas de varios cursos
todas juntas o ninguna y referencia de pago cuando el servidor termina de verificarlo.
No aprueban composición/pago de orden, identidad de matrícula, precio, resultado
exactamente al vencer, pagos tardíos/reembolsos, cancelación o abuso. RA-01/RA-03
quedan parciales y las demás cuestiones abiertas; el plazo sigue siendo 24 h exactas.

Antes de implementar una funcionalidad, sus decisiones bloqueantes deben resolverse o
delimitarse en su especificación. Cada resolución registrará fecha, responsable, criterio,
evidencia y especificaciones afectadas. Las reglas obligatorias de la
[constitución](../.specify/memory/constitution.md) no se sustituyen por supuestos.

| ID | Tema | Propuesta o pregunta por resolver | Evidencia o condición de cierre |
| --- | --- | --- | --- |
| D01 | Regla de pago | Propuesta: un pago por el total de la orden y matrícula por cada curso. ¿La activación es atómica? ¿Qué sucede si un curso pierde disponibilidad tras el cobro? | Regla validada y casos de aceptación de éxito, rechazo, pago tardío y falta de cupos antes de implementar órdenes/pagos. |
| D02 | Pasarela: parcialmente resuelta | Izipay elegida para el MVP el 2026-09-23 por el responsable del proyecto; reemplaza la candidatura inicial de Culqi. Pendientes: tarifas finales, límites, acceso al entorno de pruebas y habilitación de Yape para la modalidad contratada. Integración no implementada. | Confirmar las condiciones para la modalidad contratada, definir verificación del proveedor y validar en su entorno de pruebas. Mantener pagos simulados para carga y separar al proveedor de órdenes/matrículas; no asumir capacidad ilimitada. |
| D03 | Vigencia de matrícula | ¿Por período, fechas del curso o duración desde el pago? ¿Qué ocurre al cancelar o finalizar? | Estados y fechas que determinen acceso a materiales, chat y video. |
| D04 | Reservas: parcialmente resuelta | Confirmado 2026-10-23: reserva previa al pago, 24 h exactas, pago verificado confirma matrícula y vencimiento libera cupo por conciliación consistente. El 2026-10-30 se confirman reservas conjuntas todas o ninguna y referencia al terminar verificación servidor. Pendientes composición de orden/pago, identidad, límite exacto/resolución tardía, cancelación y abuso. | RC-03–RC-06/RA-01–RA-06/RE-01–RE-10 del plan vigente y respuestas de 003. Aprobar políticas restantes antes de implementar; sin extensión por reconexión/reinicio/proceso atrasado ni capacidad ficticia. |
| D05 | Reembolsos | ¿Se admiten, en qué condiciones y por curso o por orden? ¿Cómo afectan matrícula y cupos? | Política validada y comportamiento definido antes de implementar cancelaciones o reembolsos. |
| D06 | Horarios: oferta delimitada, matrícula pendiente | PA-05 del spec 002 resuelve programación docente semanal America/Lima, adyacencia y conflictos efectivos al publicar. ¿Se impide matrícula del alumno en cursos solapados y qué pasa ante cambios? | Conservar 002/E1; compatibilidad y efectos sobre reservas/matrículas requieren decisión en futuro spec, no quedan resueltos por describir horarios. |
| D07 | Video y ancho de banda | YouTube Live con OBS es la elección vigente DA03/DEC01. Faltan validar calidad, latencia, simultaneidad, consumo y viabilidad dentro del presupuesto. | Prueba temprana de emisión y reproducción, tráfico observable, limitaciones y estimación sustentada de costo; integración no implementada. |
| D08 | Protección de video | ¿La elección YouTube Live permite satisfacer RF16 y las reglas de acceso? La compatibilidad con las condiciones de manifiestos/segmentos, acceso directo y expiración aún debe comprobarse. | Pruebas de acceso directo permitido/denegado y permisos vencidos; autenticar la página u ocultar enlaces no demuestra protección y no se promete impedir grabaciones. |
| D09 | Alojamiento y presupuesto | Propuesta 2026-10-23: preparar VPS y apertura controlada conservando monolito NestJS/PostgreSQL. Faltan proveedor/región/recursos/tiempo/transferencia/HTTPS y costo. AWS solo se evaluará después según mediciones. | VP001–VP008: costo total ≤S/300, control de gasto, D13 y k6 desde otro equipo. No contratación, despliegue ni infraestructura AWS en este bloque. |
| D10 | Criterios de evaluación | Objetivo vigente: 2500 usuarios concurrentes activos; población ≥15 000 cuentas. Falta acordar ventana/mezcla/duración, RPS/peticiones en vuelo, capacidad de reservas y umbrales/rúbrica. | VP002/VP007: evidencia del VPS y generador separado; distinguir reservas/matrícula, chat y video. T103 conserva perfiles/umbrales históricos de 1000 y capacidad sin aprobar. |
| D11 | Identidad y permisos | Correo verificado, recuperación, un rol, gestión administrativa y revocación implementados según [identidad](../specs/001-identidad-acceso-roles/spec.md). Permisos académicos de PA-01 en 002, sin permisos de matrícula implícitos. | Checkpoints verificados; T104/T108 y bootstrap histórico abiertos, SMTP real/costo pendiente. No confundir aceptación técnica local con aceptación integral. |
| D12 | Materiales y paneles | Faltan formatos, tamaños, almacenamiento y operaciones mínimas por rol. | Alcance acotado por funcionalidad compatible con el plazo y el presupuesto. |
| D13 | Actualización y recuperación: operación pendiente | Procedimiento local y restore aislado de identidad/oferta comprobados en T069; faltan custodia/ubicación externa, responsable, retención operada y objetivos RPO/RTO aprobados. | [T069](../specs/002-oferta-academica/evidence/recovery.md) no cierra D13: tiempos observados no son SLA. Antes de demo persistente/publicación, revisar esas condiciones y el destino real, sin prometer downgrade ni cambios posteriores al backup. |
| D14 | Prioridad en apertura | ¿FIFO, turnos u otra política; qué instante y desempate fija orden de llegada? Acceso controlado no es reserva ni prioridad aprobada. | RA-02/VP003; regla explícita y casos de espera, rechazo, reconexión y último cupo antes de implementar. |
| D15 | Bloqueo abusivo de cupos | ¿Cuántas reservas por cuenta/grupo y qué ocurre ante reiteración o abandono? ¿Excepciones, penalizaciones y recuperación? | RA-06; política aprobada y pruebas RE-10, sin inventar límites ni debilitar cuotas de seguridad de identidad. |

## Delimitación de oferta y pendientes heredados — 2026-10-29

PA-01–PA-05 siguen aprobadas: permisos por actor, retiro antes de editar,
republicación explícita, cancelación terminal, habilitación/revisión docente,
capacidad 1–50 y horarios America/Lima. [Spec 002](../specs/002-oferta-academica/spec.md)
y sus evidencias concretan estas reglas, sin resolver reservas/matrícula.
D04 mantiene la reserva previa de 24 h confirmada; capacidad configurada no ocupa
ni libera inventario. D06 solo delimita solapamientos internos y publicaciones
docentes; conflictos y cambios de matrícula del alumno siguen abiertos.

T103 permanece completa como ejecución/informe histórico de 1000, con capacidad
sin aprobar. T104 (diez personas, identidad) y T108 siguen pendientes; T073
(alumno y oferta) es otra observación y no los sustituye. Bootstrap intermitente
conserva causa pendiente aunque sus repeticiones pasen. El timeout del **caso E2E
D10** sigue abierto, distinto de la **decisión D10** sobre rúbrica/capacidad; tampoco
se cierra por T068. CI remoto no ejecutado, límite de 20 minutos sin validar remoto.
Mailpit/SMTP local están comprobados; SMTP externo, costo/entrega y D13 operativo
siguen pendientes. Cargas completas y evaluación VPS según su etapa/rúbrica;
video/protección/alojamiento D07–D09 conservan su trazabilidad, sin implementación.

[Protocolo humano](../specs/002-oferta-academica/evidence/human-acceptance.md):
preparado, no ejecutado. [H-CAP-01 corregido y verificado](../specs/002-oferta-academica/evidence/h-cap-01.md);
la observación aplazada por el responsable mantiene pendiente la aceptación humana/integral. No se amplía alcance ni se cambian reglas.

## Decisiones confirmadas y pendientes — 2026-10-23

La instrucción del responsable confirma 24 horas, reserva previa, matrícula tras pago
verificado y liberación sin pago. No aprueba reserva múltiple/orden atómica (D01),
prioridad (D14), pago exactamente al vencer o tardío (D04/D05), reembolsos/cancelación
de grupos con efectos económicos (D03/D05/D06) ni bloqueo abusivo (D15).
La conciliación debe resolver carreras sin doble liberación/consumo ni sobreventa;
se necesita aprobar la fuente temporal y precedencia, no suponer una tolerancia.
La enmienda constitucional 1.2.0 registra lo confirmado; la rúbrica D10 sigue pendiente.

## Seguimiento D09/D10 — 2026-10-18

Acuerdo histórico de planificación: el VPS y los nuevos ensayos completos de 1000 usuarios se
aplazan hasta integrar matrícula. Entonces se retomarán recursos/escenarios y rúbrica con
el profesor (D10), sin cambiar los criterios ya registrados. T103 conserva su estado de
ejecución e informe completos; la capacidad **no está aprobada** y el cierre integral de
identidad permanece pendiente. Se conservan [incumplimientos, recursos y umbrales
provisionales](../specs/001-identidad-acceso-roles/evidence/load-resources.md).
Este aplazamiento no elimina las verificaciones ni impide preparar T104/T105, independientes
de la carga; no autoriza contratar servicios.

## Historial de la decisión de pasarela (D02)

- **2026-09-22:** Culqi se documentó como candidata, sin selección definitiva ni integración.
- **2026-09-23:** el responsable del proyecto elige Izipay para el MVP mediante la instrucción
  de esta etapa. Se conserva la propuesta de un pago por orden como decisión independiente
  todavía pendiente (D01). No se han confirmado condiciones comerciales ni contratado servicios
  en esta etapa. Yape queda pendiente para la modalidad contratada, no prometido como disponible.
- **Impacto:** se actualizan constitución, README y alcance. La futura especificación de pagos
  deberá aislar la integración del proveedor de las reglas de órdenes y matrículas. La
  funcionalidad actual de identidad no depende de Izipay ni incorpora pagos.

## Prioridades

Oferta 002 conserva las cinco aclaraciones/E1, cuatro checkpoints automáticos,
[T068](../specs/002-oferta-academica/evidence/automated.md) y
[T069](../specs/002-oferta-academica/evidence/recovery.md). T070–T072 actualizan
documentación/protocolo; T073 requiere alumno real y T074 evidencia integral.
No se declara cerrado SC-002: H-CAP-01 conserva su descubrimiento y corrección
automática documentados; T073 aún requiere la observación real del alumno.
Preparar el siguiente spec de reservas/órdenes/matrícula sin implementarlo todavía.
Obtener la rúbrica (D10) e investigar video, protección y alojamiento (D07–D09)
sigue siendo prioritario. Son riesgos que pueden modificar el diseño y el escenario
demostrable dentro del presupuesto; también se deberá validar el costo del correo.

Antes de implementar matrícula y pagos, resolver D01–D06. No sustituir la confirmación del
proveedor por la pantalla de éxito ni omitir transacciones o idempotencia por una decisión
pendiente. D12 se resolverá al especificar materiales/paneles y D13 antes de operar con datos
persistentes en demo o producción.
