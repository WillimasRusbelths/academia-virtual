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
No hay implementación de reservas/pagos/matrícula.

Antes de implementar una funcionalidad, sus decisiones bloqueantes deben resolverse o
delimitarse en su especificación. Cada resolución registrará fecha, responsable, criterio,
evidencia y especificaciones afectadas. Las reglas obligatorias de la
[constitución](../.specify/memory/constitution.md) no se sustituyen por supuestos.

| ID | Tema | Propuesta o pregunta por resolver | Evidencia o condición de cierre |
| --- | --- | --- | --- |
| D01 | Regla de pago: parcialmente resuelta | RP003 confirma orden desglosada/pago total/matrícula por curso y grupo; precio por curso/PEN conservado 24 h, unicidad vigente alumno/curso y vigencia hasta fin de fecha final del grupo en America/Lima. Verificación antes de vencer; tardío o sin plaza válida queda en conciliación sin matrícula. Pendientes condiciones de oferta/cambios; resolución económica fuera del incremento, previa a cobros reales. | Conservar respuestas y criterios 003; completar elegibilidad/cambios y probar protocolo antes de implementar. Sin aceptar capacidad o integración por documentación. |
| D02 | Pasarela: parcialmente resuelta | Izipay elegida para el MVP el 2026-09-23 por el responsable del proyecto; reemplaza la candidatura inicial de Culqi. Pendientes: tarifas finales, límites, acceso al entorno de pruebas y habilitación de Yape para la modalidad contratada. Integración no implementada. | Confirmar las condiciones para la modalidad contratada, definir verificación del proveedor y validar en su entorno de pruebas. Mantener pagos simulados para carga y separar al proveedor de órdenes/matrículas; no asumir capacidad ilimitada. |
| D03 | Vigencia ordinaria confirmada; otros efectos pendientes | RP003: desde confirmación por pago verificado hasta terminar la fecha final del grupo en America/Lima (antes de las 00:00 del día siguiente); después no vigente y con historial. No reabre oferta ni aprueba cancelación/reembolso. | Verificar límites de vigencia en 003; cambios de fechas/cancelación siguen RA-05/PD-02. Acceso a materiales/chat/video requiere sus propios specs y no queda implementado. |
| D04 | Reservas: parcialmente resuelta | 24 h exactas, reserva previa al pago, selección conjunta, orden desglosada/pago total; prioridad por admisión autenticada/válida y desempate servidor; un grupo por curso, sin nueva reserva con reserva/matrícula vigente del curso; máximo una orden con reservas vigentes por alumno. Pago verificado antes de vencer confirma matrícula; tardío/sin plaza queda en conciliación, sin resolución económica en este incremento. | RA-01/02/03 confirmadas; RA-04 delimitada y bloqueante antes de cobros reales; condiciones de oferta PD-02, cancelación/cambios RA-05 y reiteraciones/excepciones RA-06 siguen pendientes. Sin extensión ni disponibilidad ficticia. |
| D05 | Reembolsos: fuera del incremento 003 actual | RA-04 aprobada: registrar incidencia/seguimiento, sin ejecutar devoluciones, traslados ni asignaciones manuales; el seguimiento no resuelve económicamente. ¿Qué política, responsables y procedimiento final se aprobarán? | Deben aprobarse antes de habilitar cobros reales y verificarse con proveedor. No se promete devolución ni se cierra incidencia por anotar seguimiento; cancelación de grupo sigue bloqueada por incidencias sin resolver. |
| D06 | Horarios: oferta delimitada, matrícula pendiente | PA-05 del spec 002 resuelve programación docente semanal America/Lima, adyacencia y conflictos efectivos al publicar. ¿Se impide matrícula del alumno en cursos solapados y qué pasa ante cambios? | Conservar 002/E1; compatibilidad y efectos sobre reservas/matrículas requieren decisión en futuro spec, no quedan resueltos por describir horarios. |
| D07 | Video y ancho de banda | YouTube Live con OBS es la elección vigente DA03/DEC01. Faltan validar calidad, latencia, simultaneidad, consumo y viabilidad dentro del presupuesto. | Prueba temprana de emisión y reproducción, tráfico observable, limitaciones y estimación sustentada de costo; integración no implementada. |
| D08 | Protección de video | ¿La elección YouTube Live permite satisfacer RF16 y las reglas de acceso? La compatibilidad con las condiciones de manifiestos/segmentos, acceso directo y expiración aún debe comprobarse. | Pruebas de acceso directo permitido/denegado y permisos vencidos; autenticar la página u ocultar enlaces no demuestra protección y no se promete impedir grabaciones. |
| D09 | Alojamiento y presupuesto | Propuesta 2026-10-23: preparar VPS y apertura controlada conservando monolito NestJS/PostgreSQL. Faltan proveedor/región/recursos/tiempo/transferencia/HTTPS y costo. AWS solo se evaluará después según mediciones. | VP001–VP008: costo total ≤S/300, control de gasto, D13 y k6 desde otro equipo. No contratación, despliegue ni infraestructura AWS en este bloque. |
| D10 | Criterios de evaluación | Objetivo vigente: 2500 usuarios concurrentes activos; población ≥15 000 cuentas. Falta acordar ventana/mezcla/duración, RPS/peticiones en vuelo, capacidad de reservas y umbrales/rúbrica. | VP002/VP007: evidencia del VPS y generador separado; distinguir reservas/matrícula, chat y video. T103 conserva perfiles/umbrales históricos de 1000 y capacidad sin aprobar. |
| D11 | Identidad y permisos | Correo verificado, recuperación, un rol, gestión administrativa y revocación implementados según [identidad](../specs/001-identidad-acceso-roles/spec.md). Permisos académicos de PA-01 en 002, sin permisos de matrícula implícitos. | Checkpoints verificados; T104/T108 y bootstrap histórico abiertos, SMTP real/costo pendiente. No confundir aceptación técnica local con aceptación integral. |
| D12 | Materiales y paneles | Faltan formatos, tamaños, almacenamiento y operaciones mínimas por rol. | Alcance acotado por funcionalidad compatible con el plazo y el presupuesto. |
| D13 | Actualización y recuperación: operación pendiente | Procedimiento local y restore aislado de identidad/oferta comprobados en T069; faltan custodia/ubicación externa, responsable, retención operada y objetivos RPO/RTO aprobados. | [T069](../specs/002-oferta-academica/evidence/recovery.md) no cierra D13: tiempos observados no son SLA. Antes de demo persistente/publicación, revisar esas condiciones y el destino real, sin prometer downgrade ni cambios posteriores al backup. |
| D14 | Prioridad confirmada; implementación/verificación pendientes | Segunda ronda RP003: orden de admisión en servidor de solicitudes autenticadas y válidas, empate por secuencia única del servidor. Clic, login y reloj cliente no dan prioridad ni reservan. Selección conjunta sigue toda o ninguna. | RA-02/VP003: diseñar y verificar esa prioridad en casos concurrentes/último cupo, sin atribuirla al orden accidental de locks o finalización de peticiones. No implementada por esta aprobación. |
| D15 | Bloqueo abusivo de cupos: parcialmente resuelta | RP003 aprueba una sola orden con reservas vigentes por alumno, con varios cursos posibles; repetir la misma intención recupera la existente. PD-02 añade un grupo por curso y rechazo con reserva/matrícula vigente del curso. Pendientes otros límites, reiteración/abandono, varias cuentas, excepciones, penalizaciones y recuperación. No concede cancelación voluntaria. | RA-06; conservar límite aprobado y completar política/pruebas RE-10, sin inventar otras cuotas ni debilitar seguridad de identidad. |

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
