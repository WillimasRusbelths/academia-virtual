# Feature Specification: reservas, órdenes y matrícula

**Feature Branch**: `feat/003-reservas-ordenes-matricula`

**Created**: 2026-10-30, America/Lima.

**Status**: Borrador con dos rondas RP003 de cinco aclaraciones cada una integradas;
bloqueos pendientes, no habilitado para plan ni implementación.

**Input**: El alumno reserva antes de pagar; la reserva confirmada por el servidor
conserva el cupo durante exactamente 24 horas. El pago verificado confirma matrícula;
el vencimiento sin pago libera el cupo mediante conciliación consistente. Se requieren
al menos 15 000 cuentas, objetivo de 2500 usuarios concurrentes activos aún por demostrar
y presupuesto S/300 total. Conservar identidad/oferta y no inventar reglas pendientes.

## Alcance confirmado y decisiones abiertas

Fuentes: [constitución 1.2.1](../../.specify/memory/constitution.md),
[planificación confirmada](../../docs/planificacion/reservas-capacidad.md),
[HU10/HU11](../../docs/01-analisis-de-sistema/02-historias-del-usuario.md),
[RF11–RF13](../../docs/01-analisis-de-sistema/03-requisitos-funcionales.md),
[alcance del MVP](../../docs/alcance-mvp.md) e [inventario RP001](research.md).
La base de este borrador es d2676fd. RP001 y la evidencia 001/002 no se reescriben.

Los requisitos de esta etapa describen comportamiento futuro, no capacidad instalada.
Las alternativas y cuestiones abiertas no son decisiones aprobadas. No se suplen con
valores por defecto, ni con el orden de ejecución que casualmente produzca el sistema.
El plan y las tareas de implementación esperan a resolver o delimitar explícitamente
los bloqueos de esta sección. D04 queda parcialmente confirmada y D06 matrícula sigue abierta.

| ID | Confirmado | Límite de la confirmación |
| --- | --- | --- |
| RC-01 | Al menos 15 000 cuentas registradas. | Población persistida distinta de sesiones abiertas, actividad o reservas. No se crean aquí. |
| RC-02 | Objetivo de 2500 usuarios concurrentes activos. | Pendiente de demostrar; ventana/mezcla y criterios de D10 por acordar. No significa 2500 solicitudes simultáneas ni reservas. |
| RC-03 | El alumno reserva un cupo antes de pagar. | Confirmación del servidor; elegir un grupo o esperar admisión no reserva. |
| RC-04 | 24 horas exactas desde confirmación del servidor. | 86 400 segundos; persisten inicio y vencimiento. No desde clic, apertura o creación previa de orden; no se extiende por reintento o reinicio. |
| RC-05 | Pago verificado confirma matrícula. | Autenticidad, orden, importe y moneda verificados; verificación terminada antes del vencimiento. Exactamente al vencer o después: incidencia, sin matrícula ni reembolso automáticos (RA-03/04). |
| RC-06 | Vencimiento sin pago libera cupo mediante conciliación consistente. | No doble consumo/liberación ni sobreventa. El pago verificado al vencer o después no extiende la reserva; queda incidencia con seguimiento. Resolución económica fuera de este incremento y bloqueante antes de cobros reales. |
| RC-07 | S/300 como presupuesto total. | No mensual, sin contratación, despliegue ni garantía de sostener el objetivo. |

## Clarifications

Respuestas de specify, anteriores a RP003:

- RA-01, respuesta del responsable: «A. Confirmar todas juntas o ninguna; la
  composición y el pago de la orden se aclararán aparte». Se aprueba la reserva
  conjunta, no el desglose, número de órdenes/pagos o identidad de matrícula.
- RA-03, respuesta del responsable: «A. El instante en que el servidor termina de
  verificar el pago». Se aprueba esa referencia temporal, no la comparación en el
  instante exacto del vencimiento ni la resolución tardía o sus reembolsos.

### Session 2026-10-30

Primera ronda RP003, cerrada en `5dc380e`: cinco preguntas y cinco respuestas.

- Q: ¿Cómo debe fijarse y mantenerse el precio que paga el alumno durante su reserva? → A: Opción A: el administrador fija el precio por curso en soles (PEN); la orden conserva el precio confirmado durante las 24 horas de reserva, aunque cambie para nuevas reservas.
- Q: ¿Cómo deben organizarse la orden, el pago y las matrículas cuando el alumno reserva varios cursos? → A: Opción A: una orden desglosada, un pago total y una matrícula por cada curso incluido, vinculada al grupo elegido.
- Q: ¿Qué debe ocurrir si el servidor termina de verificar el pago exactamente al vencer las 24 horas de reserva o después? → A: Opción A: solo la verificación terminada antes del vencimiento permite confirmar matrícula; exactamente al vencer o después se registra una incidencia para conciliación, sin matrícula ni reembolso automáticos y sin extender la reserva.
- Q: ¿Puede un alumno mantener más de una orden con reservas vigentes al mismo tiempo? → A: Opción A: una sola orden con reservas vigentes por alumno, que puede incluir varios cursos; para crear otra debe pagar, vencer o cancelar la anterior según las reglas aprobadas. Consultar o repetir la misma intención recupera la orden existente.
- Q: ¿Qué debe ocurrir si el administrador intenta cancelar un grupo que tiene reservas vigentes, matrículas o incidencias de pago sin resolver? → A: Opción A: impedir la cancelación mientras existan reservas vigentes, matrículas o incidencias de pago sin resolver; primero deben resolverse esos compromisos conforme a políticas autorizadas, sin borrar antecedentes.

Segunda ronda RP003, iniciada desde `5dc380e`: máximo cinco preguntas adicionales,
independientes de la primera ronda ya cerrada. Cada respuesta siguiente se registra
una sola vez; no se reabren las decisiones anteriores.

