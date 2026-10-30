# Feature Specification: reservas, órdenes y matrícula

**Feature Branch**: `feat/003-reservas-ordenes-matricula`

**Created**: 2026-10-30, America/Lima.

**Status**: Borrador RP002; requiere aclaraciones. Sin implementación ni aceptación.

**Input**: El alumno reserva antes de pagar; la reserva confirmada por el servidor
conserva el cupo durante exactamente 24 horas. El pago verificado confirma matrícula;
el vencimiento sin pago libera el cupo mediante conciliación consistente. Se requieren
al menos 15 000 cuentas, objetivo de 2500 usuarios concurrentes activos aún por demostrar
y presupuesto S/300 total. Conservar identidad/oferta y no inventar reglas pendientes.

## Alcance confirmado y decisiones abiertas

Fuentes: [constitución 1.2.0](../../.specify/memory/constitution.md),
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
| RC-05 | Pago verificado confirma matrícula. | Autenticidad, orden, importe y moneda verificados. Tratamiento al límite/tardío aún depende de RA-03/04. |
| RC-06 | Vencimiento sin pago libera cupo mediante conciliación consistente. | No doble consumo/liberación ni sobreventa. Falta política de conciliación y precedencia. |
| RC-07 | S/300 como presupuesto total. | No mensual, sin contratación, despliegue ni garantía de sostener el objetivo. |

### Clarifications — sesión 2026-10-30

- RA-01, respuesta del responsable: «A. Confirmar todas juntas o ninguna; la
  composición y el pago de la orden se aclararán aparte». Se aprueba la reserva
  conjunta, no el desglose, número de órdenes/pagos o identidad de matrícula.
- RA-03, respuesta del responsable: «A. El instante en que el servidor termina de
  verificar el pago». Se aprueba esa referencia temporal, no la comparación en el
  instante exacto del vencimiento ni la resolución tardía o sus reembolsos.
- PD-01 continúa sin respuesta. RP003 no se considera ejecutada ni completa por
  registrar estas dos aclaraciones parciales durante specify.

### Registro de decisiones parciales y pendientes

| ID | Cuestión abierta y efecto | Requisitos/escenarios afectados |
| --- | --- | --- |
| RA-01 | Parcialmente confirmada: reservas de varios cursos, todas juntas o ninguna. [NEEDS CLARIFICATION: ¿Cómo se compone la orden y su pago para ese conjunto de reservas?] Un pago total y una matrícula por curso siguen siendo propuesta, no regla. | US1/US2; FR-003/005/006/008/010/011; RE-01/02. |
| RA-02 | Prioridad y desempate por último cupo: FIFO, turnos u otra política, e instante de referencia. Sin prioridad aprobada. | FR-012/023; RE-02. |
| RA-03 | Parcialmente confirmada: referencia temporal cuando el servidor termina de verificar el pago. [NEEDS CLARIFICATION: ¿Cómo se resuelve la verificación exactamente al vencimiento y una verificación tardía, coordinada con RA-04?] No se introduce tolerancia ni se extienden las 24 horas. | US2/US3; FR-007/008/009/013; RE-05/08. |
| RA-04 | Pago tardío o sin plaza, reembolsos y conciliación: resolución y responsables, sin confirmar matrícula ni devolución automáticamente. | FR-008/009/013/014; RE-07/08/09. |
| RA-05 | Cancelar reserva/orden/matrícula, cancelar grupo con compromisos, cambiar grupo/horario y efectos económicos. Cancelación editorial terminal de 002 se conserva; no resuelve esos efectos. | US4; FR-014/015/021; RE-09. |
| RA-06 | Prevención del bloqueo abusivo: límites, reiteraciones, excepciones y recuperación. No se aprueban cuotas ni sanciones por defecto. | FR-015/020; RE-10. |
| PD-01 | [NEEDS CLARIFICATION: ¿Quién define el precio y moneda, a qué unidad académica corresponden y qué vigencia mantiene el importe de una reserva u orden ya confirmada?] RP001 confirma que oferta aún no contiene esa fuente. | US1/US2; FR-005/006/007; RF11/RF12. |
| PD-02 | Identidad de reserva/matrícula y duplicado de negocio; condiciones de oferta reservable y efectos de retiro, cambio o pérdida de habilitación sobre compromisos existentes. Aclarar junto con RA-01/05 y D06, sin inventar una matrícula por grupo o por curso. | FR-001/008/011/013/021; RE-01/02/09. |
| PD-03 | Matriz de operaciones financieras/académicas y datos por actor, incluidos consulta administrativa e intervención en incidencias. Los permisos de 001/002 no conceden estas operaciones. | US4; FR-015/016/019/020; RE-10. |

