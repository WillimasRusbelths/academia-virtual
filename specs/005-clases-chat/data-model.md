# Modelo de datos propuesto — 005

2026-11-17. Diseño de sesiones/chat; ninguna tabla o migración aplicada.
Referencias User/Session/AcademicGroup/AcademicCourse/Enrollment pertenecen a sus
propietarios. Clases no modifica esas entidades. [Consistencia](contracts/integration.md).

## Convenciones

UUID canónico; `bigint` positivo como decimal string en JSON, nunca number.
Instantes `timestamptz(6)`, decisiones exactas en microsegundos bigint; representación
de fecha ISO UTC preserva precisión de seis dígitos. Texto por puntos de código,
trim definido uniformemente, sin NUL/surrogates sueltos. FKs RESTRICT, sin CASCADE.
Trim usa `String.trim` y el conjunto equivalente de `identity_trim` definido en
0001; verificar igualdad Unicode con pruebas, sin modificar esa función.
Migración posterior a 0009; runtime DML mínimo, owner migra. Constraints/triggers
protegen identidades inmutables y transiciones sin alterar migraciones anteriores.

## ClassSession

| Campo | Regla |
| --- | --- |
| id, groupId | PK y grupo único inmutable, FK AcademicGroup |
| title, description | Título trim 1–160; descripción null o ≤2000 |
| state | PREPARED / LIVE / FINISHED / CANCELLED |
| revision | ≥1; cambia solo por textos/estado, sin conflicto por cada mensaje |
| lastEventSeq | ≥0; contador de cambios confirmados bajo lock exclusivo de clase |
| createdBy, updatedBy | FK User; creador inmutable, último actor de textos/estado |
| createdAt, updatedAt, startedAt, finishedAt, cancelledAt | Hechos autoritativos; coherentes con estado y monotónicos |

Transiciones: PREPARED→LIVE→FINISHED o PREPARED→CANCELLED, terminales sin reapertura.
Editar textos conserva estado/grupo/creador. LIVE único por groupId mediante índice
parcial y bloqueo exclusivo de grupo. FINISHED exige startedAt/finishedAt; CANCELLED
no tiene startedAt. No se cambia estado por horario, socket, ausencia de señal o reinicio.

Índices: `(groupId,createdAt,id)`, parcial UNIQUE `(groupId) WHERE state='LIVE'`.
Separar revisión de gestión, orden de mensaje y orden de cambios; no compararlos.

## ClassMessage

| Campo | Regla |
| --- | --- |
| id, classId | PK, FK clase inmutable |
| authorId | FK User; inmutable |
| messageSeq | Secuencia de su evento SEND; UNIQUE(classId,messageSeq) |
| text | Texto trim 1–1000, original interno inmutable |
| acceptedAt | Instante exacto de confirmación lógica bajo locks |
| hiddenAt, hiddenBy, hiddenEventSeq | Nulos o terna completa; ocultación irreversible en este incremento |

Vista de participantes: autor visible/rol actuales mediante capacidad pública de
usuarios, sin correo/estado privado. Si hiddenAt existe, devolver indicador sin
text ni original al moderador; nunca una fila SQL completa. La cuota cuenta
mensajes confirmados aunque estén ocultos. Índices `(classId,messageSeq)` y
`(classId,authorId,acceptedAt)`. Huecos de messageSeq por otros tipos de evento son
válidos; el cursor de sincronización usa ClassChange, no contigüidad de mensajes.

## ClassStudentRestriction

PK `(classId,studentId)`; FK clase/User. `muted`, `revision`, `updatedBy`, `updatedAt`,
`lastEventSeq`. Solo alumno participante vigente al aplicar acción; responsables
actuales gestionan durante LIVE. Silenciar no cambia Session/User/Enrollment.
Silencio sigue persistido para trazabilidad al finalizar, pero no concede envío,
ni se copia a otra clase. Rehabilitar también exige LIVE y revisión actual.
Cambios efectivos incrementan revisión y registran evento; NO_CHANGE conserva
resultado sin inventar una transición. Para alumno, solo su propia restricción.

