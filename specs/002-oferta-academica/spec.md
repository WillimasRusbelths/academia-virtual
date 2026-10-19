# Especificación: oferta académica — cursos, grupos, horarios y cupos

**Feature Branch**: `feat/002-oferta-academica`

**Created**: 2026-10-18

**Status**: Especificación y aclaraciones completadas; funcionalidad sin implementar.
La planificación queda fuera de esta etapa por instrucción del responsable.

**Input**: El administrador organiza cursos y grupos y el alumno consulta la oferta publicada para elegirlos. Incluye horarios, capacidad, publicación, asignación docente, autorización y recorridos completos de interfaz. Excluye órdenes, pagos, reservas, matrículas, materiales, video y chat.

## Contexto y alcance

Refina **HU08, HU09 y RF10**, con RF08 y el principio II de la
[constitución](../../.specify/memory/constitution.md) como protección transversal.
Los identificadores US/FR/SC son locales a `002`; no sustituyen los de
[identidad](../001-identidad-acceso-roles/spec.md).

Las reglas confirmadas por la solicitud se completan con **PA-01–PA-05**, resueltas
mediante cinco respuestas del responsable. Las decisiones de otros dominios y los
pendientes heredados permanecen explícitamente fuera de este cierre documental.

Curso describe qué se enseña; grupo describe una oferta concreta del curso: cuándo,
quién está asignado y capacidad máxima. Elegir significa comparar información; no crea
una selección persistida, inscripción, reserva ni derecho de acceso a clases.

### Decisiones de negocio y estado

| ID | Materia y fuente | Estado del borrador |
| --- | --- | --- |
| PA-01 | Permisos académicos; A01–A04, HU09, RF08/RF10 | Resuelta: administrador gestor; alumno consulta oferta publicada; docente consulta solo sus grupos asignados en cualquier estado; visitante sin acceso. Solo administración modifica oferta. No se entregan incidencias privadas de cuenta a docentes/alumnos. |
| PA-02 | Publicación, edición, retiro y cancelación; RF10/D06 | Resuelta, opción A: borrador → publicación → retiro → corrección → republicación explícita. Grupos cancelables de forma terminal conservando datos. Retirar curso oculta grupos; republicarlo revalida los publicados. No editar oferta publicada directamente. Condición docente definida en PA-03. |
| PA-03 | Asignación docente; A03/A04 | Resuelta, opción A: exactamente un docente activo, verificado y de rol Docente para publicar. Si pierde habilitación, ocultar grupo al alumno, conservar referencia administrativa y exigir revisión y republicación; reactivar la cuenta no recupera la visibilidad automáticamente. |
| PA-04 | Capacidad; alcance y D04 | Resuelta, opción A: entero de 1 a 50 alumnos por grupo, ambos extremos incluidos. No exigir un mínimo de 40. Cambiar capacidad publicada exige retirar y republicar según PA-02; no calcula ocupación/disponibilidad ni acredita concurrencia. |
| PA-05 | Horarios, zona y solapamientos; D06 | Resuelta, opción A: recurrencia semanal en America/Lima, fechas extremas incluidas y franjas sin cruce de medianoche; rechazar solapamientos internos y publicación con conflicto efectivo del mismo docente en otro grupo publicado. Franjas contiguas y grupos de distintos docentes pueden coincidir según las reglas detalladas. Sin feriados ni excepciones por fecha; no decide conflictos de matrícula. |

## Clarifications

### Session 2026-10-18

