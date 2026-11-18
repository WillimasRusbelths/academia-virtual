# Especificación: clases en vivo y chat por grupo — 005

**Feature Branch**: `feat/005-clases-chat`, creada desde `origin/main` después del
merge del PR #5. La especificación inicial se redactó en
`feat/003-reservas-ordenes-matricula`; se conserva su evidencia histórica.

**Created**: 2026-11-17, America/Lima.

**Status**: Especificado y aclarado en tres decisiones de alcance; pendiente de
plan, tareas, implementación y verificación. Viabilidad del video protegido
D07/D08 pendiente; esta especificación no acredita reproducción o protección.

**Actualización de planificación — 2026-11-17**: [plan parcial](plan.md), modelo
y contratos de sesiones/chat redactados; todavía sin tareas o código. El flujo
plan completo sigue pendiente por [G-V005](video-gate.md), sin mecanismo de video
protegido demostrado. Se conserva el alcance funcional que sigue.

**Cierre de specify — 2026-11-17**: alcance documental de 005 terminado en esta
pasada: cuatro historias, 24 escenarios, 23 FR y ocho SC. Se conserva V01–V03 y
el alcance funcional ya acordado. La secuencia posterior queda en la
[hoja de ruta 005 → 006 → 007](../../docs/planificacion/hoja-ruta-005-007.md),
con [revisión de paneles por rol](../../docs/planificacion/revision-paneles-006.md).
No se crean ramas, planes, tareas o implementaciones de 006/007 en esta pasada.

**Input**: el responsable aceptó iniciar el siguiente spec de clases en vivo y
chat por grupo y confirmó V01–V03 en esta conversación.

Fuentes: [alcance MVP](../../docs/alcance-mvp.md), HU15/HU16 de
[historias](../../docs/01-analisis-de-sistema/02-historias-del-usuario.md), RF08/RF16/RF17/RF19 de
[requisitos](../../docs/01-analisis-de-sistema/03-requisitos-funcionales.md),
[constitución 1.2.1](../../.specify/memory/constitution.md),
[DEC01](../../docs/01-analisis-de-sistema/07-decisiones-arquitectonicas.md),
[D07–D10/D13](../../docs/decisiones-pendientes.md) y specs
[001](../001-identidad-acceso-roles/spec.md), [002](../002-oferta-academica/spec.md),
[003](../003-reservas-ordenes-matricula/spec.md) y [004](../004-materiales-estudio/spec.md).
Sus reglas y pendientes conservan su alcance; los IDs FR/SC de este documento son locales a 005.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preparar y conducir una clase del grupo (Priority: P1)

Como docente habilitado y actualmente asignado a un grupo, quiero preparar una
sesión, iniciarla y finalizarla manualmente, para organizar mi clase. El
administrador puede gestionar las sesiones de cualquier grupo permitido.

**Why this priority**: establece qué clase está abierta y quién es responsable,
sin depender de un horario automático ni de que el video esté disponible.

**Independent Test**: con grupos y responsables ficticios, preparar/iniciar/finalizar
sesiones y comprobar permisos, estados y competencia por iniciar dos clases del
mismo grupo. Entrega el control de sesiones aun con reproducción no habilitada.

**Acceptance Scenarios**:

1. **Given** docente habilitado asignado y grupo no cancelado, **When** prepara una
   sesión con título válido, **Then** queda preparada para ese único grupo, sin
   emisión ni chat abierto por el hecho de crearla.
2. **Given** sesión preparada y responsable con permiso actual, **When** confirma
   iniciar, **Then** queda en curso si no existe otra en curso en el mismo grupo;
   se distinguen estado de clase y disponibilidad real de la transmisión.
3. **Given** dos sesiones preparadas del mismo grupo, **When** se inician a la vez,
   **Then** solo una queda en curso y la otra informa un conflicto recuperable.
4. **Given** sesión en curso, **When** el responsable confirma finalizar, **Then**
   queda finalizada, deja de admitir mensajes y nuevas solicitudes de reproducción;
   no se puede reiniciar la misma sesión como una clase nueva.
5. **Given** docente ajeno, sin habilitación, anterior o visitante/alumno, **When**
   intenta preparar, modificar, iniciar, finalizar o cancelar, **Then** se deniega
   sin cambios ni exposición de información de gestión.