- Q: ¿Qué prioridad debe aplicarse cuando varios alumnos solicitan el último cupo disponible? → A: Opción A: prioridad según el orden en que el servidor admite solicitudes autenticadas y válidas; los empates se resuelven con una secuencia única del servidor. El clic, el inicio de sesión y el reloj del alumno no dan prioridad ni reservan cupo.
- Q: ¿Puede un alumno reservar o matricularse en más de un grupo del mismo curso al mismo tiempo? → A: Opción A: no; cada selección contiene un solo grupo por curso y se rechaza una nueva reserva si el alumno ya tiene reserva o matrícula vigente de ese curso, aunque elija otro grupo. Repetir la misma intención recupera su resultado existente. Vigencia y finalización de matrícula siguen pendientes en D03.
- Q: ¿Qué permisos tendrán el administrador, el alumno y el docente sobre reservas, órdenes, pagos y matrículas? → A: Opción A: alumno reserva, inicia el pago y consulta únicamente lo propio; administrador fija precios, consulta compromisos e incidencias de todos y registra seguimiento, sin confirmar pagos/matrículas, devolver dinero o cancelar compromisos manualmente fuera de políticas aprobadas. Docente y visitante no acceden a este módulo financiero.
- Q: ¿Qué debe hacer este incremento con un pago verificado al vencer o después, o que no tenga una plaza válida para confirmar matrícula? → A: Opción A: registrar incidencia, mostrar al alumno pago en conciliación sin matrícula y permitir seguimiento administrativo. Este incremento no ejecuta devoluciones, traslados ni asignaciones manuales; política y procedimiento de resolución económica deben aprobarse antes de cobros reales. Anotar seguimiento no presenta la incidencia como resuelta.
- Q: ¿Hasta cuándo debe considerarse vigente una matrícula confirmada por pago? → A: Opción A: desde que se confirma por pago verificado hasta terminar la fecha final del grupo, en America/Lima; al concluir esa fecha deja de estar vigente y conserva su historial. No reabre oferta ni aprueba cancelaciones o reembolsos. La reserva previa conserva sus 24 horas exactas.

### Registro de decisiones parciales y pendientes

| ID | Cuestión abierta y efecto | Requisitos/escenarios afectados |
| --- | --- | --- |
| RA-01 | Confirmadas la reserva de varios cursos todas juntas o ninguna y, en RP003, una orden desglosada con un pago total y una matrícula por cada curso incluido, vinculada al grupo elegido. PD-02 limita a un grupo por curso y rechaza nueva reserva con reserva/matrícula vigente del curso; vigencia confirmada en D03 y cancelaciones/cambios pendientes RA-05. | US1/US2; FR-003/005/006/008/010/011; RE-01/02. |
| RA-02 | Confirmada en la segunda ronda RP003: prioridad por orden de admisión en el servidor de solicitudes autenticadas y válidas; desempate por secuencia única del servidor. Clic, inicio de sesión y reloj del alumno no dan prioridad ni reservan cupo. La selección de varios cursos sigue siendo toda junta o ninguna. | US1; FR-010/012/023; RE-02. |
| RA-03 | Confirmada: referencia cuando el servidor termina de verificar el pago, estrictamente antes del vencimiento para confirmar matrícula. Exactamente al vencer o después se registra incidencia, sin matrícula ni reembolso automáticos ni extensión de las 24 horas. | US2/US3; FR-007/008/009/013; RE-05/08. |
| RA-04 | Delimitada en la segunda ronda RP003: pago verificado al vencer o después, o sin plaza válida, queda como incidencia; alumno ve pago en conciliación sin matrícula y administrador registra seguimiento. Sin devoluciones, traslados ni asignaciones manuales en este incremento. Seguimiento no resuelve la incidencia. Política/procedimiento de resolución económica pendientes y obligatorios antes de cobros reales; no se da por aprobada una devolución ni su operación con Izipay. | US2/US4; FR-008/009/013/014/017/019/024; RE-07/08/09. |
| RA-05 | Parcialmente confirmada en RP003: impedir cancelar un grupo mientras tenga reservas vigentes, matrículas o incidencias de pago sin resolver; resolver primero esos compromisos conforme a políticas autorizadas, conservando antecedentes. Cancelación terminal de 002 se conserva. Siguen pendientes cancelación voluntaria de reserva/orden/matrícula, cambios de grupo/horario, resolución de compromisos y efectos económicos. | US4; FR-014/015/021; RE-09. |
| RA-06 | Parcialmente confirmada en RP003: una sola orden con reservas vigentes por alumno, con varios cursos posibles; otra solo cuando la anterior deje de tener reservas vigentes por pago, vencimiento o cancelación según reglas aprobadas. Repetir la misma intención recupera la orden existente. Reiteraciones, varias cuentas, excepciones y sanciones siguen pendientes, sin límites adicionales por defecto. No se aprueba con ello la cancelación voluntaria. | FR-003/011/015/020; RE-01/10. |
| PD-01 | Confirmada en RP003: el administrador fija precio por curso en soles (PEN). La orden conserva el precio confirmado durante las 24 horas de reserva; cambios de precio se aplican a nuevas reservas. Aún sin implementar. | US1/US2; FR-005/006/007; RF11/RF12. |
| PD-02 | Parcialmente confirmada: una matrícula por curso de la orden y su grupo elegido; cada selección contiene un solo grupo por curso. Se rechaza nueva reserva si el alumno ya tiene reserva o matrícula vigente del curso, también en otro grupo; repetir la misma intención recupera su resultado. Vigencia/finalización confirmadas D03. Siguen pendientes condiciones de oferta reservable y efectos de retiro, cambio o pérdida de habilitación sobre compromisos existentes, con RA-05/D06. | FR-001/003/008/011/013/021; RE-01/02/09. |
| PD-03 | Confirmada la matriz de este incremento: alumno reserva/inicia pago/consulta solo lo propio; administrador fija precios, consulta compromisos e incidencias de todos y registra seguimiento. Docente y visitante sin acceso financiero. Confirmación manual de pagos/matrículas, devoluciones y cancelaciones de compromisos no quedan habilitadas sin política específica aprobada RA-04/05. Ver matriz de operaciones y FR-015/016/019. | US1/US2/US4; FR-005/015/016/019/020; RE-10. |
| D03 | Confirmada vigencia ordinaria: desde confirmación por pago verificado hasta terminar la fecha final del grupo en America/Lima; después no vigente, con historial conservado. No reabre oferta ni aprueba cancelaciones/reembolsos. Cambios posteriores de fechas y demás efectos siguen RA-05/PD-02; el acceso a materiales/video queda en sus propios specs. | US2; FR-008/011/018; SC-003; RE-01/09. |

PD-01–PD-03 identifican vacíos derivados de RP001; no sustituyen ni renumeran RA-01–RA-06.
Las marcas priorizan preguntas de alcance y dinero; las filas parciales o pendientes
siguen abiertas. Resolver una cuestión no aprueba las demás de la tabla.