- Q: ¿Qué acceso de consulta tendrán docentes y visitantes a la oferta académica? → A: Opción A: docente solo consulta sus grupos asignados, en cualquier estado; visitante sin acceso. Solo el administrador modifica oferta y el alumno consulta únicamente oferta publicada.
- Q: ¿Qué ciclo de publicación y edición debe seguir la oferta académica? → A: Opción A: retirar antes de editar y republicar explícitamente tras validar. Cursos y grupos comienzan en borrador y pueden publicarse y retirarse; los grupos pueden cancelarse definitivamente conservando datos. Retirar un curso oculta sus grupos; republicarlo revalida los publicados. Publicar exige información completa; la condición docente queda pendiente de PA-03.
- Q: ¿Qué asignación docente debe exigirse para publicar un grupo y qué ocurrirá si ese docente pierde su habilitación? → A: Opción A: exactamente un docente activo, verificado y de rol Docente para publicar. Si pierde habilitación, ocultar el grupo al alumno y exigir revisión y republicación aunque se reactive la cuenta. Conservar referencia anterior para administración; asignar no cambia roles ni crea cuentas.
- Q: ¿Qué rango de capacidad máxima podrá configurar el administrador para cada grupo? → A: Opción A: de 1 a 50 alumnos por grupo, ambos extremos incluidos y solo enteros. Modificar capacidad publicada exige retirar y republicar. No reserva plazas ni calcula disponibilidad, y no acredita capacidad técnica o concurrencia.
- Q: ¿Qué reglas de horarios y solapamientos deben aplicarse a los grupos? → A: Opción A: horarios semanales en America/Lima con fechas de inicio/fin incluidas, franjas dentro del mismo día y al menos una ocurrencia en el periodo. Rechazar solapamientos internos y publicación si coincide con otro grupo publicado del mismo docente en una fecha y horario efectivos; admitir franjas contiguas y coincidencias entre docentes distintos. Sin feriados ni excepciones por fecha. D06 sigue pendiente para conflictos de matrícula.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preparar cursos y grupos (Priority: P1)

Como administrador quiero crear y revisar cursos y grupos antes de ofrecerlos al alumno.
Trazabilidad: HU09/RF10.

**Why this priority**: Permite organizar la oferta sin depender de compras.

**Independent Test**: Con una cuenta administrativa existente y catálogo vacío, crear un
curso y dos grupos de horarios y capacidad distintos y comprobarlos después de recargar.

**Acceptance Scenarios**:

1. **Given** administración sin cursos, **When** abre gestión de oferta, **Then** ve un
   estado vacío y una acción para crear curso, distinguibles de un fallo de carga.
2. **Given** datos válidos, **When** crea curso y grupos y vuelve a sus detalles,
   **Then** conserva los datos y la pertenencia; modificar un grupo no cambia el otro.
3. **Given** datos incompletos o inválidos, **When** guarda, **Then** recibe errores
   asociados a campos, conserva sus entradas y no guarda parcialmente.
4. **Given** un formulario sin confirmar, **When** cancela, **Then** regresa al listado
   sin crear ni modificar información.
5. **Given** un grupo en preparación, **When** configura capacidad 1 o 50, **Then**
   se acepta y conserva ese valor; capacidad vacía, 0, negativa, fraccionaria o 51 se
   rechaza con «La capacidad debe ser un número entero entre 1 y 50», sin cambios parciales.
6. **Given** un periodo inclusivo y franjas semanales, **When** guarda horarios,
   **Then** conserva días, horas y America/Lima; rechaza periodos invertidos, horas
   iguales/invertidas, cruces de medianoche, duplicados y franjas sin ocurrencias con
   errores por campo. Franjas contiguas del mismo grupo se admiten.

### User Story 2 - Publicar y comparar oferta (Priority: P1)

Como administrador quiero publicar información completa y como alumno quiero comparar
cursos y grupos para saber qué y cuándo podría estudiar. Trazabilidad: HU08/HU09/RF10.

**Why this priority**: Entrega el resultado principal del incremento.

**Independent Test**: Con cursos/grupos de prueba preparados en distintos estados,
publicar uno y recorrer listado y detalle como alumno, sin órdenes ni matrícula.

**Acceptance Scenarios**:

1. **Given** datos incompletos, **When** intenta publicar, **Then** se enumeran los datos
   faltantes y no cambia la publicación (PA-02/PA-03).
2. **Given** oferta apta y publicación confirmada, **When** el alumno entra desde su
   inicio a oferta, **Then** abre el curso y compara sus grupos visibles (PA-01/PA-02).
3. **Given** grupo visible, **When** consulta su detalle, **Then** ve curso, grupo, días,
   horas, inicio/fin de vigencia, zona horaria, capacidad máxima y nombre del docente
   habilitado asignado; no datos privados de la cuenta.
