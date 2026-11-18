# Especificación: clases en vivo y chat por grupo — 005

**Feature Branch**: `feat/005-clases-chat`, creada desde `origin/main` después del
merge del PR #5. La especificación inicial se redactó en
`feat/003-reservas-ordenes-matricula`; se conserva su evidencia histórica.

**Created**: 2026-11-17, America/Lima.

**Status**: Alcance del ensayo MVP aprobado por el responsable el 2026-11-17,
constitución 2.0.0. Preparación T001–T004 verificada; implementación funcional y
reproducción real pendientes. [Resultados](evidence/t001-t004-results.json).
Validación académica pendiente si afecta evaluación.

**Aprobación V05**: «entoces la apruebo», sobre la propuesta concreta de YouTube
como ensayo con referencia compartible y Cloudflare fuera del MVP. El
[registro de adopción](evidence/video-scope-adoption.md) conserva texto aprobado,
impacto y límites. Se mantienen cuatro historias, 24 escenarios, 23 FR y ocho SC.

[Plan](plan.md), [contrato audiovisual](contracts/video.md) y [tareas](tasks.md)
describen el trabajo y su progreso. [G-V005](video-gate.md) exige prueba real del ensayo;
la protección multimedia completa pertenece a un incremento posterior.
Los checkpoints anteriores describen su revisión histórica y no se reescriben.

Secuencia posterior: [005 → 006 → 007](../../docs/planificacion/hoja-ruta-005-007.md),
con [revisión de paneles](../../docs/planificacion/revision-paneles-006.md).
Cloudflare queda fuera de esos tres specs; no se crean ramas de 006/007.

**Input**: el responsable aceptó iniciar el siguiente spec de clases en vivo y
chat por grupo y confirmó V01–V03 en esta conversación.

Fuentes: [alcance MVP](../../docs/alcance-mvp.md), HU15/HU16 de
[historias](../../docs/01-analisis-de-sistema/02-historias-del-usuario.md), RF08/RF16/RF17/RF19 de
[requisitos](../../docs/01-analisis-de-sistema/03-requisitos-funcionales.md),
[constitución 2.0.0](../../.specify/memory/constitution.md),
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

Como alumno con matrícula vigente quiero encontrar mis sesiones y reproducir
la emisión YouTube de prueba dentro del aula. La aplicación controla sus propios
recursos; el enlace externo puede compartirse y no se anuncia como video protegido.

**Why this priority**: permite demostrar la clase con el proveedor elegido y
comprobar acceso vigente al aula sin atribuir controles externos inexistentes.

**Independent Test**: con cuentas/contenido autorizados, reproducir YouTube
realmente; comprobar referencias nuevas y chat propios permitidos/denegados al
instante exacto. Ensayar referencia compartida aparte y registrar la limitación.
Un iframe creado o una simulación no acredita reproducción real.

**Acceptance Scenarios**:

1. **Given** alumno con matrícula vigente, **When** consulta su grupo, **Then** ve
   sesiones autorizadas preparadas/en curso/finalizadas; preparadas no reproducen
   y finalizadas no ofrecen grabación.
2. **Given** LIVE con referencia configurada y permiso, **When** inicia reproducción,
   **Then** reproduce YouTube realmente, distingue espera/error/estado y conoce
   el límite del enlace compartible.
3. **Given** visitante/sin matrícula/otro grupo, **When** solicita datos o referencia
   desde Academia, **Then** se deniega; una referencia YouTube ya compartida se
   ensaya aparte sin prometer denegación por parte del proveedor.
4. **Given** fin original de matrícula, **When** consulta en ese instante o después,
   **Then** API/chat/reconexión/referencia nueva se deniegan; la UI retira el player
   al detectar pérdida. No se acredita revocar el enlace YouTube conocido.
5. **Given** oferta retirada o cambio docente, **When** mantiene matrícula vigente,
   **Then** conserva su derecho; la gestión de referencia exige responsable actual.
   Continuación/revocación de la emisión YouTube se opera y registra manualmente.
6. **Given** cierre/revocación/deshabilitación, **When** había aula/conexión abierta,
   **Then** se deniegan entregas propias nuevas y se descartan respuestas y player
   de la sesión anterior; reproducción externa no se presenta como controlada.