La primera ronda RP003 cerró cinco preguntas y cinco respuestas, conservadas sin
reescribir su evidencia. La segunda ronda confirma RA-02, la unicidad vigente por
alumno/curso de PD-02 y la matriz PD-03 de consulta/seguimiento y operaciones propias.
RA-04 se delimita a incidencia y seguimiento, sin habilitar cobros reales antes de
aprobar su resolución económica. D03 define vigencia desde confirmación por pago
hasta fin de la fecha final del grupo en America/Lima. Esta segunda ronda cierra
cinco preguntas y cinco respuestas; se difieren por ese límite RA-05/06 restantes,
condiciones de oferta de PD-02 y D06. D10/D13 conservan sus etapas y puertas de
capacidad/operación. Son bloqueos para las partes afectadas, no valores por defecto
ni permiso para avanzar al plan. La
cancelación de grupos conserva el bloqueo aprobado; no queda aprobada una operación
para resolver matrículas, devolver pagos o transferir alumnos. La siguiente ronda
de aclaración debe resolver o delimitar expresamente esos pendientes antes de RP004.

## User Scenarios & Testing *(mandatory)*

Los recorridos se priorizan por valor. Las pruebas independientes preparan sus
antecedentes con datos ficticios: no suponen una implementación sin dependencias.
Los casos sujetos a decisiones abiertas quedan bloqueados para aceptación hasta
registrar esas reglas. Ningún escenario siguiente se ha ejecutado en RP002/RP003.

### User Story 1 - Reservar y conocer el plazo y la orden (Priority: P1)

Como alumno habilitado, quiero elegir oferta y confirmar una reserva antes de pagar,
conocer su vencimiento y consultar los conceptos/total, para saber qué compromiso
obtuve y cuánto debo pagar dentro de su plazo.

**Why this priority**: Sin reserva confirmada no hay garantía de plaza previa al pago.

**Independent Test**: Con alumno y oferta preparados, confirmar una intención de
reserva y consultar su resultado desde otra sesión autorizada del mismo titular;
comprobar referencias, plazo e inventario final. La reserva múltiple es conjunta y
el precio por curso en PEN queda conservado durante la reserva, con una orden desglosada
y un pago total. Comprobar prioridad por admisión de solicitudes autenticadas y
válidas en el servidor, con desempate por secuencia única; comprobar que otra reserva
o matrícula vigente del curso impide una nueva reserva, también en otro grupo.
La matrícula es vigente desde confirmación por pago hasta terminar la fecha final
del grupo en America/Lima; las condiciones de elegibilidad siguen pendientes PD-02.

**Acceptance Scenarios**:

1. **Given** un alumno autorizado y una oferta reservable según PD-02, **When** el
   servidor confirma la reserva, **Then** el alumno obtiene su referencia, curso/grupo,
   inicio y vencimiento exacto 86 400 segundos después, con un compromiso persistido.
2. **Given** una selección o petición aún no confirmada, **When** el alumno consulta
   su estado, **Then** no se presenta como plaza reservada ni se habilita un pago sin
   la reserva previa requerida.
3. **Given** precios por curso en PEN fijados por el administrador, **When** solicita la orden con
   un importe alterado desde su dispositivo, **Then** el servidor obtiene los valores
   autorizados y conserva conceptos, importe y moneda utilizados; no cobra el valor manipulado.
4. **Given** una intención ya confirmada y respuesta perdida, **When** el alumno
   comprueba o repite la misma intención, **Then** recupera el mismo efecto de negocio,
   sin otra plaza, orden duplicada ni un nuevo plazo de 24 horas (RA-01/PD-02).
5. **Given** un último cupo y dos alumnos, **When** compiten por reservarlo, **Then**
   como máximo uno lo obtiene, sin inventario negativo y respetando el orden de
   admisión de solicitudes autenticadas y válidas registrado por el servidor;
   los empates se resuelven por su secuencia única, sin prioridad por clic o login.
6. **Given** varios cursos seleccionados y falta de plaza en uno, **When** confirma,
   **Then** no se confirma ninguna reserva de ese conjunto ni se dejan plazas
   parcialmente comprometidas; no queda una orden parcialmente reservada para pagar.
7. **Given** reserva confirmada y un cambio posterior de precio del curso, **When**
   el alumno consulta o paga durante las 24 horas de esa reserva, **Then** la orden
   conserva el precio confirmado; las nuevas reservas usan el precio vigente al confirmarlas.
8. **Given** varios cursos reservados conjuntamente, **When** consulta la orden,
   **Then** ve una sola orden con cada curso y grupo elegido, su precio confirmado
   y el total; se requiere un único pago por ese total, no pagos separados por curso.
9. **Given** una orden propia con reservas vigentes, **When** intenta confirmar
   otra intención, incluso simultáneamente, **Then** no obtiene otra orden con
   reservas vigentes ni se retienen más plazas por esa intención. Consultar o repetir
   la misma intención recupera la orden existente sin cambiar sus 24 horas.
10. **Given** solicitudes autenticadas y válidas por el último cupo cuyo clic u hora
    del dispositivo no coincide con su orden de admisión en servidor, **When** se
    asigna la reserva, **Then** prevalece el orden registrado por el servidor;
    si comparten instante de admisión, decide la secuencia única del servidor.
    La admisión sin confirmación no ocupa cupo ni inicia las 24 horas.
11. **Given** una selección con varios grupos del mismo curso, **When** se intenta
    confirmar, **Then** se rechaza sin reservas parciales ni elección automática de
    un grupo; el alumno debe elegir uno solo por curso.
12. **Given** una reserva o matrícula vigente de un curso, **When** solicita una
    nueva reserva del curso en el mismo u otro grupo, **Then** se rechaza sin retener
    otra plaza ni crear otra orden; la repetición de la misma intención recupera
    el resultado existente. La vigencia de matrícula aplica D03: desde confirmación
    por pago hasta terminar la fecha final del grupo en America/Lima.

### User Story 2 - Pagar y obtener matrícula confirmada (Priority: P1)

Como alumno con reserva confirmada, quiero que el pago reconocido de mi orden
confirme mi matrícula, para distinguir una matrícula efectiva de un pago pendiente,
una pantalla de éxito o una incidencia por conciliar.

**Why this priority**: Evita atribuir matrícula por información no confiable o duplicada.

**Independent Test**: Preparar reserva/orden según reglas aprobadas, contrastar una
confirmación de pago válida y otras inválidas, duplicadas y fuera de orden, y consultar
el resultado persistido del titular. La prueba del proveedor va separada del ensayo
con pagos simulados; al límite/tardío se exige incidencia sin matrícula ni reembolso
automáticos. La resolución económica posterior sigue pendiente en RA-04.

**Acceptance Scenarios**:

1. **Given** una reserva y pago que cumplen las reglas aprobadas, **When** el servidor
   verifica autenticidad, vínculo, importe y moneda, **Then** confirma la matrícula
   de cada curso incluido en la orden, vinculada al grupo elegido, y conserva su
   relación con reserva, orden y pago, sin duplicar compromisos vigentes del alumno
   en el mismo curso; la matrícula es vigente desde esa confirmación hasta terminar
   la fecha final del grupo en America/Lima, con historial conservado después.