4. **Given** capacidad 45 sin matrícula, **When** consulta el grupo, **Then** ve
   «Capacidad máxima: 45 alumnos» y «Ocupación y disponibilidad no calculadas»; no
   «45 cupos disponibles», «0 inscritos», «agotado» ni acciones para reservar.
5. **Given** ninguna oferta visible, **When** abre catálogo, **Then** ve «No hay oferta
   publicada»; si falla la conexión ve un error con opción de reintentar.
6. **Given** un enlace a oferta retirada, **When** vuelve a consultar, **Then** ve
   «Oferta no disponible» sin recibir información interna. No se garantiza retirar
   información que ya había visto antes del cambio.

### User Story 3 - Mantener, retirar o cancelar oferta (Priority: P2)

Como administrador quiero corregir y retirar oferta para no mantener información engañosa.
Trazabilidad: HU09/RF10; parte de D06.

**Why this priority**: Permite operar el catálogo después de la publicación inicial.

**Independent Test**: Con oferta publicada preparada, recorrer cambios, retiro,
cancelación y consultas directas de alumno y administrador.

**Acceptance Scenarios**:

1. **Given** oferta publicada, **When** cambia datos de curso, horario, periodo, zona,
   docente o capacidad sin retirarla, **Then** se rechaza el cambio y se conserva la
   versión publicada; debe retirar el curso o grupo afectado antes de editarlo.
2. **Given** retiro permitido y confirmado, **When** termina, **Then** deja de ofrecerse
   al alumno y conserva los datos administrativos (PA-02).
3. **Given** cancelación permitida y confirmada, **When** termina, **Then** conserva
   identificación e historial; no implica reembolsos ni cambios de matrícula (PA-02).
4. **Given** dos administradores con la misma versión abierta, **When** uno guarda y el
   otro envía cambios obsoletos, **Then** el segundo recibe un conflicto sin sobrescribir;
   puede recargar y revisar antes de reenviar.
5. **Given** un curso retirado con grupos publicados, **When** un alumno consulta,
   **Then** no recibe el curso ni sus grupos; administración conserva datos y estados.
   Al republicar el curso se revalidan los grupos publicados antes de mostrarlos.
6. **Given** un grupo retirado y corregido, **When** el administrador guarda sin
   republicarlo, **Then** sigue oculto al alumno; solo vuelve a mostrarse tras publicación
   explícita válida y con el curso publicado.
7. **Given** un grupo cancelado, **When** se intenta editarlo o republicarlo, **Then**
   se rechaza y se conservan datos e historial; administración puede consultarlo.
8. **Given** un grupo publicado de un docente los lunes de 18:00 a 19:00,
   **When** se intenta publicar otro del mismo docente los lunes de 18:30 a 19:30
   con al menos un lunes efectivo común, **Then** se rechaza indicando conflicto
   docente sin publicar parcialmente. Otro que empiece a las 19:00 se admite si
   satisface las demás validaciones.
9. **Given** franjas de horas iguales, **When** no existe fecha efectiva común o los
   docentes son distintos, **Then** no se rechaza por conflicto docente; esto no
   concede matrícula ni determina compatibilidad de horarios de un alumno.
10. **Given** dos publicaciones simultáneas que compiten por el mismo docente y
    franja efectiva, **When** se procesan, **Then** como máximo una tiene éxito y la
    otra recibe conflicto; se conserva un estado final sin doble programación.

### User Story 4 - Asignar docentes y respetar permisos (Priority: P2)

Como administrador quiero asignar docentes habilitados y detectar asignaciones inválidas;
como usuario quiero que cada operación respete mis permisos vigentes.
Trazabilidad: HU09/RF10, A03, RF08 y constitución II.

**Why this priority**: Evita atribuciones inválidas y acceso indebido por conocer un enlace.

**Independent Test**: Usar administrador, alumno, docente asignado, docente ajeno y
visitante; contrastar acceso directo e interfaz y cambiar rol/estado del docente asignado.

**Acceptance Scenarios**:

1. **Given** cuentas de distintos roles/estados, **When** selecciona docente, **Then**
   solo son elegibles cuentas activas, verificadas y de rol Docente (PA-03).
2. **Given** docente asignado, **When** pierde rol o se desactiva, **Then** administración
   identifica la asignación inválida y el grupo queda oculto al alumno en nuevas consultas;
   conserva la referencia administrativa y exige revisión y republicación sin alterar
   las reglas de identidad.
3. **Given** un docente con grupos asignados en distintos estados, **When** abre
   «Mis grupos» y sus detalles, **Then** consulta los datos académicos de todos ellos
   y el contexto del curso, sin grupos ajenos ni incidencias privadas de cuenta.
   Los accesos directos a grupos no asignados y cualquier modificación se rechazan.
4. **Given** sesión vencida/revocada o rol cambiado con formulario abierto, **When**
   guarda, **Then** se rechaza sin efectos, se comunica la pérdida de acceso y no se
   reenvía automáticamente al iniciar sesión otra vez.
5. **Given** un visitante, **When** intenta listar oferta o abrir directamente un curso
   o grupo, **Then** se exige iniciar sesión y no se entregan datos de oferta.
6. **Given** un alumno, **When** intenta consultar oferta no publicada o modificarla,
   **Then** no recibe información interna y la operación no produce cambios.
7. **Given** un grupo sin docente, con docente no habilitado o con más de uno,
   **When** se intenta publicar, **Then** se rechaza sin cambiar datos ni estado;
   el borrador o grupo retirado admite cero o un docente durante preparación.
8. **Given** grupo oculto por pérdida de habilitación docente, **When** la cuenta
   recupera rol/estado válido, **Then** no vuelve a mostrarse al alumno automáticamente.
   Administración retira el grupo si todavía figura publicado, confirma o sustituye
   la asignación y lo publica explícitamente tras revalidar; no se rehabilitan cancelados.

### Edge Cases

- Curso inexistente, grupo de otro curso e identificador manipulado: no eludir permisos
  ni trasladar grupos implícitamente.
- Reintentos de la misma alta y edición concurrente: no duplicar una creación confirmada
  ni sobrescribir cambios ajenos; distinguir recursos por su referencia estable, no
  por igualdad de nombres.
- Capacidad vacía, cero, negativa, fraccionaria o mayor de 50: rechazo; 1 y 50 se
  admiten. No convertir capacidad en disponibilidad ni exigir un mínimo de 40.
- Periodo invertido, fecha inválida, franja sin ocurrencias durante el periodo, horas
  iguales/invertidas, duplicados y cruce de medianoche: rechazo sin cambios parciales.
- Franjas contiguas, fechas disjuntas, días distintos y último día incluido del periodo:
  probar fronteras de solapamiento de PA-05.
- Publicación simultánea con desactivación/cambio de rol docente: no presentar habilitación
  a partir de una comprobación obsoleta; resultado según PA-03.
- Retirar curso con varios grupos, publicar bajo curso retirado o reactivar docente:
  aplicar PA-02/PA-03 sin exposición accidental.
- Respuesta perdida al guardar: no afirmar éxito ni vaciar el formulario; permitir
  comprobar el estado existente antes de repetir, sin duplicar entidades.
- Cambio de publicación o permisos con detalle abierto: reevaluar en la siguiente
  consulta; no se introduce actualización en tiempo real.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El administrador DEBE listar, crear, consultar y editar cursos y grupos;
  conservar resultados después de recargar y aplicar PA-02 a acciones de ciclo de vida.
- **FR-002**: Curso DEBE separar identidad, nombre y descripción de periodo,
  horarios, capacidad y docente de cada grupo. Cada grupo pertenece a un curso; cambiar
  uno no cambia otros. Cada curso/grupo tiene referencia estable para distinguirlo;
  no trasladar un grupo a otro curso por edición.
