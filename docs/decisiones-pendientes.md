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

En la primera ronda RP003/clarify, el mismo día, se aprueban cinco reglas adicionales: el administrador
fija precio por curso en PEN, conservado durante las 24 horas de reserva; una orden
desglosada con un pago total y una matrícula por curso vinculada al grupo elegido;
y verificación terminada estrictamente antes del vencimiento para confirmar matrícula.
Al vencer o después se registra incidencia, sin matrícula ni reembolso automáticos
ni extensión del plazo. Además, solo una orden con reservas vigentes por alumno
(puede incluir varios cursos), y se impide cancelar grupos con reservas vigentes,
matrículas o incidencias de pago sin resolver. Estas respuestas actualizan PD-01 y
RA-01/03; RA-04/05/06 quedan parciales. No aprueban cancelación voluntaria,
penalizaciones, excepciones ni resolución económica. RP003 conserva bloqueos tras
cinco preguntas/respuestas; se requiere otra ronda de aclaración antes del plan.
La segunda ronda RP003 registra otras cinco respuestas el 2026-10-30: prioridad
por admisión servidor de solicitudes autenticadas y válidas, empate por secuencia
única; un solo grupo por curso y rechazo de nueva reserva con reserva/matrícula
vigente del curso; matriz PD-03 (alumno propio, administrador consulta/seguimiento,
docente y visitante sin acceso financiero); incidencia/seguimiento sin resolución
económica en este incremento, obligatoria antes de cobros reales; y matrícula vigente
desde confirmación por pago hasta fin de la fecha final del grupo en America/Lima.
C-SYNC-01/C-SYNC-02: constitución y resumen de README aún llamaban propuesta al
pago total aprobado. Se corrigen como sincronización documental: constitución 1.2.1
PATCH, con fuente de aprobación, ratificación y principios I–XI conservados.
Las evidencias anteriores mantienen su contenido y versión. No se reabren decisiones.
Tercera ronda RP003, cinco respuestas del 2026-10-30: elegibilidad visible y vigente
al confirmar, antes de las 00:00 de la fecha inicial del grupo America/Lima; retiro
o pérdida de habilitación conserva plazas/plazo y matrículas previas, bloqueando
pago/confirmación de toda la orden mientras algún grupo esté oculto. Republicación
explícita permite pagar el plazo restante, sin renovar ni resolver incidencias.
No se permite cancelación/modificación voluntaria de compromisos: esperar vencimiento;
nueva intención posterior sin sanción ni espera adicional por abandono. Varias cuentas
y excepciones manuales quedan fuera. Se precisa expresamente la regla anterior de
cancelación: solo reservas/matrículas vigentes e incidencias sin resolver bloquean;
historial finalizado por sí solo no bloquea. Con bloqueantes se permiten textos y
docente según 002, impidiendo curso, período, horarios, capacidad y cancelación;
historial conserva condiciones/fechas y no se reactiva. D06 impide solapamientos
efectivos al reservar/matricular, incluidos compromisos propios ocultos, permitiendo
adyacencia y excluyendo vencidos/finalizados. Todo o nada; pago incompatible, incidencia.
RA-01–RA-06 y PD-01–PD-03 quedan resueltas o delimitadas para el núcleo funcional.
D02, economía previa a cobros reales, D10 y D13 mantienen sus puertas. El siguiente
bloque recomendado es RP004/plan funcional; no es aprobación global de capacidad.
No hay implementación de reservas/pagos/matrícula.

Antes de implementar una funcionalidad, sus decisiones bloqueantes deben resolverse o
delimitarse en su especificación. Cada resolución registrará fecha, responsable, criterio,
evidencia y especificaciones afectadas. Las reglas obligatorias de la
[constitución](../.specify/memory/constitution.md) no se sustituyen por supuestos.