PD-01–PD-03 identifican vacíos derivados de RP001; no sustituyen ni renumeran RA-01–RA-06.
Las tres marcas priorizan preguntas de alcance y dinero; las otras filas también
permanecen abiertas. Resolver una marca no aprueba las demás cuestiones de la tabla.

## User Scenarios & Testing *(mandatory)*

Los recorridos se priorizan por valor. Las pruebas independientes preparan sus
antecedentes con datos ficticios: no suponen una implementación sin dependencias.
Los casos sujetos a decisiones abiertas quedan bloqueados para aceptación hasta
registrar esas reglas. Ningún escenario siguiente se ha ejecutado en RP002.

### User Story 1 - Reservar y conocer el plazo y la orden (Priority: P1)

Como alumno habilitado, quiero elegir oferta y confirmar una reserva antes de pagar,
conocer su vencimiento y consultar los conceptos/total, para saber qué compromiso
obtuve y cuánto debo pagar dentro de su plazo.

**Why this priority**: Sin reserva confirmada no hay garantía de plaza previa al pago.

**Independent Test**: Con alumno y oferta preparados, confirmar una intención de
reserva y consultar su resultado desde otra sesión autorizada del mismo titular;
comprobar referencias, plazo e inventario final. La reserva múltiple es conjunta;
composición de orden, precio, unidad, duplicado y prioridad conservan los pendientes
de RA-01/02 y PD-01/02.

**Acceptance Scenarios**:

1. **Given** un alumno autorizado y una oferta reservable según PD-02, **When** el
   servidor confirma la reserva, **Then** el alumno obtiene su referencia, curso/grupo,
   inicio y vencimiento exacto 86 400 segundos después, con un compromiso persistido.
2. **Given** una selección o petición aún no confirmada, **When** el alumno consulta
   su estado, **Then** no se presenta como plaza reservada ni se habilita un pago sin
   la reserva previa requerida.
3. **Given** precios válidos definidos según PD-01, **When** solicita la orden con
   un importe alterado desde su dispositivo, **Then** el servidor obtiene los valores
   autorizados y conserva conceptos, importe y moneda utilizados; no cobra el valor manipulado.
4. **Given** una intención ya confirmada y respuesta perdida, **When** el alumno
   comprueba o repite la misma intención, **Then** recupera el mismo efecto de negocio,
   sin otra plaza, orden duplicada ni un nuevo plazo de 24 horas (RA-01/PD-02).
5. **Given** un último cupo y dos alumnos, **When** compiten por reservarlo, **Then**
   como máximo uno lo obtiene, sin inventario negativo; prioridad/respuestas siguen RA-02.
6. **Given** varios cursos seleccionados y falta de plaza en uno, **When** confirma,
   **Then** no se confirma ninguna reserva de ese conjunto ni se dejan plazas
   parcialmente comprometidas. Su composición de orden y pago sigue pendiente de RA-01.

### User Story 2 - Pagar y obtener matrícula confirmada (Priority: P1)

Como alumno con reserva confirmada, quiero que el pago reconocido de mi orden
confirme mi matrícula, para distinguir una matrícula efectiva de un pago pendiente,
una pantalla de éxito o una incidencia por conciliar.

**Why this priority**: Evita atribuir matrícula por información no confiable o duplicada.

**Independent Test**: Preparar reserva/orden según reglas aprobadas, contrastar una
confirmación de pago válida y otras inválidas, duplicadas y fuera de orden, y consultar
el resultado persistido del titular. La prueba del proveedor va separada del ensayo
con pagos simulados; al límite/tardío se aplica RA-03/04 antes de aceptar ese caso.