## ClassCommand

PK `(actorId,commandId)` compartida por crear/editar/estado/enviar/moderar.
Campos: operación, destino/groupId/classId según caso, digest SHA-256 del cuerpo
canónico (incluye revisión esperada), referencias de resultado, appliedRevision
cuando corresponda, appliedEventSeq, result y appliedAt.

No almacena secretos ni DTO con texto. Crear clase usa commandId como intención;
enviar usa commandId como intención del mensaje. Mismo actor/ID/digest recupera
resultado confirmado; distinto cuerpo/operación/destino produce conflicto. Cuenta
distinta no accede a ese resultado. Autoridad actual se evalúa antes del ledger;
replay no resucita texto ocultado ni habilita clase finalizada.

COMMIT incierto se resuelve consultando el mismo commandId con permiso actual.
No hay segundo envío automático. Error previo a commit no crea resultado aplicado;
429 no consume una admisión de mensaje. La combinación y efectos se persisten juntos.

## ClassChange

PK `(classId,eventSeq)`; eventSeq >0, asignado desde lastEventSeq con clase UPDATE.
Tipos CREATED/EDITED/STARTED/FINISHED/CANCELLED/MESSAGE_SENT/MESSAGE_HIDDEN/
STUDENT_MUTED/STUDENT_UNMUTED. Referencias mínimas, actor interno, occurredAt,
messageId/targetStudentId/revisión según tipo. **Sin cuerpo original serializado.**

Registro append-only, persistido junto con efecto/receipt/auditoría. Replay/NO_CHANGE
no añaden evento ni duplican aviso. Una lectura toma snapshot+watermark bajo lock
SHARE de clase; delta lee intervalo confirmado y vuelve a proyectar estado actual.
Sin purga inicial. Si en el futuro hay compactación, deberá definir cursor inválido
y reinicio explícito; no omitir eventos silenciosamente.

## ClassAuditEvent

ID, actor interno, clase/grupo, operación, commandId, resultado, revisión/eventSeq
e instante. Inicio/final/cancelación, ocultación/silencio y rechazos relevantes
atribuidos. Sin texto de chat, título libre o secretos en logs generales. Los
rechazos se registran por mecanismo seguro separado si la transacción revierte;
no confirmar una mutación solo para conservar su rechazo. No nueva exportación.

## SocketTicket — efímero

No requiere tabla. Hash de secreto aleatorio de 256 bits, sesión/authVersion,
actor/clase, emitido/vencimiento, estado consumido. TTL 30 s; uniuso, proceso único,
mapa máximo 3.000 entradas y 4 pendientes por sesión; sin renovación automática.
Rechazar admisión al alcanzar límite; eliminar expirados/consumidos. El ticket
no sobrevive reinicio/restore ni autoriza contenido por sí mismo.

## VideoAccess — sin modelo productivo aprobado

Puerto de consulta con estado NOT_CONFIGURED, sin URL/credencial. No añadir columnas
de streamKey o enlaces de YouTube como si fuesen secretos protegidos. La entidad
de emisión del spec requiere diseño definitivo después de [G-V005](video-gate.md).
Ese componente falta de forma explícita; no se sustituye por una implementación ficticia.

## Recuperación e integridad

Dump conjunto incluye tablas, índices, secuencias lógicas, ledger y originales
internos. Restore aislado verifica últimos contadores contra eventos, mensajes y
ocultaciones, índices únicos, estados terminales y FKs. Invalidar sesiones/enlaces
restaurados antes de reabrir. Descartar tickets, sockets y cualquier autorización
efímera. No reemitir avisos como nuevos mensajes ni iniciar señal audiovisual.
Comparar decisiones posteriores al backup y conservar pérdidas como pendientes
de revisión humana; no inventarlas desde una copia anterior. D13 sigue abierto.