7. **Given** finalización de clase, **When** pide nueva referencia desde Academia,
   **Then** se deniega y el player se retira al detectar el cierre; el responsable
   detiene YouTube manualmente y registra resultado, sin prometer revocar el enlace.

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
- Permiso docente revocado: denegar nuevas acciones de gestión/moderación propias.
  La emisión YouTube abierta requiere operación manual del titular; no se promete
  cortarla desde Academia. Responsable actual gestiona referencia sin heredar secretos.
- Grupo retirado de oferta conserva acceso de alumnos con matrícula vigente;
  grupo cancelado no permite iniciar sesiones ni entregar contenido propio nuevo.
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
- **FR-005**: El alumno DEBE consultar exclusivamente sesiones no canceladas
  de sus grupos con matrícula propia vigente. Reserva, pago pendiente, autoría, curso
  igual u oferta visible no sustituyen la matrícula. Entregar desde Academia Virtual
  la referencia de reproducción del ensayo exige clase en curso; la referencia
  externa compartida no demuestra autorización por matrícula en YouTube.
- **FR-006**: El permiso DEBE revalidarse en cada operación y entrega nueva
  de recursos gestionados por Academia Virtual y durante sus conexiones persistentes:
  sesión/cuenta activas, rol actual, grupo, estado de clase y matrícula o asignación/
  habilitación docente aplicables. Revocación/vencimiento impiden nuevas entregas
  propias. La interfaz descarta respuestas anteriores y retira el reproductor al
  detectar pérdida de permiso; esto no acredita cortar reproducción externa de YouTube.
- **FR-007**: La vigencia del alumno DEBE reutilizar inicio/fin originales confirmados
  por 003, con exclusión del instante exacto final. No se extienden fechas, crean
  matrículas ni alteran cupos/órdenes/pagos. Retirar oferta o cambiar docente no revoca
  por sí mismo la matrícula ni convierte al docente anterior en responsable actual.
- **FR-008**: El ensayo del MVP DEBE usar YouTube Live con OBS, comprobar el
  acceso autorizado a la referencia que entrega la aplicación y realizar reproducción
  real. DEBE advertir y registrar que el enlace puede compartirse y que no se acredita
  autorizar manifiestos/segmentos del proveedor por matrícula o impedir reproducción
  directa tras vencimiento. La integración NO DEBE anunciarse como video protegido.
- **FR-009**: Solo el responsable actual autorizado DEBE poder asociar o
  cambiar la referencia de emisión de una clase dentro de Academia Virtual. Secretos
  de OBS/YouTube no se entregan al alumno ni se registran en la aplicación. La pérdida
  de permiso bloquea nuevas acciones propias. Iniciar/detener o revocar una emisión
  en YouTube requiere la operación del responsable de la cuenta emisora, registrada
  en el ensayo; no se presume control automático de esa cuenta o de un emisor anterior.
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
- **FR-021**: La interfaz DEBE distinguir vacío, cargando, emisión no
  configurada, espera/señal observada, enviado, incierto, desconectado, acceso perdido
  y fallo recuperable, con teclado, computador/móvil, foco y estados accesibles. DEBE
  informar que la reproducción YouTube corresponde al ensayo y su enlace puede
  compartirse. Logout/cambio de cuenta descarta mensajes, borradores, conexiones,
  reproductor y respuestas tardías de la sesión previa.
- **FR-022**: Pruebas y recuperación DEBEN conservar sesiones, mensajes, orden y
  moderación confirmados, sin reaperturas, reenvíos o emisión automática. Restore
  exige invalidar accesos restaurados y revisar decisiones posteriores perdidas antes
  de reabrir; no restaura señales audiovisuales ni aprueba D13 por sí solo.