6. **Given** respuesta perdida o revisión anterior de una sesión, **When** se repite
   la misma acción o se intenta sobrescribir, **Then** se recupera el resultado único
   o se informa conflicto, sin duplicar sesiones ni revertir cambios posteriores.

---

### User Story 2 - Entrar y seguir una clase autorizada (Priority: P1)

Como alumno con matrícula vigente del grupo, quiero encontrar sus sesiones y
seguir la clase en curso, para recibir la explicación del docente sin acceder
a clases ajenas. Mi participación audiovisual no forma parte de este incremento.

**Why this priority**: entrega el contenido de la clase y mantiene el acceso
académico adquirido, también ante referencias compartidas o permisos vencidos.

**Independent Test**: con una sesión ficticia y una emisión autorizada de prueba,
probar un alumno vigente, uno de otro grupo, uno sin matrícula y uno al finalizar
su vigencia. La reproducción real y las solicitudes directas requieren la prueba
de viabilidad; una pantalla simulada no satisface esta historia completa.

**Acceptance Scenarios**:

1. **Given** alumno activo con matrícula vigente propia, **When** consulta su grupo,
   **Then** ve las sesiones preparadas, en curso y finalizadas autorizadas, con
   títulos/estados; las preparadas no reproducen y las finalizadas no ofrecen grabación.
2. **Given** clase en curso con emisión disponible y permiso actual, **When** el
   alumno inicia la reproducción, **Then** recibe video autorizado y distingue
   reproducción de espera por emisión, desconexión o indisponibilidad del servicio.
3. **Given** visitante, alumno sin matrícula o matriculado en otro grupo, **When**
   solicita la clase o directamente una referencia de video previamente obtenida,
   **Then** no recibe contenido ni datos privados de la clase.
4. **Given** matrícula que alcanza su fin original, **When** se solicita contenido
   nuevo en ese instante o después, **Then** se deniega aun con la página abierta;
   inmediatamente antes se permite si cumple las demás condiciones.
5. **Given** oferta retirada o cambio de docente, **When** el alumno conserva una
   matrícula vigente y la clase sigue en curso, **Then** esos cambios no revocan por
   sí mismos su derecho académico; los permisos de emisión del docente se revalidan.
6. **Given** cierre/revocación de sesión o deshabilitación de cuenta, **When** la
   conexión ya estaba abierta o llega una respuesta tardía, **Then** se dejan de
   entregar contenidos nuevos y la interfaz descarta datos de la sesión anterior.
7. **Given** finalización de clase, **When** se solicita más video mediante una
   referencia conocida, **Then** se deniega; no se promete borrar contenido ya recibido.

---

### User Story 3 - Preguntar y recuperar el chat de la clase (Priority: P1)

Como alumno autorizado, quiero enviar preguntas de texto y leer las respuestas
de mi clase; al reconectar quiero recuperar los mensajes confirmados. Docente
actual habilitado y administrador participan en la misma conversación.

**Why this priority**: permite participación del alumno sin cámara, micrófono ni
pantalla, con aislamiento entre clases y continuidad ante desconexiones.

**Independent Test**: abrir dos clases de grupos distintos con cuentas ficticias;
intercambiar mensajes, perder una confirmación, reconectar y finalizar una clase,
comprobando aislamiento, orden, resultado único e historial de solo lectura.

**Acceptance Scenarios**:

1. **Given** clase en curso y participantes autorizados, **When** uno envía texto
   válido, **Then** se confirma una sola vez y los demás autorizados de esa clase
   pueden leerlo con autor visible, rol y orden confirmado.
2. **Given** referencia de otra clase o matrícula vencida, **When** se intenta
   conectar, enviar, consultar historial o reconectar, **Then** se deniega sin
   mensajes ajenos; una conexión ya abierta no mantiene permisos caducados.
3. **Given** confirmación perdida, **When** se reenvía la misma intención de mensaje,
   **Then** se recupera el resultado sin duplicarlo; el mismo identificador con
   otro contenido se rechaza como conflicto.