**Acceptance Scenarios**:

1. **Given** una reserva y pago que cumplen las reglas aprobadas, **When** el servidor
   verifica autenticidad, vínculo, importe y moneda, **Then** confirma la matrícula
   según la identidad aprobada y conserva su relación con reserva, orden y pago.
2. **Given** una redirección o mensaje de éxito sin pago verificado, **When** vuelve
   el alumno, **Then** ve pago pendiente o estado comprobable, sin matrícula confirmada.
3. **Given** confirmación alterada, de otra orden, importe o moneda incorrectos,
   **When** se recibe, **Then** no confirma matrícula ni consume otra plaza y deja
   un resultado investigable sin exponer secretos.
4. **Given** el mismo pago ya procesado, **When** se repite o llega simultáneamente,
   **Then** no duplica matrícula, cobro solicitado ni consumo de inventario.
5. **Given** pago y vencimiento compitiendo o notificación tardía, **When** se
   concilian, **Then** el estado final cumple RA-03/04 y nunca matricula sobre una
   plaza ya comprometida de manera incompatible ni promete un reembolso no aprobado.
6. **Given** pago/matrícula confirmados y un reinicio, **When** consulta de nuevo,
   **Then** conserva el resultado y las referencias, sin repetir efectos al reconstruir la vista.

### User Story 3 - Vencer y liberar sin perder consistencia (Priority: P1)

Como alumno, quiero conocer si mi reserva sigue vigente o venció y, como institución,
quiero liberar una reserva vencida sin pago conforme a la conciliación aprobada,
para no retener plazas indefinidamente ni perder pagos en curso.

**Why this priority**: Completa las 24 horas y evita sobreventa o bloqueo por fallos.

**Independent Test**: Preparar una reserva con vencimiento conocido y sin pago válido,
observar antes/al llegar/después del límite, repetir conciliación y reiniciar el
servicio; contrastar estado e inventario finales. Casos de pago compitiendo esperan RA-03/04.

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
   intentos, **Then** queda un resultado final único y trazable conforme a RA-03/04,
   sin exceder capacidad ni perder la identificación del pago recibido.

### User Story 4 - Consultar compromisos e investigar incidencias autorizadas (Priority: P2)

Como alumno, quiero consultar mis reservas, órdenes y matrículas con estados claros;
y como responsable con permiso que se apruebe en PD-03, quiero revisar incidencias y
cancelaciones, para actuar según las reglas sin alterar compromisos de otros usuarios.

**Why this priority**: Hace utilizable y trazable el recorrido cuando algo falla;
las garantías de acceso e integridad son obligatorias también en las historias P1.

**Independent Test**: Con compromisos en estados previstos y un grupo cancelado,
probar titular/ajeno y cada operación de la matriz aprobada; verificar conservación
de historial y efectos de cancelación únicamente después de resolver RA-05/PD-03.

**Acceptance Scenarios**:

1. **Given** un alumno con compromisos propios, **When** los consulta desde su inicio,
   **Then** distingue referencia, oferta vinculada, importe/moneda, plazo y estado;
   no ve compromisos ni datos personales o financieros de otro alumno.
2. **Given** actor sin sesión o sin permiso vigente, **When** pide leer o modificar
   un compromiso por su referencia, **Then** se deniega sin revelar datos privados ni ocupar/liberar cupos.
3. **Given** grupo cancelado en oferta, **When** se resuelven sus compromisos,
   **Then** conserva el carácter terminal y el historial y aplica RA-05; no se inventa
   devolución, traslado o cancelación financiera automáticos.
4. **Given** resultado incierto por pérdida de conexión, **When** vuelve el alumno,
   **Then** puede comprobar el estado y repetir la misma intención si procede;
   no ve éxito, fallo definitivo o nuevo vencimiento sin confirmación del servidor.
5. **Given** actividad masiva o reiterada, **When** excede la política RA-06 aprobada,
   **Then** se aplica solo esa política; una petición rechazada no bloquea plazas
   ni permite enumerar compromisos de otros titulares.