- **FR-003**: Cada grupo DEBE describir días semanales, horas inicial/final, fechas
  inicial/final y zona horaria explícita. Mostrar zona junto al horario sin inferirla
  silenciosamente del navegador. Usar recurrencia semanal en America/Lima con extremos
  de fechas incluidos, franjas dentro del mismo día y al menos una ocurrencia de cada
  franja en el periodo; rechazar otras zonas y cruces de medianoche (PA-05).
- **FR-004**: Validar coherencia de fechas, horas y ocurrencias y aplicar la política
  aprobada de PA-05: rechazar duplicados y solapamientos internos al guardar; impedir
  publicación de grupos con conflicto efectivo del mismo docente, también al republicar
  un grupo o curso y ante publicaciones concurrentes. Franjas contiguas son válidas.
  No decidir incompatibilidades de matrícula del alumno (D06).
- **FR-005**: Configurar capacidad máxima por grupo, diferenciada de ocupación
  (matrículas que consumen plaza) y disponibilidad (plazas libres según reglas futuras).
  Solo admitir enteros de 1 a 50, ambos extremos incluidos (PA-04); validar en backend
  y explicar el rango en el formulario. Cambiar capacidad publicada exige retirar y
  republicar (PA-02); valores inválidos no alteran datos existentes.
- **FR-006**: Sin matrícula, información y presentación DEBEN indicar ocupación y
  disponibilidad no calculadas; no sustituirlas por cero o capacidad. Crear, consultar
  y publicar no consumen ni reservan plazas (D04).
- **FR-007**: Publicar DEBE exigir validación completa en backend y confirmación explícita
  según PA-02 y exactamente un docente activo, verificado y de rol Docente según PA-03.
  Publicar un grupo requiere curso publicado y no ocurre automáticamente al publicar
  el curso. Un rechazo identifica causas y conserva estado y datos anteriores.
- **FR-008**: Edición, retiro, cancelación y nueva publicación DEBEN seguir PA-02:
  retirar antes de editar datos publicados y republicar explícitamente tras validar.
  Retirar un curso oculta sus grupos sin cambiar sus estados; republicarlo revalida
  los publicados. La cancelación de grupo es terminal y conserva datos; no hay borrado
  físico ni efectos sobre matrículas, pagos o clases.
- **FR-009**: El alumno DEBE acceder desde su inicio al listado de cursos visibles,
  descripción y comparación de grupos con datos de US2, según PA-01/PA-02. No exigir
  matrícula para consultar. El docente DEBE acceder desde su inicio a «Mis grupos» y
  consultar solo sus grupos asignados en cualquier estado y el contexto de su curso,
  sin exponer otros grupos. El visitante no tiene acceso a la oferta.
- **FR-010**: Backend DEBE comprobar sesión, rol y habilitación vigentes en cada
  operación; para lectura docente DEBE comprobar la asignación actual por recurso.
  Solo el administrador modifica oferta; alumno y docente tienen únicamente la lectura
  de PA-01 y el visitante ninguna. El docente no obtiene acceso a grupos ajenos por
  pertenecer al mismo curso.
  Denegar por defecto operaciones no concedidas, incluso consultas y escrituras directas.
- **FR-011**: Entregar solo datos académicos autorizados; no correo, credenciales,
  tokens ni estados privados de cuenta docente. La selección administrativa utiliza
  solo información necesaria para distinguir docentes.
- **FR-012**: Asignación, sustitución, desasignación y pérdida de habilitación DEBEN
  seguir PA-03: cero o un docente en preparación y exactamente uno habilitado para
  publicar. Perder rol o desactivarse oculta el grupo al alumno y deja revisión
  administrativa requerida, conservando la referencia. Reactivar la cuenta no elimina
  esa revisión: exigir republicación explícita válida. Asignar no crea cuenta ni cambia
  su rol; sustituir/desasignar respeta retiro previo y cancelación terminal de PA-02.
- **FR-013**: Interfaz DEBE ofrecer listado, detalle, formularios y acciones autorizadas,
  con carga, vacío, validación, éxito confirmado, conflicto, acceso denegado, sesión
  vencida y error recuperable diferenciados. Conservar entradas ante errores y permitir
  cancelar sin guardar.