2. **Given** una redirección o mensaje de éxito sin pago verificado, **When** vuelve
   el alumno, **Then** ve pago pendiente o estado comprobable, sin matrícula confirmada.
3. **Given** confirmación alterada, de otra orden, importe o moneda incorrectos,
   **When** se recibe, **Then** no confirma matrícula ni consume otra plaza y deja
   un resultado investigable sin exponer secretos.
4. **Given** el mismo pago ya procesado, **When** se repite o llega simultáneamente,
   **Then** no duplica matrícula, cobro solicitado ni consumo de inventario.
5. **Given** pago y vencimiento compitiendo o notificación tardía, **When** se
   concilian, **Then** solo una verificación terminada antes del vencimiento permite
   confirmar matrícula; al vencer o después se registra incidencia, sin matrícula
   ni reembolso automáticos ni extensión del plazo. Nunca se matricula sobre una
   plaza ya comprometida de manera incompatible.
6. **Given** pago/matrícula confirmados y un reinicio, **When** consulta de nuevo,
   **Then** conserva el resultado y las referencias, sin repetir efectos al reconstruir la vista.
7. **Given** un pago auténtico verificado al vencer o después, o sin plaza válida
   para confirmar matrícula, **When** lo consulta el titular, **Then** ve pago en
   conciliación sin matrícula, con referencia y seguimiento permitido; no ve una
   devolución, traslado o asignación manual prometidos. El plazo no se amplía.
8. **Given** una matrícula confirmada en un grupo cuyo período no ha terminado,
   **When** el titular consulta antes y al terminar su fecha final en America/Lima,
   **Then** es vigente desde la confirmación por pago hasta antes de las 00:00 del
   día siguiente a esa fecha; desde ese límite deja de estar vigente y conserva
   antecedentes. No se reabre oferta ni se ejecutan cancelaciones o reembolsos.

### User Story 3 - Vencer y liberar sin perder consistencia (Priority: P1)

Como alumno, quiero conocer si mi reserva sigue vigente o venció y, como institución,
quiero liberar una reserva vencida sin pago conforme a la conciliación aprobada,
para no retener plazas indefinidamente ni perder pagos en curso.

**Why this priority**: Completa las 24 horas y evita sobreventa o bloqueo por fallos.

**Independent Test**: Preparar una reserva con vencimiento conocido y sin pago válido,
observar antes/al llegar/después del límite, repetir conciliación y reiniciar el
servicio; contrastar estado e inventario finales. En pagos compitiendo se aplica el
límite estricto de RA-03; resolución económica de incidencias aún espera RA-04.

**Acceptance Scenarios**:

1. **Given** reserva confirmada, **When** el alumno cambia el reloj/zona de su equipo,
   cierra sesión o desconecta, **Then** el plazo persistido permanece 86 400 segundos.
2. **Given** reserva al completar las 24 horas sin pago válido conforme a RA-03,
   **When** se concilia, **Then** deja de retener el cupo y no se obtiene matrícula.
3. **Given** ejecución de conciliación retrasada o servicio detenido, **When** se
   recupera, **Then** el retraso no extiende vigencia y la liberación respeta RA-03/04,
   sin ofrecer simultáneamente la misma plaza a compromisos incompatibles.
4. **Given** reserva ya liberada, **When** se repite o concurre la conciliación,
   **Then** no libera dos veces ni incrementa artificialmente la disponibilidad.
5. **Given** pago al límite y nueva asignación compitiendo, **When** terminan los
   intentos, **Then** la verificación terminada exactamente al vencer o después
   queda como incidencia, sin matrícula ni reembolso automáticos ni extensión del
   plazo; no se excede capacidad ni se pierde la identificación del pago recibido.

### User Story 4 - Consultar compromisos e investigar incidencias autorizadas (Priority: P2)

Como alumno, quiero consultar mis reservas, órdenes y matrículas con estados claros;
y como administrador, quiero consultar compromisos e incidencias de los alumnos y
registrar seguimiento, para investigar sin alterar compromisos fuera de reglas aprobadas.

**Why this priority**: Hace utilizable y trazable el recorrido cuando algo falla;
las garantías de acceso e integridad son obligatorias también en las historias P1.

**Independent Test**: Con compromisos en estados previstos, probar titular/ajeno y
cada operación de la matriz aprobada; intentar cancelar un grupo con cada tipo de
compromiso bloqueante y comprobar rechazo sin cambios ni pérdida de historial.
Otros efectos de cancelación y resolución económica esperan políticas posteriores
RA-04/05; registrar seguimiento no resuelve una incidencia ni desbloquea la cancelación.

**Acceptance Scenarios**:

1. **Given** un alumno con compromisos propios, **When** los consulta desde su inicio,
   **Then** distingue referencia, oferta vinculada, importe/moneda, plazo y estado;
   no ve compromisos ni datos personales o financieros de otro alumno.
2. **Given** actor sin sesión o sin permiso vigente, **When** pide leer o modificar
   un compromiso por su referencia, **Then** se deniega sin revelar datos privados ni ocupar/liberar cupos.
3. **Given** un grupo con reservas vigentes, matrículas o incidencias de pago sin
   resolver, **When** el administrador intenta cancelarlo, **Then** se impide la
   cancelación sin modificar grupo ni compromisos y conservando antecedentes.
   Primero deben resolverse conforme a políticas autorizadas; no se inventan
   devolución, traslado o cancelación financiera. La cancelación terminal sigue vigente.
4. **Given** resultado incierto por pérdida de conexión, **When** vuelve el alumno,
   **Then** puede comprobar el estado y repetir la misma intención si procede;
   no ve éxito, fallo definitivo o nuevo vencimiento sin confirmación del servidor.
5. **Given** una orden propia con reservas vigentes, **When** intenta crear otra,
   **Then** se deniega sin retener plazas adicionales ni revelar compromisos ajenos.
   Controles adicionales de reiteración o varias cuentas esperan aprobación en RA-06.
6. **Given** un administrador con permisos vigentes, **When** consulta compromisos
   e incidencias de un alumno y registra seguimiento, **Then** recibe solo los datos
   necesarios y queda constancia de actor, momento y seguimiento; no se modifica el
   pago, matrícula, reserva ni vencimiento por registrar ese seguimiento.
7. **Given** docente o visitante, o un alumno solicitando un compromiso ajeno o
   seguimiento administrativo, **When** intenta una operación financiera de esta
   matriz, **Then** se deniega sin datos privados ni efectos sobre cupos o compromisos.