4. **Given** desconexión entre mensajes, **When** se reconecta con permiso vigente,
   **Then** se recuperan confirmados en orden, sin omisiones silenciosas ni duplicados;
   no se reenvían automáticamente borradores o mensajes de una sesión anterior.
5. **Given** clase finalizada y matrícula todavía vigente, **When** el alumno abre
   su chat, **Then** lee historial confirmado y no puede enviar mensajes nuevos.
6. **Given** texto vacío, excesivo, solo espacios o exceso de frecuencia, **When**
   se intenta enviar, **Then** se rechaza con mensaje comprensible, sin confirmar
   ni distribuirlo y permitiendo corregir o esperar según corresponda.

---

### User Story 4 - Moderar sin perder la trazabilidad (Priority: P2)

Como docente actual habilitado o administrador, quiero ocultar mensajes y
silenciar a un alumno durante una clase para conducir la conversación.

**Why this priority**: limita interrupciones con acciones acotadas a la clase,
sin cambiar matrícula ni bloquear la cuenta globalmente.

**Independent Test**: ocultar un mensaje, silenciar y rehabilitar al alumno;
reconectar sus sesiones, finalizar y abrir otra clase, comprobando alcance,
historial visible, permisos y registro de las decisiones.

**Acceptance Scenarios**:

1. **Given** mensaje confirmado, **When** un responsable autorizado lo oculta,
   **Then** los participantes reciben un indicador de mensaje ocultado sin su texto;
   el cambio también se refleja en posteriores consultas y reconexiones.
2. **Given** alumno participante, **When** se lo silencia, **Then** se rechazan sus
   mensajes nuevos desde cualquiera de sus conexiones a esa clase, pero conserva
   lectura y video si sigue autorizado; se le explica el motivo funcional.
3. **Given** alumno silenciado, **When** el responsable revierte el silenciamiento,
   **Then** puede volver a enviar si la clase está en curso y su permiso sigue vigente.
4. **Given** silenciamiento en una clase, **When** el alumno entra en otra clase
   autorizada, **Then** no se hereda la restricción ni se altera su matrícula.
5. **Given** alumno, docente ajeno o responsable anterior, **When** intenta moderar,
   **Then** se deniega; las acciones válidas conservan actor, fecha y resultado único.

### Edge Cases

- Preparar varias sesiones no inicia ninguna; dos grupos pueden tener clases en
  curso simultáneamente, sin que esto demuestre capacidad de video o chat.
- Cancelar una preparada la deja terminal y fuera del listado del alumno; una clase
  en curso se finaliza. Una clase finalizada/cancelada no se reabre ni cambia de grupo.
- Iniciar no garantiza señal de video. Una interrupción o reinicio no finaliza,
  reinicia ni publica clases automáticamente; la UI muestra indisponibilidad real.
- Permiso de docente revocado durante emisión o moderación: nuevas acciones y
  nuevas entregas de su emisión deben quedar denegadas; conservar atribución original
  y permitir que el responsable actual recupere el control sin heredar secretos.
- Grupo retirado de oferta conserva acceso de alumnos con matrícula vigente;
  grupo cancelado no permite iniciar sesiones ni entregar contenido nuevo.
- Vencimiento, revocación, finalización, ocultación o silenciamiento que compiten
  con un envío se resuelven con un orden autoritativo y sin contenido nuevo indebido.
- Ocultar no permite recuperar texto original por una respuesta tardía, búsqueda
  o reconexión. No se puede borrar lo que un destinatario ya leyó o guardó.
- Reintentar un mensaje confirmado antes de silenciar/finalizar no vuelve a emitirlo
  como nuevo; consultar el resultado exige permiso vigente y respeta ocultaciones.
- No se distingue públicamente referencia ajena de inexistente cuando revelaría
  información privada; listas vacías autorizadas se distinguen de fallos temporales.
- Texto con etiquetas o enlaces se representa como texto inerte; no hay adjuntos,
  contenido ejecutable, mensajes privados o envío al chat de un proveedor externo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Cada sesión DEBE pertenecer a un único grupo existente e inmutable,
  tener título obligatorio de 1–160 caracteres y descripción opcional de hasta
  2000; los textos son inertes. No se comparten sesiones entre grupos.