- **FR-014**: Recorridos DEBEN funcionar con teclado y en móvil/escritorio, con etiquetas,
  foco visible y errores asociados; ninguna acción dependerá solo del color. Reutilizar
  la navegación de acceso/perfil existente.
- **FR-015**: Evitar estados parciales, sobrescritura silenciosa concurrente y duplicados
  tras reintentos; registrar actor, recurso, acción, momento y resultado sin secretos
  para investigar incidencias.
- **FR-016**: Conservar identidad, datos y evidencias; verificar accesos permitidos y
  denegados y regresiones afectadas sin declarar resueltos pendientes heredados ni
  acreditar 1000 concurrentes.

### Matriz de permisos — PA-01 aprobada

PA-01 confirmada mediante opción A. Accesos autenticados requieren cuenta activa,
verificada y sesión válida. Datos académicos de curso se consultan como contexto de los
grupos autorizados; no conceden acceso a los demás grupos ni a motivos administrativos
de cancelación o incidencias privadas de cuenta. El ciclo editorial está aprobado en PA-02.

| Operación | Administrador | Alumno | Docente | Visitante |
| --- | --- | --- | --- | --- |
| Listar/ver oferta publicada | Sí | Sí | Solo grupos asignados | No |
| Ver borradores/retirados/cancelados | Sí | No | Solo grupos asignados, sin incidencias privadas de cuenta | No |
| Crear/editar cursos y grupos, horarios/capacidad | Sí | No | No | No |
| Publicar/retirar/cancelar/republicar cuando proceda | Sí | No | No | No |
| Seleccionar/asignar/sustituir docentes | Sí | No | No | No |

### Ciclo de vida — PA-02 aprobada

| Entidad | Transiciones permitidas | Consulta |
| --- | --- | --- |
| Curso | Borrador → Publicado; Publicado → Retirado; Retirado → Publicado | Alumno solo ve publicados con al menos un grupo visible; administración conserva todos. |
| Grupo | Borrador → Publicado; Publicado → Retirado; Retirado → Publicado; Borrador/Publicado/Retirado → Cancelado | Cancelado terminal; retirado admite corrección y nueva publicación. |

Crear con nombre y referencia estable; publicar exige descripción de curso y grupo
completo: nombre, periodo, franjas, zona, capacidad válida y exactamente un docente
habilitado conforme a PA-03. Publicar grupo requiere curso publicado;
publicar curso no publica sus grupos. Retirar curso oculta grupos sin cambiar sus estados;
republicarlo revalida los grupos publicados antes de mostrarlos.

Editar solo en borrador/retirado; retirar primero para modificar datos publicados.
Datos de curso requieren retirar curso; datos de grupo, retirar ese grupo. Cancelación
requiere confirmación y motivo visible solo a administración; no borrar ni reactivar
cancelados. No hay publicación programada, notificaciones externas ni finalización
automática: fechas del grupo no constituyen un periodo de inscripción.

### Asignación — PA-03 aprobada

Cero o un docente durante preparación y exactamente uno activo, verificado
y con rol Docente para publicar. Puede tener varios grupos sujeto a PA-05.

Si pierde rol o se desactiva, conservar referencia y mostrar a administración «Docente
no habilitado»; el grupo deja de ser visible aunque su estado siga publicado.
Reevaluar habilitación actual al consultar y publicar. Reactivar la cuenta no recupera
visibilidad automáticamente: conservar la revisión académica requerida hasta que
administración retire el grupo si todavía figura publicado, confirme o sustituya el
docente y republique tras validar. No afecta el carácter terminal de una cancelación.
Esta revisión requerida no es un estado de identidad ni concede permisos nuevos.

### Horarios y capacidad — PA-04/PA-05 aprobadas

PA-04 fija capacidad máxima configurable como entero de 1 a 50 por grupo, con extremos
incluidos. La referencia de grupos previstos de 40–50 no impone un mínimo de 40.
Rechazar valores vacíos, no enteros o fuera del rango sin guardar parcialmente.
Este límite de negocio no acredita capacidad técnica ni concurrencia; ocupación y
disponibilidad siguen sin calcularse hasta el dominio de matrícula.