8. **Given** una incidencia de pago sin resolver, **When** el administrador anota
   seguimiento, **Then** sigue pendiente de resolución económica, no se habilita
   matrícula, devolución, traslado o asignación manual y no se elimina el bloqueo
   de cancelación de grupo por esa incidencia.

### Edge Cases

| ID de origen | Caso a verificar y resultado exigido o decisión bloqueante |
| --- | --- |
| RE-01 | Doble clic, timeout y duplicado simultáneo: un efecto, referencias/plazo conservados. Una selección contiene un grupo por curso; una nueva intención se rechaza si existe reserva o matrícula vigente del curso, incluso en otro grupo. Matrícula vigente desde confirmación por pago hasta fin de fecha final del grupo en America/Lima; conservar historial al terminar. |
| RE-02 | Último cupo con dos alumnos: prioridad por admisión de solicitudes autenticadas y válidas en servidor, empate por secuencia única; no por clic/login/reloj cliente ni por terminación accidental de peticiones. No sobreventa; si cambia oferta al confirmar, condiciones pendientes PD-02. |
| RE-03 | Cierre/desconexión tras confirmar o pagar: recuperar resultado persistido sin reiniciar plazo ni repetir consumo. |
| RE-04 | Reinicio antes/después de confirmación, pago o vencimiento: reconstruir estado; nada depende de sesión o proceso abierto. |
| RE-05 | Instante anterior, exacto y posterior a 24 h; reloj del alumno alterado: solo verificación terminada antes permite matrícula; al vencer o después, incidencia sin matrícula/reembolso automáticos ni extensión. |
| RE-06 | Conciliación retrasada, repetida o simultánea y reasignación: una liberación y estado final consistente, sin plazo adicional. |
| RE-07 | Pago alterado, duplicado o fuera de orden: verificar origen/orden/importe/moneda y evitar doble matrícula/consumo. |
| RE-08 | Pago iniciado antes pero verificado al vencer o después, incluso por notificación tardía, o pago verificado sin plaza válida: incidencia, alumno ve pago en conciliación sin matrícula, seguimiento administrativo sin resolución ni extensión. Verificación terminada antes no se vuelve tardía por consultar después. Sin devolución/traslado/asignación manual en este incremento; política económica previa a cobros reales RA-04. |
| RE-09 | Intento de cancelar grupo con reserva vigente, matrícula o incidencia de pago sin resolver: impedir cancelación sin cambios parciales ni pérdida de historial, también si concurre con otro compromiso. Retiro/cambio docente/horario y resolución de compromisos siguen RA-05/PD-02, sin efectos económicos supuestos. |
| RE-10 | Varias intenciones simultáneas del mismo alumno: como máximo una orden con reservas vigentes, sin plazas retenidas por la intención rechazada. Referencia ajena/rol cambiado/sesión revocada: permisos actuales. Reiteraciones, varias cuentas y excepciones aún pendientes RA-06. |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El alumno DEBE poder consultar oferta y solicitar reserva de un grupo
  por curso, con condiciones vigentes comprobadas por el servidor al confirmar.
  Las condiciones de oferta reservable aún pendientes se resuelven en PD-02;
  una consulta anterior o datos del dispositivo no bastan para autorizarla.
- **FR-002**: Capacidad configurada, ocupación, reservas y disponibilidad DEBEN
  distinguirse; la capacidad configurada conserva el rango 1–50 de PA-04. Solo
  presentar disponibilidad cuando exista cálculo real según las
  reglas aprobadas; una cifra consultada no garantiza la reserva. Hasta implementar
  ese cálculo, conservar «Ocupación y disponibilidad no calculadas» de 002.
- **FR-003**: DEBE existir reserva confirmada por el servidor antes de permitir su
  pago. Confirmar identifica titular, oferta, inicio, vencimiento y compromiso de cupo.
  Varios cursos se reservan todos juntos o ninguno y se vinculan a una orden
  desglosada con un pago total según RA-01. Solo una orden con reservas vigentes
  por alumno según RA-06. Cada selección contiene un solo grupo por curso; se
  rechaza nueva reserva con reserva o matrícula vigente del curso según PD-02.
- **FR-004**: Una reserva confirmada DEBE durar exactamente 24 horas, 86 400 segundos
  desde su confirmación por el servidor. Inicio y vencimiento se conservan aun con
  desconexión, cierre, repetición o reinicio; no se reinicia ni amplía ese plazo.
- **FR-005**: El administrador DEBE fijar el precio por curso en soles (PEN). El
  servidor obtiene esos precios, calcula conceptos/total y conserva el precio
  confirmado en la orden durante las 24 horas de reserva. Cambios posteriores solo
  aplican a nuevas reservas; el importe enviado por el alumno no es autoridad y no
  se infiere precio cero desde oferta sin precio.
- **FR-006**: Una selección reservada conjuntamente DEBE producir una sola orden
  desglosada por curso y grupo elegido, vinculada a titular y reservas, con sus
  precios confirmados en PEN y un total. Se exige un único pago por ese total;
  la orden conserva los precios durante las 24 horas según PD-01.
- **FR-007**: DEBE verificarse el pago con el proveedor elegido, comprobando
  autenticidad, orden, identidad del pago, importe y moneda. Una pantalla de éxito
  no confirma pago ni matrícula. El instante de referencia es cuando el servidor
  termina de verificar el pago y DEBE ser estrictamente anterior al vencimiento
  para confirmar matrícula. Exactamente al vencer o después se registra incidencia,
  sin matrícula ni reembolso automáticos y sin extender la reserva.
- **FR-008**: Pago verificado válido según las reglas temporales y de conciliación
  aprobadas DEBE confirmar una matrícula por cada curso incluido en la orden,
  vinculada al grupo elegido y sus antecedentes, sin duplicar compromisos vigentes
  del alumno por curso. La matrícula DEBE ser vigente desde confirmación por pago
  hasta terminar la fecha final del grupo en America/Lima; después deja de estar
  vigente y conserva su historial, sin reabrir oferta, cancelar o devolver pagos.
  Cambios posteriores de fechas siguen pendientes RA-05/PD-02. Un pago
  verificado al vencer o después queda como incidencia según RA-03;
  y un pago verificado sin plaza válida también queda como incidencia: alumno ve
  pago en conciliación sin matrícula y administrador puede registrar seguimiento.
  No ejecutar devoluciones, traslados ni asignaciones manuales en este incremento;
  política y procedimiento económicos DEBEN aprobarse antes de cobros reales.