- **FR-002**: Docente actualmente habilitado y asignado al grupo no cancelado, o
  administrador activo, DEBE poder preparar, corregir textos, iniciar/finalizar y
  cancelar conforme al estado. No basta ser el creador original.
- **FR-003**: Las sesiones DEBEN crearse y cambiar de estado manualmente: preparada
  → en curso → finalizada, o preparada → cancelada. Inicio es explícito y como máximo
  una sesión del grupo queda en curso. Finalización/cancelación son terminales.
- **FR-004**: Crear o iniciar una sesión NO DEBE equivaler a confirmar emisión
  disponible. El usuario distingue estado de clase, señal disponible, espera y error;
  no se inicia ni reabre una clase automáticamente por horario, señal o reinicio.
- **FR-005**: El alumno DEBE consultar exclusivamente sesiones no canceladas de sus
  grupos con matrícula propia vigente. Reserva, pago pendiente, autoría, curso igual
  u oferta visible no sustituyen la matrícula. Reproducción exige clase en curso.
- **FR-006**: El permiso DEBE revalidarse en cada operación nueva y durante conexiones
  persistentes: sesión/cuenta activas, rol actual, grupo, estado de clase y matrícula
  o asignación/habilitación docente aplicables. Revocación/vencimiento impiden nuevas
  entregas autorizadas; una conexión establecida no mantiene un derecho anterior.
- **FR-007**: La vigencia del alumno DEBE reutilizar inicio/fin originales confirmados
  por 003, con exclusión del instante exacto final. No se extienden fechas, crean
  matrículas ni alteran cupos/órdenes/pagos. Retirar oferta o cambiar docente no revoca
  por sí mismo la matrícula ni convierte al docente anterior en responsable actual.
- **FR-008**: El video DEBE exigir autorización vigente de la clase incluso en solicitudes
  directas de manifiestos y segmentos. Proteger la página u ocultar un enlace no basta.
  No se habilita como video protegido una integración que no demuestre esas condiciones.
- **FR-009**: Solo el responsable actual autorizado DEBE poder aportar la emisión.
  Credenciales de emisión no se entregan al alumno ni aparecen en registros públicos;
  ante cambio/revocación docente se bloquea el uso anterior y se revisa la continuación
  autorizada. No se promete retirar bytes ya recibidos ni impedir capturas de pantalla.
- **FR-010**: Alumno con matrícula vigente, docente actual habilitado y administrador
  DEBEN leer y enviar texto únicamente en el chat de la sesión en curso autorizada.
  La participación del alumno excluye audio, cámara y transmisión de pantalla.
- **FR-011**: Los mensajes DEBEN contener entre 1 y 1000 caracteres, rechazando vacío
  o solo espacios. Se admite como máximo 10 mensajes nuevos por usuario y clase en
  cualquier intervalo de 10 segundos, compartidos por sus conexiones; reintento de
  un confirmado no consume una admisión nueva. El límite es un supuesto revisable
  de abuso, no una cifra de capacidad demostrada.
- **FR-012**: Cada mensaje aceptado DEBE conservar identidad, clase, autor, texto,
  orden y fecha autoritativos. Se confirma tras quedar conservado; no se presentan
  como entregados mensajes rechazados o de resultado incierto.
- **FR-013**: Reenvíos y acciones de clase/moderación DEBEN tener resultado único
  ante respuesta perdida, repetición o concurrencia. Reutilizar una intención con
  otro contenido produce conflicto y no sobrescribe el resultado original.
- **FR-014**: Al reconectar con permiso vigente, el usuario DEBE recuperar confirmados
  en orden sin duplicados visibles ni omisiones silenciosas. Una pérdida de conexión
  no autoriza reenvío automático tras volver a iniciar sesión o cambiar de cuenta.
- **FR-015**: Finalizada la clase, el chat DEBE ser de solo lectura para alumnos con
  matrícula vigente y responsables actuales autorizados. Al vencer la matrícula se
  deniegan historial y reconexión; la lectura autorizada no implica conservación
  indefinida o un plazo aprobado para borrar registros internos.
- **FR-016**: Docente actual habilitado y administrador DEBEN poder ocultar mensajes
  de su clase, también después de finalizarla. Las vistas de participantes, incluido
  el moderador, omiten el texto ocultado y conservan un indicador en su posición.
  No hay borrado físico, edición o restauración del mensaje en este incremento.