### Edge Cases

| ID de origen | Caso a verificar y resultado exigido o decisión bloqueante |
| --- | --- |
| RE-01 | Doble clic, timeout y duplicado simultáneo: un efecto de negocio, misma vigencia y sin duplicados según identidad RA-01/PD-02. |
| RE-02 | Último cupo con dos alumnos; una oferta cambia al confirmar: no sobreventa; prioridad RA-02 y condiciones PD-02. |
| RE-03 | Cierre/desconexión tras confirmar o pagar: recuperar resultado persistido sin reiniciar plazo ni repetir consumo. |
| RE-04 | Reinicio antes/después de confirmación, pago o vencimiento: reconstruir estado; nada depende de sesión o proceso abierto. |
| RE-05 | Instante anterior, exacto y posterior a 24 h; reloj del alumno alterado: vigencia no extendida; pago depende de autoridad RA-03. |
| RE-06 | Conciliación retrasada, repetida o simultánea y reasignación: una liberación y estado final consistente, sin plazo adicional. |
| RE-07 | Pago alterado, duplicado o fuera de orden: verificar origen/orden/importe/moneda y evitar doble matrícula/consumo. |
| RE-08 | Pago antes del límite notificado después, exactamente al límite o ya sin plaza: RA-03/04 antes de aprobar la resolución. |
| RE-09 | Grupo cancelado con reserva, orden, pago o matrícula; retiro/cambio docente/horario: RA-05/PD-02, sin borrar historial ni asumir efectos económicos. |
| RE-10 | Reservas masivas/reiteradas, referencia ajena, rol cambiado o sesión revocada: permisos actuales y RA-06, sin efectos de una petición denegada. |

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El alumno DEBE poder consultar oferta y solicitar reserva de la unidad
  que se apruebe en PD-02, con condiciones vigentes comprobadas por el servidor al
  confirmar. Una consulta anterior o datos del dispositivo no bastan para autorizarla.
- **FR-002**: Capacidad configurada, ocupación, reservas y disponibilidad DEBEN
  distinguirse; la capacidad configurada conserva el rango 1–50 de PA-04. Solo
  presentar disponibilidad cuando exista cálculo real según las
  reglas aprobadas; una cifra consultada no garantiza la reserva. Hasta implementar
  ese cálculo, conservar «Ocupación y disponibilidad no calculadas» de 002.
- **FR-003**: DEBE existir reserva confirmada por el servidor antes de permitir su
  pago. Confirmar identifica titular, oferta, inicio, vencimiento y compromiso de cupo.
  Varios cursos se reservan todos juntos o ninguno; composición de orden y unicidad
  comercial conservan los pendientes de RA-01/PD-02.
- **FR-004**: Una reserva confirmada DEBE durar exactamente 24 horas, 86 400 segundos
  desde su confirmación por el servidor. Inicio y vencimiento se conservan aun con
  desconexión, cierre, repetición o reinicio; no se reinicia ni amplía ese plazo.
- **FR-005**: El servidor DEBE obtener precios válidos según PD-01, calcular los
  conceptos/total y conservar importe y moneda utilizados para cobrar. El importe
  enviado por el alumno no es autoridad; no inferir precio cero desde oferta sin precio.
- **FR-006**: La orden DEBE vincular titular, detalle, importe/moneda y reservas
  pertinentes; el desglose y la composición de su pago se definen en RA-01 y la vigencia
  del precio en PD-01. No aprobar implícitamente un pago total o matrícula por curso.
- **FR-007**: DEBE verificarse el pago con el proveedor elegido, comprobando
  autenticidad, orden, identidad del pago, importe y moneda. Una pantalla de éxito
  no confirma pago ni matrícula. El instante de referencia es cuando el servidor
  termina de verificar el pago; RA-03/04 conservan el caso exacto y la resolución tardía.
- **FR-008**: Pago verificado válido según las reglas temporales y de conciliación
  aprobadas DEBE confirmar la matrícula de identidad PD-02 y vincularla con sus
  antecedentes. Un pago tardío o sin plaza se resuelve por RA-03/04; no se convierte
  automáticamente en matrícula ni en reembolso no aprobado.