- **FR-009**: Vencimiento sin pago válido DEBE liberar el cupo conforme a conciliación
  consistente. Un proceso retrasado no extiende la reserva; repeticiones no liberan
  dos veces. Al vencer o después, una verificación terminada no renueva la reserva
  ni impide su liberación: registra incidencia sin matrícula/reembolso automáticos.
- **FR-010**: Confirmación de reserva, orden y efectos sobre inventario DEBEN
  conservarse o rechazarse sin cambios parciales: varios cursos se reservan todos
  juntos o ninguno, vinculados a una orden desglosada con un pago total.
  Matrícula y liberación mantienen consistencia conforme a las reglas que se aprueben.
- **FR-011**: Misma intención repetida, simultánea o con respuesta perdida DEBE
  conservar un solo efecto, referencias y plazo; un contenido distinto no se acepta
  silenciosamente como la repetición anterior. Una nueva intención DEBE rechazarse
  si el alumno tiene reserva o matrícula vigente del curso, aunque elija otro grupo;
  no se retienen plazas por esa petición. La vigencia de matrícula sigue D03,
  desde confirmación por pago hasta terminar la fecha final del grupo en America/Lima.
- **FR-012**: Confirmaciones concurrentes DEBEN impedir comprometer más plazas que
  la capacidad aplicable; al convertir una reserva en matrícula no se consume otra
  plaza adicional. La prioridad DEBE seguir el orden de admisión en el servidor de
  solicitudes autenticadas y válidas, con desempate por una secuencia única del
  servidor. Clic, inicio de sesión y reloj del alumno no dan prioridad ni reservan
  cupo. Esta regla no altera la reserva conjunta de varios cursos, todos o ninguno.
- **FR-013**: Pago, vencimiento, liberación y reasignación concurrentes DEBEN producir
  un resultado persistido conciliable, sin doble consumo, doble liberación ni matrícula
  incompatible con otro compromiso confirmado. Solo verificación terminada antes
  del vencimiento permite matrícula; al vencer o después queda incidencia sin
  extensión del plazo. Incidencia y seguimiento no alteran por sí mismos inventario,
  matrícula ni resolución económica; esta última queda fuera del incremento RA-04.
- **FR-014**: El servidor DEBE impedir cancelar un grupo mientras existan reservas
  vigentes, matrículas o incidencias de pago sin resolver, sin cambios parciales y
  conservando antecedentes. Primero deben resolverse esos compromisos conforme a
  políticas autorizadas; se conserva la cancelación terminal de grupos de 002.
  Cancelación voluntaria de reserva/orden/matrícula, cambios de grupo/horario,
  efectos económicos y responsables de resolución siguen pendientes en RA-04/05.
- **FR-015**: El servidor DEBE comprobar cuenta, sesión, rol, permiso vigente y
  propiedad en cada operación según la matriz PD-03: alumno reserva, inicia pago y
  consulta solo lo propio; administrador fija precios, consulta compromisos e
  incidencias de todos y registra seguimiento; docente y visitante sin acceso
  financiero. Denegar lo no concedido por defecto, sin cambios ni datos ajenos;
  gestionar oferta no concede otros permisos financieros. No habilitar confirmación
  manual de pago/matrícula, devolución o cancelación de compromisos sin política aprobada.
- **FR-016**: Cada actor DEBE recibir solo datos necesarios y autorizados. No exponer
  credenciales, secretos de verificación o datos sensibles del medio de pago en vistas,
  mensajes ni registros; causas privadas de identidad/oferta no se trasladan al alumno.
- **FR-017**: La interfaz DEBE distinguir carga, vacío, validación, confirmación,
  pago pendiente, matrícula confirmada, vencimiento, conflicto, acceso denegado y error
  recuperable; conservar entradas al fallar y permitir comprobar un resultado incierto.
  Mostrar plazo autoritativo sin depender del reloj del dispositivo; usable con teclado
  y móvil/escritorio, sin presentar selección como reserva o pago pendiente como matrícula.
  Un pago verificado tardío o sin plaza válida DEBE mostrarse como pago en
  conciliación sin matrícula, distinto de pago aún no verificado y de resolución
  económica concluida; el seguimiento no implica devolución ni nueva asignación.
- **FR-018**: Tras desconexión o reinicio DEBE recuperarse el estado confirmado por
  referencia y titular autorizado, sin exigir mantener una sesión abierta durante
  las 24 horas ni volver a ejecutar efectos para mostrar el resultado.
- **FR-019**: Cambios y conciliaciones DEBEN ser atribuibles a actor/origen, compromiso,
  momento y resultado, conservando el vínculo entre reserva, orden, pago y matrícula
  sin secretos. El seguimiento administrativo DEBE conservar actor, momento y
  contenido necesario sin modificar por sí mismo pago, matrícula, reserva o plazo.
  Tampoco DEBE marcar una incidencia como resuelta económicamente ni eliminar por
  anotación su bloqueo de cancelación de grupo.
  La retención/custodia sigue pendiente de D13, sin plazos inventados.
- **FR-020**: El servidor DEBE impedir más de una orden con reservas vigentes por
  alumno, también ante intenciones distintas simultáneas. Puede incluir varios
  cursos; otra orden requiere que la anterior deje de tener reservas vigentes por
  pago, vencimiento o cancelación según reglas aprobadas. Consultar o repetir la
  misma intención recupera la existente sin otro efecto. Los rechazos no retienen
  plazas ni filtran datos. Reiteraciones, varias cuentas, excepciones y sanciones
  siguen pendientes en RA-06; cuotas de identidad no las sustituyen. Esta regla
  no concede permiso de cancelación voluntaria ni define su efecto económico.
- **FR-021**: DEBEN conservarse identidad y reglas PA-01–PA-05/E1 de oferta. Los
  efectos sobre compromisos existentes cuando se retira/cancela/cambia oferta o pierde
  habilitación el docente siguen RA-05/PD-02; la cancelación con compromisos
  bloqueantes se impide según FR-014, incluso si concurre con su confirmación.
  Horarios America/Lima no resuelven
  conflictos de matrícula del alumno, que permanecen en D06.
- **FR-022**: DEBEN conservarse cuentas, configuración, datos y evidencia existentes;
  comprobar regresiones afectadas y recuperación antes de operar datos persistentes.
  No declarar resueltos T073/T074, T104/T108, bootstrap o pendientes de operación por
  preparar o aprobar el nuevo spec.
- **FR-023**: La evaluación de capacidad DEBE distinguir población de al menos
  15 000 cuentas, usuarios activos, solicitudes simultáneas/en vuelo, tasa de peticiones
  y capacidad/consistencia de reservas. El objetivo de 2500 activos espera escenario
  y criterios D10; no se acredita desde cifras históricas ni desde el aforo de grupos.
  La evaluación operativa respeta S/300 total, sin contratación implícita.