- **FR-023**: La aceptación DEBE separar gestión/chat, controles propios de
  Academia Virtual, reproducción YouTube real, limitaciones de acceso externo,
  observación humana y capacidad medida. NO DEBE presentar el ensayo como protección
  multimedia por matrícula ni 2.500 activos como logrados. D10/D13 conservan sus
  puertas; no habilitar persistencia/publicación sin D13. Cloudflare queda fuera del MVP.

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
- **SC-002**: En el 100% de la matriz de visitante/alumno/docente/admin,
  grupo propio/ajeno, sesión activa/revocada y matrícula antes/en/después del fin,
  el acceso a recursos propios coincide con FR-005–009/010/015, incluidas conexiones
  ya establecidas. Las referencias externas YouTube se observan y reportan como
  limitación separada; no se cuentan como control propio aprobado.
- **SC-003**: Una emisión de prueba autorizada YouTube se reproduce realmente
  en navegador desde una clase en curso. La API deniega obtener referencias nuevas
  sin permiso, vencido o después de finalizar; la UI retira el reproductor al detectar
  pérdida de acceso. Registrar duración, calidad, fallos y pruebas con referencia
  externa compartida, sin presentar estas últimas como acceso protegido o revocado.
  Una simulación no acredita reproducción real ni control de YouTube.
- **SC-004**: En cada escenario de intercambio/reconexión, los participantes autorizados
  de una clase reciben exactamente una representación de cada mensaje confirmado,
  en orden, y cero mensajes de otra clase; se rechazan límites y texto inválido.
- **SC-005**: El 100% de las pruebas de finalización, ocultación, silencio y rehabilitación
  conserva el efecto tras reconexión y consultas posteriores; no se filtra texto ocultado,
  no se envía durante silencio y no se altera otra clase, cuenta o matrícula.
- **SC-006**: Reinicio y restauración aislados conservan estados/mensajes/moderación
  del punto respaldado; sesiones antiguas denegadas y decisiones posteriores perdidas
  identificadas/revisadas. Verificar que no se duplican envíos ni se reabren clases.
- **SC-007**: Con consentimiento, un docente y un alumno reales realizan
  entrar a clase, seguir emisión YouTube de prueba y participar/consultar chat; un
  responsable realiza moderación, finalización y detención manual de emisión en el
  proveedor. Registrar resultado/dificultad/ayuda por dispositivo/modalidad y
  limitaciones externas; modalidades no observadas permanecen identificadas.
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
| V04 | Proveedor de prueba del MVP y evolución posterior | YouTube se usará como prueba del MVP; Cloudflare se prevé después y no entra en este MVP | Mantener YouTube Live + OBS para el ensayo; Cloudflare queda fuera de 005/006/007 y no bloquea por falta de contratación o implementación. La aclaración no acredita protección de video ni modifica por sí sola FR-008/009 o la constitución. |

| V05 | Aprobación del alcance concreto del ensayo | «entoces la apruebo» | Aprueba la propuesta revisable y enmienda 2.0.0: YouTube de prueba con límite externo; Cloudflare posterior. Validación del profesor pendiente si afecta criterios de evaluación. |

V04 fija proveedores; V05 aprueba el ajuste explícito del alcance. No hay nueva
aprobación de reproducción, capacidad o publicación por modificar documentos.

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

La elección vigente es YouTube Live + OBS para el ensayo aprobado en V05 y
constitución 2.0.0. [Contrato audiovisual](contracts/video.md) y
[G-V005](video-gate.md) separan controles propios, reproducción real y límites
externos. Debe ejecutarse una prueba autorizada antes de aceptar reproducción;
un doble de tests no la acredita. D07/D08 quedan pendientes de evidencia del ensayo,
D10 de capacidad combinada y D13 antes de demo persistente o publicación.
La aprobación del responsable no acredita validación del profesor si afecta evaluación.
No se contrata infraestructura o emite señal por actualizar el spec.

### Frontera con los siguientes incrementos

005 entrega sesiones, acceso a clase, chat e historial y moderación de sus cuatro
historias, con recuperación y comprobaciones propias. No incorpora un rediseño
global de pantallas, paneles agregados de todos los módulos ni despliegue del MVP.
005 verifica el ensayo YouTube y sus controles propios con límites explícitos.
La protección multimedia completa y Cloudflare quedan fuera del MVP y requieren
un incremento posterior; 007 no podrá anunciar el ensayo como video protegido.

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