- **FR-017**: Esos responsables DEBEN poder silenciar y rehabilitar a un alumno solo
  durante esa clase en curso. El silencio afecta únicamente envíos nuevos, se aplica
  a todas sus conexiones y no bloquea lectura/video, cuenta o matrícula. No se hereda
  a otra clase ni autoriza silenciar a docentes/administradores.
- **FR-018**: Ante revisión obsoleta o competencia de acciones, el sistema DEBE
  impedir sobrescritura inadvertida y explicar cómo consultar el estado actual.
  Una acción confirmada conserva su atribución; permiso perdido impide una acción nueva.
- **FR-019**: Proyecciones para participantes DEBEN limitarse a sesión/grupo autorizados,
  nombre visible y rol del autor, texto permitido, orden, fechas y estados necesarios.
  No exponen correos, datos financieros, secretos, texto ocultado o causas privadas de cuenta.
- **FR-020**: Inicio/finalización/cancelación, moderación y rechazos relevantes DEBEN
  ser atribuibles con actor/fecha/acción/resultado, sin registrar credenciales o cuerpos
  privados en logs generales. El historial interno no se ofrece como una exportación nueva.
- **FR-021**: La interfaz DEBE distinguir vacío, espera de emisión, cargando, enviado,
  incierto, desconectado, acceso perdido y fallo recuperable; permitir teclado y uso
  en computador/móvil, con foco y estados accesibles. Logout/cambio de cuenta descarta
  mensajes, borradores, conexiones y respuestas tardías de la sesión previa.
- **FR-022**: Pruebas y recuperación DEBEN conservar sesiones, mensajes, orden y
  moderación confirmados, sin reaperturas, reenvíos o emisión automática. Restore
  exige invalidar accesos restaurados y revisar decisiones posteriores perdidas antes
  de reabrir; no restaura señales audiovisuales ni aprueba D13 por sí solo.
- **FR-023**: La aceptación DEBE separar gestión/chat locales, emisión y reproducción
  reales, permisos directos/vencidos, observación humana y capacidad medida. No
  presenta 2500 activos como logrado ni habilita persistencia/publicación sin D13.

### Key Entities *(include if feature involves data)*

- **Sesión de clase**: identidad, grupo único, título/descripción, creador original,
  último actor, estado, revisión y fechas de inicio/fin confirmadas. La clase no es
  una nueva matrícula ni una modificación del horario académico de 002.
- **Emisión asociada**: referencia de transmisión de una sesión y disponibilidad
  observada; acceso de emisión y de reproducción separados de la mera referencia.
- **Participación autorizada**: derecho actual derivado de sesión/cuenta, estado
  de clase, grupo y matrícula o responsabilidad docente; no es permanente por conexión.
- **Mensaje de clase**: identidad/intención, sesión, autor, texto, orden y fecha de
  confirmación; estado de ocultación y referencia a moderación. Contenido inmutable.
- **Restricción de participación**: alumno y sesión, silencio activo o rehabilitado,
  responsable y fecha. No modifica la cuenta global ni el compromiso académico.
- **Resultado de acción y registro atribuible**: intención, revisión, resultado y
  actor/fecha para repetición segura y explicación de inicio, cierre y moderación.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En todos los escenarios de gestión, responsables permitidos completan
  preparar/iniciar/finalizar; ante dos inicios simultáneos del mismo grupo queda
  exactamente una sesión en curso, sin efectos duplicados por repetición.
- **SC-002**: En el 100% de la matriz definida por visitante/alumno/docente/admin,
  grupo propio/ajeno, sesión activa/revocada y matrícula antes/en/después del fin,
  el acceso nuevo coincide con FR-005–009/010/015, incluida conexión ya establecida.
- **SC-003**: Una emisión de prueba autorizada se reproduce realmente y las solicitudes
  directas sin permiso o vencidas no reciben manifiestos/segmentos nuevos. Registrar
  calidad, duración y fallos observados; una simulación no cumple este resultado.
- **SC-004**: En cada escenario de intercambio/reconexión, los participantes autorizados
  de una clase reciben exactamente una representación de cada mensaje confirmado,
  en orden, y cero mensajes de otra clase; se rechazan límites y texto inválido.