PA-05 establece periodo con extremos incluidos y una o varias franjas semanales en
America/Lima. Cada franja tiene día y horas dentro del mismo día y al menos una ocurrencia
en el periodo. Rechazar duplicados y solapamientos internos; admitir franjas contiguas.
Rechazar publicación si coincide con otro grupo publicado del mismo docente en fechas
efectivas, día y horas; comprobar también publicaciones simultáneas y republicaciones
de grupo/curso. Sustituir docente exige retirar primero; antes de republicar se valida
su programación. No comparar un grupo consigo mismo. Un grupo en estado Publicado
cuenta para el conflicto aunque su curso esté retirado; los grupos Retirados/Cancelados
no bloquean la publicación. Grupos con docentes distintos pueden solaparse.

El solapamiento requiere una fecha de ocurrencia común de ambas franjas y horas que
se intersecten; intervalos con solo un extremo compartido no se solapan. Compartir
periodo de fechas no basta si no hay un día de ocurrencia común.

Alcance mínimo acordado: sin feriados, excepciones por fecha, recuperación de clases
ni conversión automática a otras zonas. No cierra conflictos de matrícula ni cambios
posteriores a una matrícula.

### Key Entities *(include if feature involves data)*

- **Curso**: identidad estable, nombre, descripción y estado editorial; reúne
  grupos, no representa matrícula.
- **Grupo**: identidad estable, curso, nombre, periodo, zona, capacidad máxima,
  franjas, asignación y estado; no equivale a una clase ni emisión.
- **Franja horaria**: día y horas aplicables durante el periodo; convenciones PA-05.
- **Asignación docente**: vínculo a cuenta existente con habilitación actual y revisión
  académica PA-03; no un nuevo rol.
- **Visibilidad**: resultado de permisos, estados y habilitación requerida; no es
  disponibilidad de plazas ni autorización de materiales o clases.

## Success Criteria *(mandatory)*

### Measurable Outcomes

Verificación futura, no resultados obtenidos. PA-01–PA-05 resueltas. La aceptación del
producto exige demostrar estos criterios después de implementar; no se deriva de
completar el checklist de calidad documental.

- **SC-001**: Un administrador completa crear → revisar → publicar → retirar → corregir
  → republicar con un curso y dos grupos; el 100 % de valores confirmados se conserva
  al recargar y cambiar un grupo no modifica el otro (US1/US3).
- **SC-002**: Un alumno llega desde inicio a oferta publicada e identifica sin ayuda
  durante el recorrido curso, grupo, días/horas, fechas, zona y capacidad en dos grupos;
  todas las vistas indican ocupación/disponibilidad no calculadas (US2). Registrar
  observación real o mantener pendiente, sin atribuirla al agente.
- **SC-003**: El 100 % de combinaciones actor/operación/estado de la matriz aprobada
  responde como corresponde, incluidos docentes propio/ajeno y sesiones revocadas;
  cero cambios o datos privados entregados en casos denegados (US4).
- **SC-004**: El 100 % de fronteras acordadas de horarios, capacidad, publicación y
  habilitación conserva datos válidos o rechaza sin cambios parciales; oferta no visible
  según PA-02/PA-03 no aparece en nuevas consultas del alumno (US2–US4).
- **SC-005**: US1–US4 se completan en móvil/escritorio y con teclado, con estados
  vacíos, errores, conflictos y éxitos definidos; cero operaciones requieren usar
  órdenes, pagos o matrícula (FR-013/014).
- **SC-006**: En dos ediciones concurrentes y reintentos de creación/publicación hay
  cero sobrescrituras silenciosas y entidades duplicadas; los resultados son atribuibles
  a su actor sin revelar secretos (FR-015).

## Assumptions

- La referencia estable distingue cursos y grupos sin introducir códigos manuales
  obligatorios ni una nueva regla de unicidad de nombres. El borrador inicial proponía
  esa regla como S1; se retira por no estar solicitada ni aprobada. La representación
  técnica de las referencias corresponde a planificación.
- Reutilizar cuentas, sesiones, verificación, revocación y arquitectura existentes;
  sin otro sistema de acceso, nuevas cuentas por asignación ni servicios externos.