- **FR-009**: Vencimiento sin pago válido DEBE liberar el cupo conforme a conciliación
  consistente. Un proceso retrasado no extiende la reserva; repeticiones no liberan
  dos veces. El tratamiento de pago concurrente o tardío depende de RA-03/04.
- **FR-010**: Confirmación de reserva, orden y efectos sobre inventario DEBEN
  conservarse o rechazarse sin cambios parciales: varios cursos se reservan todos
  juntos o ninguno. La composición de la orden/pago conserva su decisión pendiente;
  matrícula y liberación mantienen consistencia conforme a las reglas que se aprueben.
- **FR-011**: Misma intención repetida, simultánea o con respuesta perdida DEBE
  conservar un solo efecto, referencias y plazo; un contenido distinto no se acepta
  silenciosamente como la repetición anterior. La unicidad de negocio es la de PD-02.
- **FR-012**: Confirmaciones concurrentes DEBEN impedir comprometer más plazas que
  la capacidad aplicable; al convertir una reserva en matrícula no se consume otra
  plaza adicional. Prioridad y desempate siguen RA-02, sin FIFO implícito.
- **FR-013**: Pago, vencimiento, liberación y reasignación concurrentes DEBEN producir
  un resultado persistido conciliable, sin doble consumo, doble liberación ni matrícula
  incompatible con otro compromiso confirmado; precedencia y excepciones requieren RA-03/04.
- **FR-014**: Cancelaciones y cambios DEBEN seguir RA-05, conservar antecedentes y
  respetar cancelación terminal de grupos de 002. Efectos sobre reserva/orden/pago/
  matrícula y responsables de resolución quedan bloqueados hasta aprobar esa política.
- **FR-015**: El servidor DEBE comprobar cuenta, sesión, rol, permiso vigente y
  propiedad en cada operación según PD-03; denegar lo no concedido por defecto, sin
  cambios ni datos ajenos. No heredar permisos financieros desde los de gestión de oferta.
- **FR-016**: Cada actor DEBE recibir solo datos necesarios y autorizados. No exponer
  credenciales, secretos de verificación o datos sensibles del medio de pago en vistas,
  mensajes ni registros; causas privadas de identidad/oferta no se trasladan al alumno.
- **FR-017**: La interfaz DEBE distinguir carga, vacío, validación, confirmación,
  pago pendiente, matrícula confirmada, vencimiento, conflicto, acceso denegado y error
  recuperable; conservar entradas al fallar y permitir comprobar un resultado incierto.
  Mostrar plazo autoritativo sin depender del reloj del dispositivo; usable con teclado
  y móvil/escritorio, sin presentar selección como reserva o pago pendiente como matrícula.
- **FR-018**: Tras desconexión o reinicio DEBE recuperarse el estado confirmado por
  referencia y titular autorizado, sin exigir mantener una sesión abierta durante
  las 24 horas ni volver a ejecutar efectos para mostrar el resultado.
- **FR-019**: Cambios y conciliaciones DEBEN ser atribuibles a actor/origen, compromiso,
  momento y resultado, conservando el vínculo entre reserva, orden, pago y matrícula
  sin secretos. La retención/custodia sigue pendiente de D13, sin plazos inventados.
- **FR-020**: Prevención del bloqueo abusivo DEBE seguir RA-06 explícita; sus
  rechazos no retienen plazas ni filtran datos. Las cuotas de acceso existentes no
  sustituyen una política de reservas ni aprueban límites nuevos.
- **FR-021**: DEBEN conservarse identidad y reglas PA-01–PA-05/E1 de oferta. Los
  efectos sobre compromisos existentes cuando se retira/cancela/cambia oferta o pierde
  habilitación el docente requieren RA-05/PD-02. Horarios America/Lima no resuelven
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

### Key Entities *(include if feature involves data)*

- **Oferta reservable**: referencia al curso/grupo existente y condiciones vigentes
  de PD-02; capacidad configurada no equivale a plazas garantizadas.