- **SC-005**: El 100% de las pruebas de finalización, ocultación, silencio y rehabilitación
  conserva el efecto tras reconexión y consultas posteriores; no se filtra texto ocultado,
  no se envía durante silencio y no se altera otra clase, cuenta o matrícula.
- **SC-006**: Reinicio y restauración aislados conservan estados/mensajes/moderación
  del punto respaldado; sesiones antiguas denegadas y decisiones posteriores perdidas
  identificadas/revisadas. Verificar que no se duplican envíos ni se reabren clases.
- **SC-007**: Con consentimiento, un docente y un alumno reales realizan entrar a
  clase, seguir emisión y participar/consultar chat; un responsable realiza moderación
  y finalización. Registrar resultado, dificultad y ayuda por dispositivo y teclado,
  identificando expresamente modalidades no observadas y dependencias de emisión.
- **SC-008**: Cada evaluación de capacidad informa población, activos, conexiones,
  mensajes, reproducciones reales, duración, errores, latencia, recursos y costo
  observados. El objetivo combinado solo se acepta con mezcla/rúbrica D10 acordadas;
  pruebas individuales no lo acreditan y se conserva el presupuesto S/300 total.

### Trazabilidad inicial de aceptación

Los números de escenario se cuentan dentro de cada historia. Esta matriz indica
qué verificar; no registra pruebas ejecutadas ni reemplaza la futura matriz técnica.

| Requisitos | Escenarios principales | Resultados exigidos |
| --- | --- | --- |
| FR-001–004 | US1.1–US1.4, US1.6 | SC-001 |
| FR-005–007 | US1.5, US2.1, US2.3–US2.6, US3.2 | SC-002 |
| FR-008–009 | US2.2–US2.7; cambio de emisor en casos límite | SC-002, SC-003 |
| FR-010–012 | US3.1, US3.2, US3.6 | SC-002, SC-004 |
| FR-013–014 | US1.6, US3.3–US3.4, US4.5 | SC-001, SC-004, SC-005 |
| FR-015 | US3.5, US2.4, US3.2 | SC-002, SC-005 |
| FR-016–017 | US4.1–US4.5 | SC-005 |
| FR-018–020 | US1.5–US1.6, US3.2–US3.3, US4.1–US4.5; carreras de permisos | SC-001, SC-002, SC-005 |
| FR-021 | Recorridos completos US1–US4, estados de error/reconexión | SC-007 |
| FR-022 | Reinicio/restore y decisiones perdidas de casos límite | SC-006 |
| FR-023 | Separación de evidencias, viabilidad de video y escenario combinado | SC-003, SC-007, SC-008 |

## Assumptions

### Clarifications — decisiones del responsable (2026-11-17)

| ID | Pregunta | Respuesta confirmada | Efecto |
| --- | --- | --- | --- |
| V01 | Organización e inicio de sesiones | «Sesiones manuales; una en vivo por grupo» | Gestión por docente propio/admin, sin creación automática por horario; una sola en curso por grupo |
| V02 | Chat al finalizar | «Conservar historial de solo lectura mientras la matrícula siga vigente» | Finalizar bloquea envío, permite lectura vigente; no aprueba retención interna infinita |
| V03 | Moderación inicial | «Docente/admin pueden ocultar mensajes y silenciar a un alumno durante esa clase» | Moderación por responsabilidad actual y restricción acotada a la sesión |

### Supuestos delimitados para este incremento

- Estados preparada/en curso/finalizada/cancelada y cancelación solo antes de iniciar;
  finalizar es terminal. No hay calendario automático, asistencia o certificados.
- Puede haber varias preparadas del mismo grupo, sin fijar capacidad de servicio;
  empezar otra clase requiere finalizar la anterior. El horario académico no se
  modifica y no se impone una nueva regla automática de cierre por franja horaria.
- Títulos 160, descripciones 2000 y mensajes 1000 caracteres; el plan fijará el
  conteo de caracteres de forma uniforme. Límite de 10 mensajes/10 segundos por
  usuario/clase, incluyendo sus conexiones, como control inicial de abuso revisable.