- **FR-024**: La carga DEBE usar pagos simulados y datos ficticios; la integración
  de pago real se verifica separadamente en el entorno de pruebas del proveedor.
  Una simulación no aprueba autenticidad real y no se somete la pasarela a carga.
  Habilitar cobros reales exige además política y procedimiento de resolución
  económica aprobados; este incremento no ejecuta devoluciones, traslados ni
  asignaciones manuales para resolver incidencias.

**Matriz aprobada de operaciones (PD-03)**

| Operación | Administrador | Alumno | Docente | Visitante |
| --- | --- | --- | --- | --- |
| Fijar precio por curso | Sí | No | No | No |
| Reservar e iniciar pago | No | Solo lo propio | No | No |
| Consultar compromisos e incidencias individuales | Todos, con datos necesarios | Solo lo propio | No | No |
| Registrar seguimiento de incidencias | Sí | No | No | No |
| Confirmar manualmente pago o matrícula | No habilitado | No | No | No |
| Devolver dinero, trasladar o asignar plazas manualmente | Fuera de este incremento RA-04 | No | No | No |
| Cancelar compromisos voluntariamente | No habilitado; política RA-05 pendiente | No habilitado | No | No |
| Cancelar grupo de oferta | Según 002 y bloqueo FR-014 | No | No | No |

La verificación del proveedor y conciliación del servidor siguen FR-007–013; no
son facultad de confirmación manual de un rol ni de la pantalla del alumno. La
denegación financiera al docente no altera sus grupos propios autorizados en 002.

### Key Entities *(include if feature involves data)*

- **Oferta reservable**: referencia al curso/grupo existente y condiciones vigentes
  de PD-02; capacidad configurada no equivale a plazas garantizadas.
- **Reserva**: compromiso confirmado de titular y oferta, referencia estable, inicio,
  vencimiento exacto y resultado; solo un grupo por curso en la selección. Una
  reserva o matrícula vigente del alumno/curso impide una nueva reserva, también
  en otro grupo; repetir la misma intención recupera su resultado.
- **Solicitud admitida**: petición autenticada y válida con orden de admisión
  registrado por el servidor y secuencia única de desempate según RA-02. La admisión
  no es una reserva confirmada ni inicia sus 24 horas.
- **Orden y detalle**: conceptos/importe en PEN y vínculos de reserva; precio por
  curso fijado por administración y conservado durante las 24 horas de reserva.
  Una orden por selección reservada conjuntamente, desglosada por curso/grupo,
  con un pago por el total según RA-01. Como máximo una orden con reservas vigentes
  por alumno, sin confundir orden histórica o pagada con una reserva vigente.
- **Pago verificado**: referencia del proveedor, vínculo a orden, importe/moneda,
  evidencia de autenticidad, resultado e instante en que el servidor termina de
  verificarlo; solo si es anterior al vencimiento permite matrícula. Exactamente
  al vencer o después produce incidencia sin matrícula/reembolso automáticos ni
  extensión; resolución económica pendiente RA-04.
- **Matrícula**: una por cada curso incluido en la orden tras pago válido, vinculada
  al titular, al único grupo elegido y a sus antecedentes. Una matrícula vigente
  del alumno/curso impide otra reserva del curso, también en otro grupo. Vigente
  desde confirmación por pago hasta terminar la fecha final del grupo en America/Lima
  (antes de las 00:00 del día siguiente); después no vigente y con historial.
  Cambios de fechas y efectos sobre compromisos siguen pendientes RA-05/PD-02.
- **Resultado de conciliación**: relación de hechos de reserva/pago/vencimiento/
  reasignación y resolución conforme a RA-03/04/05, preservando antecedentes.
- **Seguimiento de incidencia**: anotación del administrador vinculada al compromiso,
  con actor, momento y contenido necesario, sin secretos ni cambios implícitos de
  pago, matrícula, reserva o plazo. No equivale a resolución económica aprobada ni
  cambia por sí mismo la incidencia a resuelta.

Los nombres anteriores describen conceptos del negocio; no aprueban un catálogo
cerrado de estados, estructura de almacenamiento ni operaciones técnicas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

Criterios para verificar después de resolver decisiones e implementar. Ninguno
está demostrado en RP002/RP003; un criterio condicionado no se da por aprobado.

- **SC-001**: En cada reserva confirmada de los escenarios aprobados, el alumno
  identifica referencia, oferta e inicio/vencimiento; su diferencia es exactamente
  86 400 segundos. Desconexión/reinicio/repetición no cambian ese valor (US1/US3).
- **SC-002**: En el 100 % de casos de importe manipulado, cambio de precio durante
  reserva y selección conjunta de cursos, el desglose de la única orden y su pago
  total en PEN corresponden a los precios por curso confirmados y conservados 24 horas;
  cero órdenes aceptadas con el importe del alumno como autoridad.
- **SC-003**: Pago total válido de la orden confirma una matrícula por cada curso
  incluido, vinculada a su grupo elegido; duplicados, confirmaciones inválidas y
  respuestas de éxito sin verificación producen cero matrículas o consumos
  adicionales (US2; RA-03/04/PD-02).
  En todos los casos de nueva intención con reserva o matrícula vigente del mismo
  curso hay cero reservas adicionales, incluso si se elige otro grupo; seleccionar
  varios grupos del curso deja cero reservas parciales (US1; PD-02/D03).
  En todos los casos de límite ordinario de matrícula, es vigente desde confirmación
  por pago hasta antes de las 00:00 del día siguiente a la fecha final del grupo
  en America/Lima; desde ese límite hay cero matrículas presentadas como vigentes
  por ese período y se conserva el historial, sin reapertura ni reembolso implícitos.
- **SC-004**: En los casos antes/al llegar/después del vencimiento, con retraso,
  repetición y reinicio, hay cero extensiones de plazo y cero dobles liberaciones;
  el inventario final coincide con los compromisos válidos. El 100 % de pagos cuya
  verificación termina exactamente al vencer o después queda como incidencia, con
  cero matrículas y reembolsos automáticos por esa incidencia (US2/US3; RA-03/04).
  Todo pago verificado tardío o sin plaza válida se muestra en conciliación sin
  matrícula; registrar seguimiento produce cero resoluciones económicas, devoluciones,
  traslados o asignaciones manuales y no elimina bloqueos de cancelación de grupo.