- No incluye precios de venta ni reglas comerciales: RF11 decidirá fuente/vigencia;
  no inferir precio cero.
- Oferta local no autoriza despliegue, contratación ni capacidad de 1000 concurrentes.

### Dependencias, pendientes y límites

- **D04 abierta**: capacidad no reserva ni asigna plazas. Consumo/liberación, expiración,
  competencia por último cupo y disponibilidad real corresponden a órdenes/matrícula.
- **D06 delimitada, sin cierre integral**: periodo, zona, edición y programación docente
  corresponden a PA-02/PA-05. Impedir matrículas en cursos solapados, cambios posteriores
  a matrícula y excepciones continúan pendientes; describir horarios no los resuelve.
- D01–D03/D05 y RF11–RF18 conservan dependencias futuras de órdenes, pago verificado,
  vigencia, reembolsos, materiales, video, chat y paneles. No simular matrícula para
  aparentar disponibilidad. La navegación de este spec no constituye paneles completos.
- [Aceptación preliminar de identidad](../001-identidad-acceso-roles/evidence/acceptance.md):
  106/108 tareas; T104 (diez personas) y T108 (aceptación integral) pendientes. Bootstrap
  intermitente abierto puede afectar preparar entornos; no sortearlo con credenciales
  predeterminadas ni darlo por resuelto al especificar oferta.
- [Capacidad sin aprobar](../001-identidad-acceso-roles/evidence/load-resources.md),
  D10/rúbrica, D13/custodia y objetivos operativos, y SMTP real siguen pendientes.
  VPS y nuevas cargas completas aplazados hasta matrícula. D13 debe resolverse antes
  de demo persistente/publicación; no constituye una pantalla de este incremento.
- [Actores](../../docs/01-analisis-de-sistema/01-actores.md),
  [HU](../../docs/01-analisis-de-sistema/02-historias-del-usuario.md),
  [RF](../../docs/01-analisis-de-sistema/03-requisitos-funcionales.md) y
  [alcance](../../docs/alcance-mvp.md) contienen afirmaciones históricas de identidad
  no implementada; README vigente y evidencias posteriores describen el avance real.
  No reescribir ni archivar primer spec o evidencia al preparar este.
- [Decisiones](../../docs/decisiones-pendientes.md) y constitución rigen este trabajo.
  Investigación temprana de video/protección D07/D08 sigue independiente y pendiente,
  sin ampliar el incremento.

### Trazabilidad y cobertura de aceptación

| Origen | Historias locales | Requisitos locales | Criterios |
| --- | --- | --- | --- |
| HU09/RF10: gestión | US1, US3, US4 | FR-001–005, FR-007/008, FR-012–015 | SC-001, SC-004–006 |
| HU08/RF10: consulta | US2 | FR-002/003, FR-005/006, FR-009/011, FR-013/014 | SC-002, SC-004/005 |
| RF08/constitución II | US2, US4 | FR-009–012, FR-016 | SC-003/004 |
| D04/D06: sin matrícula | US1–US4 | FR-003–006, FR-008, FR-016 | SC-002/004 |
| Integridad y operación heredadas | US1, US3, US4 | FR-013–016 | SC-003, SC-005/006 |

Se completaron cinco aclaraciones y la revisión de requisitos, historias, permisos,
ciclo, entidades, casos límite y criterios de éxito. No quedan decisiones PA pendientes
ni marcadores de aclaración. La revisión documental del checklist pasa de 12/16 a 16/16;
sus notas conservan la evaluación inicial. No acredita implementación ni aceptación.

Los objetivos adicionales de rendimiento y dimensionamiento, sin umbrales aprobados
para oferta, se difieren a planificación y al proceso de D10; no se inventan garantías
de latencia, disponibilidad o concurrencia. La continuidad de identidad y recuperación
se rige por las dependencias existentes.

Esta etapa termina en especificación y aclaraciones. El siguiente comando del flujo
sería `$speckit-plan` cuando se solicite; no se crean plan, tareas, migraciones ni
implementación ahora.