- El responsable puede corregir título/descripción sin cambiar grupo, creador ni
  estado. Canceladas se conservan para gestión y no se muestran al alumno.
- Nombre visible/rol son los de la cuenta autorizada; no se exige cuenta de otro
  proveedor al alumno como nuevo requisito aprobado en este documento.
- Ocultar es irreversible desde las pantallas de este incremento. Se conserva
  evidencia interna sin mostrar original al moderador; rehabilitar revierte solo
  silencio de esa clase, sin conceder acceso perdido por otros motivos.
- Chat propio de la clase, sin adjuntos, mensajes privados, edición de mensajes,
  reacciones, exportaciones, búsqueda global o notificaciones externas.
- No hay grabación automática, catálogo de grabaciones ni participación audiovisual
  del alumno. No se promete impedir capturas o recuperar contenido ya recibido.
- Los límites técnicos y detalles de contratos se deciden en el plan; estos
  supuestos no son respuestas del responsable ni resultados de pruebas.

### Dependencias y prueba temprana de video

Se reutilizan identidad/permisos de 001, grupos/responsabilidad de 002 y derecho
temporal de 003. Materiales 004 mantiene sus archivos y tareas pendientes T065,
T066 y T068; no se le atribuye cierre por iniciar 005. No se modifican reglas
financieras, obligaciones de recuperación ni evidencia de los specs anteriores.

La elección vigente de emisión consta en DEC01; la obligación de acceso protegido
consta en principio VIII/RF16. La [revisión documental inicial de viabilidad](video-feasibility.md)
identifica una limitación de la modalidad de enlace oculto y la diferencia entre
elección de proveedor y cumplimiento demostrado. No se cambia proveedor ni se
rebaja la protección por iniciar este spec.

Antes de comprometer la implementación de reproducción se DEBE ejecutar una prueba
autorizada de emisión/reproducción y acceso directo permitido/denegado/vencido,
registrando recursos, tráfico y costo. Si no cumple, mantener esa parte pendiente
y presentar alternativas verificables; cambiar una obligación constitucional exige
su proceso de aprobación y, si afecta evaluación, validación con el profesor.
Gestión y chat pueden planificarse con límites claros sin simular aceptación de video.

D07/D08, configuración/cuenta emisora autorizada y conexión del docente son
dependencias de video; D10 lo es de capacidad combinada y D13 de demo persistente
o publicación. No se contrata VPS, se inicia emisión pública ni se opera con
cuentas personales mediante esta especificación. El siguiente paso es el plan
técnico con la investigación/prueba temprana, seguido de tareas y análisis previo
a implementar. No quedan preguntas de alcance sin respuesta en V01–V03.

### Frontera con los siguientes incrementos

005 entrega sesiones, acceso a clase, chat e historial y moderación de sus cuatro
historias, con recuperación y comprobaciones propias. No incorpora un rediseño
global de pantallas, paneles agregados de todos los módulos ni despliegue del MVP.
La protección real del video sigue siendo requisito de 005; no se traslada su
incumplimiento a 007 para declarar completa la reproducción mediante un enlace oculto.

006 será **Pulido de la aplicación**: navegación por rol, presentación coherente,
escritorio/móvil, accesibilidad y estados en pantallas anteriores y las de 005
que estén implementadas. Antes de fijar sus paneles debe contrastar datos,
operaciones y permisos con código y pruebas. Puede ordenar/enlazar lo existente
y evaluar consultas pequeñas explícitas bajo permisos actuales, con sus pruebas.
Funciones sustanciales o permisos nuevos se documentan y derivan al spec dueño;
no bloquean el pulido independiente de pantallas ya operativas.

007 será un spec separado de **Despliegue y validación del MVP**: entorno de
pruebas, configuración, HTTPS, secretos, migración, copia/recuperación, costo y
recorridos reales por rol. Su aceptación de volumen/carga usará al menos 15.000
cuentas registradas y meta de 2.500 usuarios concurrentes activos, con escenarios
y límites definidos en la hoja de ruta y contrastados con la rúbrica D10 antes
de aceptación. El tráfico de la academia se mide separado del video externo.
Nada de ello se presenta como alcanzado por cerrar este documento ni modifica
retroactivamente especificaciones o resultados anteriores.