- **Reserva**: compromiso confirmado de titular y oferta, referencia estable, inicio,
  vencimiento exacto y resultado. Identidad, duplicados y relación múltiple según RA-01/PD-02.
- **Orden y detalle**: conceptos/importe/moneda confiables y vínculos de reserva;
  composición de orden/pago y vigencia de precio pendientes RA-01/PD-01.
- **Pago verificado**: referencia del proveedor, vínculo a orden, importe/moneda,
  evidencia de autenticidad, resultado e instante en que el servidor termina de
  verificarlo; comparación exacta y resolución tardía pendientes RA-03/04.
- **Matrícula**: resultado confirmado tras pago válido; vínculo de titular/oferta y
  antecedentes; identidad/unicidad pendientes PD-02, sin presumir una por curso/grupo.
- **Resultado de conciliación**: relación de hechos de reserva/pago/vencimiento/
  reasignación y resolución conforme a RA-03/04/05, preservando antecedentes.

Los nombres anteriores describen conceptos del negocio; no aprueban un catálogo
cerrado de estados, estructura de almacenamiento ni operaciones técnicas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

Criterios para verificar después de resolver decisiones e implementar. Ninguno
está demostrado en RP002; un criterio condicionado no se da por aprobado.

- **SC-001**: En cada reserva confirmada de los escenarios aprobados, el alumno
  identifica referencia, oferta e inicio/vencimiento; su diferencia es exactamente
  86 400 segundos. Desconexión/reinicio/repetición no cambian ese valor (US1/US3).
- **SC-002**: En el 100 % de casos de importe manipulado y composición de orden
  definidos tras RA-01/PD-01, el importe/moneda cobrables y detalle corresponden a
  la fuente autorizada; cero órdenes aceptadas con total aportado por el alumno como autoridad.
- **SC-003**: Pago válido confirma exactamente las matrículas que correspondan a la
  identidad aprobada; duplicados, confirmaciones inválidas y respuestas de éxito sin
  verificación producen cero matrículas o consumos adicionales (US2; RA-03/04/PD-02).
- **SC-004**: En los casos antes/al llegar/después del vencimiento, con retraso,
  repetición y reinicio, hay cero extensiones de plazo y cero dobles liberaciones;
  el inventario final coincide con los compromisos válidos según RA-03/04 (US3).
- **SC-005**: Dos alumnos por un último cupo obtienen como máximo una reserva
  confirmada para esa plaza; en todos los órdenes de carrera aprobados de pago/
  vencimiento/reasignación/cancelación hay cero sobreventas y cero pérdida de trazabilidad.
  Un conjunto de cursos que no puede reservarse completo deja cero reservas parciales.
- **SC-006**: El 100 % de combinaciones de la matriz PD-03 aprobada y de los casos
  RA-06 definidos responde conforme a permiso/propiedad vigentes, con cero datos
  privados o cambios entregados en solicitudes denegadas (US1–US4).
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
  de intención permite repetir, pero la unicidad comercial se resuelve en PD-02.
- La reserva dura 24 horas aunque cierre la sesión; no se interpreta el tiempo de
  sesión, vigencia del horario o espera de admisión como plazo de reserva.
- Izipay es el proveedor elegido en la constitución; acceso al entorno de pruebas,
  modalidad/Yape, tarifas y límites siguen pendientes. No hay integración acreditada.
- No se presupone atención manual, aprobación de descuentos, cuotas, tolerancias,
  reembolsos o traslados. Si alguna regla hace falta, se aclara; no se inventa por defecto.

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
  vencimiento y conciliación aprobados. Quedan fuera materiales, clases, video/chat,
  sustitución de identidad/oferta, infraestructura AWS y paneles no necesarios al recorrido.
- No desplegar, contratar, cargar servicios, crear cuentas o cambiar datos en RP002.
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

RE-01–RE-10 están desglosados en Edge Cases. RA-01 y RA-03 conservan únicamente las
dos respuestas parciales de la sesión; sus demás cuestiones, RA-02/04/05/06 y
PD-01–PD-03 siguen abiertas. No se atribuye aprobación a alternativas no respondidas.