- **SC-005**: Dos alumnos por un último cupo obtienen como máximo una reserva
  confirmada para esa plaza; en todos los órdenes de carrera aprobados de pago/
  vencimiento/reasignación/cancelación hay cero sobreventas y cero pérdida de trazabilidad.
  Un conjunto de cursos que no puede reservarse completo deja cero reservas parciales.
  El 100 % de intentos de cancelar grupo con reserva vigente, matrícula o incidencia
  de pago sin resolver deja cero cancelaciones y cero cambios en sus compromisos.
  En el 100 % de casos de último cupo con solicitudes autenticadas y válidas, se
  respeta el orden de admisión servidor y su secuencia única de desempate, también
  cuando clic, reloj del alumno o finalización de peticiones sugieren otro orden.
- **SC-006**: El 100 % de combinaciones de la matriz PD-03 aprobada y de los casos
  RA-06 definidos responde conforme a permiso/propiedad vigentes, con cero datos
  privados o cambios entregados en solicitudes denegadas. En intenciones distintas
  simultáneas de un alumno queda como máximo una orden con reservas vigentes y
  cero plazas retenidas por las intenciones rechazadas (US1–US4).
  Todo seguimiento administrativo conserva actor y momento, con cero cambios de
  pago, matrícula, reserva o plazo por anotarlo; docente/visitante no acceden a datos
  financieros y el alumno no obtiene datos ajenos ni permisos administrativos.
- **SC-007**: Los cuatro recorridos se verifican con teclado y móvil/escritorio,
  incluidos vacío, error y resultado incierto; cero confirmaciones de reserva,
  matrícula o nuevo plazo sin respaldo del servidor. Observación humana y evidencia
  automática se registran separadamente, sin inventar participantes o umbrales de uso.
- **SC-008**: El informe de evaluación identifica población de al menos 15 000
  cuentas, usuarios activos, solicitudes en vuelo y reservas confirmadas por separado,
  con errores, tiempos, recursos y costo total. El objetivo de 2500 activos solo se
  considera alcanzado con evidencia del escenario y criterios D10 acordados; sin
  estos o sin alcanzar el objetivo, permanece pendiente. S/300 es el límite total.

## Assumptions

- Se reutilizan cuentas, roles e identidad existentes; no se crean usuarios por
  reserva ni se introduce otro sistema de acceso. Esto no concede permisos nuevos.
- «Mismo intento» y «duplicado de negocio» son conceptos diferentes: la referencia
  de intención permite recuperar el resultado. Una nueva reserva se impide con
  reserva o matrícula vigente del alumno/curso, también en otro grupo; la duración
  y finalización ordinarias siguen el período D03 confirmado, sin prohibir compras
  futuras por defecto ni reabrir oferta al terminar una matrícula.
- La reserva dura 24 horas aunque cierre la sesión; no se interpreta el tiempo de
  sesión, vigencia del horario o espera de admisión como plazo de reserva.
- Izipay es el proveedor elegido en la constitución; acceso al entorno de pruebas,
  modalidad/Yape, tarifas y límites siguen pendientes. No hay integración acreditada.
- El seguimiento administrativo sí está aprobado; no equivale a resolver pagos,
  aprobar descuentos/cuotas/tolerancias, devolver dinero o trasladar alumnos.
  Si alguna regla hace falta se aclara, sin inventarla por defecto ni habilitar
  cobros reales con resolución económica pendiente.

### Dependencias y restricciones

- [RP001](research.md) identifica que todavía falta la superficie pública para
  coordinar validación de oferta y reserva; el diseño pertenece a RP004. No convertir
  los detalles del inventario en reglas del negocio ni en un plan ya aprobado.
- INV-DOC-01: actores/HU/RF conservan frases de estado anteriores a 002. Para estado
  y permisos de oferta se usan [PA-01–PA-05](../002-oferta-academica/spec.md) y
  [aceptación parcial](../002-oferta-academica/evidence/acceptance.md), no esas frases obsoletas.
- [Observación humana 002](../002-oferta-academica/evidence/human-acceptance.md)
  sigue aplazada, T073/T074 sin marcar. Identidad conserva T103 como ejecución/informe
  sin capacidad aprobada y T104/T108 pendientes. Bootstrap, timeouts históricos,
  SMTP externo, CI remoto, D10/D13 y video/protección/alojamiento siguen pendientes.
- Alcance de este incremento futuro: reserva, orden, pago verificado, matrícula,
  vencimiento y registro/seguimiento de incidencias de conciliación aprobados.
  Quedan fuera devoluciones, traslados, asignaciones manuales de plazas, materiales,
  clases, video/chat, sustitución de identidad/oferta, infraestructura AWS y paneles
  no necesarios al recorrido. RA-04 bloquea cobros reales hasta aprobar política y
  procedimiento de resolución económica, además de verificar la integración Izipay.
- No desplegar, contratar, cargar servicios, crear cuentas o cambiar datos en RP002/RP003.
  Se conserva la base existente; evolución técnica, recuperación, acceso controlado y
  evaluación en servidor con generador en otro equipo esperan sus etapas/decisiones.

### Trazabilidad

| Fuente | Historias | Requisitos | Criterios |
| --- | --- | --- | --- |
| HU10 / RF11 / RC-03/04 | US1/US3 | FR-001–006/009–013/017/018 | SC-001/002/004/005/007 |
| HU11 / RF12/13 / RC-05/06 | US2/US3 | FR-007–014/018/019/024 | SC-003/004/005 |
| RF08/09 y constitución II/VI/IX | US1–US4 | FR-010/011/015/016/019/020/022 | SC-005/006/007 |
| Oferta 002, D04/D06, RE-09/10 | US1/US4 | FR-001/002/012/014/015/020/021 | SC-005/006/007 |
| RC-01/02/07, constitución XI | Transversal | FR-023/024 | SC-008 |

RE-01–RE-10 están desglosados en Edge Cases. Las dos respuestas de specify se
conservan; RP003 confirma PD-01, composición de orden/pago/matrículas de RA-01,
límite estricto/incidencia de RA-03, una orden con reservas vigentes por alumno de
RA-06 y bloqueo de cancelación con compromisos de RA-05. Resolución económica de
RA-04 queda fuera del incremento salvo incidencia/seguimiento y bloquea cobros
reales hasta aprobar política/procedimiento; el resto de RA-05/06, condiciones de
oferta de PD-02 y D06 siguen pendientes. La segunda ronda confirma prioridad por
admisión y desempate de RA-02, unicidad
vigente del alumno/curso de PD-02 y la matriz de consulta/seguimiento y operaciones
propias de PD-03, delimita RA-04 y confirma vigencia/finalización ordinarias D03. No se
atribuye aprobación a alternativas no respondidas.