| ID | Tema | Propuesta o pregunta por resolver | Evidencia o condición de cierre |
| --- | --- | --- | --- |
| D01 | Núcleo funcional confirmado/delimitado; verificación pendiente | Orden desglosada/pago total/matrícula por curso y grupo; precio por curso/PEN conservado 24 h, unicidad vigente alumno/curso y vigencia hasta fin de fecha final del grupo America/Lima. Elegibilidad y cambios PD-02/RA-05 confirmados; solo pago verificado antes de vencer, con oferta visible y sin conflictos efectivos, permite matrícula. Tardío, oculto o sin plaza válida: conciliación sin matrícula. | RP004 diseña el protocolo según 003; resolución económica fuera del incremento y obligatoria antes de cobros reales. No acredita implementación, integración ni capacidad. |
| D02 | Pasarela: parcialmente resuelta | Izipay elegida para el MVP el 2026-09-23 por el responsable del proyecto; reemplaza la candidatura inicial de Culqi. Pendientes: tarifas finales, límites, acceso al entorno de pruebas y habilitación de Yape para la modalidad contratada. Integración no implementada. | Confirmar las condiciones para la modalidad contratada, definir verificación del proveedor y validar en su entorno de pruebas. Mantener pagos simulados para carga y separar al proveedor de órdenes/matrículas; no asumir capacidad ilimitada. |
| D03 | Vigencia e historial confirmados; accesos futuros separados | Desde confirmación por pago hasta terminar fecha final original del grupo America/Lima, antes de las 00:00 del día siguiente. Retiro/pérdida de habilitación no revoca matrículas previas. Con compromisos bloqueantes no cambia período; historial finalizado conserva condiciones/fechas y no se reactiva por editar/republicar. | Verificar límites y conservación en 003. No hay cancelación/modificación voluntaria de compromisos; acceso a materiales/chat/video requiere sus propios specs. |
| D04 | Reglas funcionales confirmadas/delimitadas; sin implementación | Reserva previa de 24 h exactas, selección conjunta, orden desglosada/pago total, prioridad servidor, unicidad vigente por curso y una orden con reservas vigentes por alumno. PD-02 fija elegibilidad/corte anterior a fecha inicial y pausa de pago/confirmación por ocultamiento sin liberar ni extender reservas. RA-05 protege compromisos/historial; RA-06 excluye cancelación voluntaria y permite nueva intención tras vencer sin sanción/espera adicional. | RP003 registrada; RP004–RP006 deben diseñar y probar protocolo/conciliación. RA-04 y D02 bloquean cobros reales hasta política/procedimiento e integración comprobados; controles adicionales varias cuentas/excepciones diferidos. Capacidad configurada no demuestra disponibilidad. |
| D05 | Reembolsos: fuera del incremento 003 actual | RA-04 aprobada: registrar incidencia/seguimiento, sin ejecutar devoluciones, traslados ni asignaciones manuales; el seguimiento no resuelve económicamente. ¿Qué política, responsables y procedimiento final se aprobarán? | Deben aprobarse antes de habilitar cobros reales y verificarse con proveedor. No se promete devolución ni se cierra incidencia por anotar seguimiento; cancelación de grupo sigue bloqueada por incidencias sin resolver. |
| D06 | Conflictos efectivos de alumno confirmados en 003; implementación pendiente | Al confirmar reserva y matrícula, comprobar selección y reservas/matrículas vigentes propias incluso ocultas. Conflicto solo con fecha efectiva común y horas intersectadas en America/Lima; franjas contiguas permitidas, vencidos/finalizados excluidos. Sin confirmación parcial; pago incompatible, incidencia RA-04 sin matrícula. | Conservar PA-05/E1 de 002; diseñar/verificar consistencia concurrente y excluir falso conflicto de convertir reservas propias de la misma orden. RA-05 impide cambiar horarios con bloqueantes; no reescribe historial. |
| D07 | Video y ancho de banda | YouTube Live con OBS es la elección vigente DA03/DEC01. Faltan validar calidad, latencia, simultaneidad, consumo y viabilidad dentro del presupuesto. | Prueba temprana de emisión y reproducción, tráfico observable, limitaciones y estimación sustentada de costo; integración no implementada. |
| D08 | Protección de video | ¿La elección YouTube Live permite satisfacer RF16 y las reglas de acceso? La compatibilidad con las condiciones de manifiestos/segmentos, acceso directo y expiración aún debe comprobarse. | Pruebas de acceso directo permitido/denegado y permisos vencidos; autenticar la página u ocultar enlaces no demuestra protección y no se promete impedir grabaciones. |
| D09 | Alojamiento y presupuesto | Propuesta 2026-10-23: preparar VPS y apertura controlada conservando monolito NestJS/PostgreSQL. Faltan proveedor/región/recursos/tiempo/transferencia/HTTPS y costo. AWS solo se evaluará después según mediciones. | VP001–VP008: costo total ≤S/300, control de gasto, D13 y k6 desde otro equipo. No contratación, despliegue ni infraestructura AWS en este bloque. |
| D10 | Criterios de evaluación | Objetivo vigente: 2500 usuarios concurrentes activos; población ≥15 000 cuentas. Falta acordar ventana/mezcla/duración, RPS/peticiones en vuelo, capacidad de reservas y umbrales/rúbrica. | VP002/VP007: evidencia del VPS y generador separado; distinguir reservas/matrícula, chat y video. T103 conserva perfiles/umbrales históricos de 1000 y capacidad sin aprobar. |
| D11 | Identidad y permisos | Correo verificado, recuperación, un rol, gestión administrativa y revocación implementados según [identidad](../specs/001-identidad-acceso-roles/spec.md). Permisos académicos de PA-01 en 002, sin permisos de matrícula implícitos. | Checkpoints verificados; T104/T108 y bootstrap histórico abiertos, SMTP real/costo pendiente. No confundir aceptación técnica local con aceptación integral. |
| D12 | Materiales y paneles | Faltan formatos, tamaños, almacenamiento y operaciones mínimas por rol. | Alcance acotado por funcionalidad compatible con el plazo y el presupuesto. |
| D13 | Actualización y recuperación: operación pendiente | Procedimiento local y restore aislado de identidad/oferta comprobados en T069; faltan custodia/ubicación externa, responsable, retención operada y objetivos RPO/RTO aprobados. | [T069](../specs/002-oferta-academica/evidence/recovery.md) no cierra D13: tiempos observados no son SLA. Antes de demo persistente/publicación, revisar esas condiciones y el destino real, sin prometer downgrade ni cambios posteriores al backup. |
| D14 | Prioridad confirmada; implementación/verificación pendientes | Segunda ronda RP003: orden de admisión en servidor de solicitudes autenticadas y válidas, empate por secuencia única del servidor. Clic, login y reloj cliente no dan prioridad ni reservan. Selección conjunta sigue toda o ninguna. | RA-02/VP003: diseñar y verificar esa prioridad en casos concurrentes/último cupo, sin atribuirla al orden accidental de locks o finalización de peticiones. No implementada por esta aprobación. |
| D15 | Controles mínimos confirmados; protección adicional diferida | Una orden con reservas vigentes por alumno, un grupo por curso y sin nueva reserva con reserva/matrícula vigente del curso. Misma intención recupera resultado sin renovar. Sin cancelación/modificación voluntaria; tras vencer sin pago, nueva intención con condiciones actuales y sin sanción/espera adicional por abandono. | RA-06 delimitada; varias cuentas y excepciones manuales fuera del incremento, sin prometer prevención integral del abuso. Conservar cuotas/seguridad de identidad y verificar RE-10 sin inventar sanciones. |

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

Antes de implementar matrícula y pagos, planificar/verificar las reglas confirmadas
y delimitaciones de D01–D06 en 003; D02 y resolución económica D05 siguen
como puertas obligatorias antes de cobros reales. No sustituir la confirmación del
proveedor por la pantalla de éxito ni omitir transacciones o idempotencia por una decisión
pendiente. D12 se resolverá al especificar materiales/paneles y D13 antes de operar con datos
persistentes en demo o producción.
