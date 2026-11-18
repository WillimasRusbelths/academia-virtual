# Contrato HTTP propuesto — clases 005

2026-11-18. **Gestión implementada en T020–T023**: POST groups/:groupId/sessions,
PATCH sessions/:classId, POST start/finish/cancel y GET commands/:commandId
([evidencia](../evidence/t020-t023.md)). T030–T031 implementa GET groups, contexto de grupo,
lista de sesiones, detalle y video deshabilitado ([evidencia](../evidence/t030-t031.md)).
En video LIVE devuelve NOT_CONFIGURED; PREPARED/FINISHED CLASS_NOT_LIVE, sin ID.
Chat, tickets, configuración de video y reproducción real siguen pendientes.
Prefijo real `/api/v1`; las rutas de
la tabla son relativas a él. JSON cerrado ≤16 KiB, cookie existente, no-store.
Escrituras exigen Origin exacto, `X-CSRF-Protection: 1` y procedencia verificada.
No nueva excepción binaria. [Políticas y transacciones](integration.md).

## Superficie

| Método/ruta | Capacidad y efecto |
| --- | --- |
| GET /classes/groups | Grupos accesibles según rol/derecho actual; paginado |
| GET /classes/groups/:groupId | Contexto mínimo autorizado, incluso sin clases |
| GET /classes/groups/:groupId/sessions | Gestor todos los estados, alumno excluye canceladas |
| POST /classes/groups/:groupId/sessions | Gestor prepara clase, sin señal/chat automático |
| GET /classes/sessions/:classId | Vista mínima vigente y acciones orientativas |
| PATCH /classes/sessions/:classId | Gestor corrige título/descripción con revisión |
| POST /classes/sessions/:classId/start | PREPARED→LIVE, una por grupo |
| POST /classes/sessions/:classId/finish | LIVE→FINISHED, terminal |
| POST /classes/sessions/:classId/cancel | PREPARED→CANCELLED, terminal |
| GET /classes/sessions/:classId/messages | Snapshot de mensajes/historial permitido |
| POST /classes/sessions/:classId/messages | Participante autorizado envía texto nuevo en LIVE |
| GET /classes/sessions/:classId/changes | Delta durable de cambios desde cursor |
| POST /classes/sessions/:classId/messages/:messageId/hide | Gestor oculta en LIVE/FINISHED |
| POST /classes/sessions/:classId/students/:studentId/mute | Gestor silencia alumno vigente, LIVE |
| POST /classes/sessions/:classId/students/:studentId/unmute | Gestor rehabilita, LIVE |
| GET /classes/commands/:commandId | Resultado de comando propio con autorización actual |
| POST /classes/sessions/:classId/socket-tickets | Ticket efímero, no habilita escritura/lectura nueva por sí solo |
| GET /classes/sessions/:classId/video | LIVE autorizada: CONFIGURED con ID de prueba; sin señal garantizada |
| GET /classes/sessions/:classId/video-reference | Gestor actual: configuración/revisión, sin secretos |
| PUT /classes/sessions/:classId/video-reference | Gestor actual PREPARED/LIVE: asociar/retirar ID versionado |

El [contrato de video](video.md) detalla referencia y player del ensayo. No hay endpoint de emisión o segmentos propio. [G-V005](../video-gate.md) exige prueba real.
PREPARED muestra información, pero messages/changes/tickets requieren LIVE o
FINISHED; en FINISHED el chat solo permite lectura y ocultación. Grupo cancelado no entrega
contenido propio de chat/referencia nuevo; admin puede consultar metadatos históricos y
finalizar/cancelar para cerrar estado, sin reabrir o enviar. Docente ajeno/anterior
no conserva gestión por autoría. No hay endpoint público de clases/chat.

PATCH corrige textos en PREPARED/LIVE/FINISHED/CANCELLED sin reabrir o cambiar grupo,
si conserva autoridad actual de gestión. Grupo cancelado solo permite al admin
corregir metadatos históricos; no habilita otra operación de contenido por hacerlo.

Listas de grupos: page≥1, pageSize 1–50 (20 por defecto), nombre/id estable.
Sesiones: createdAt DESC,id DESC, mismos límites; filtro state solo gestor.
Autorizar antes de contar/paginar; total nunca incluye recursos ajenos.
Query cerrado; vacío autorizado devuelve 200 con items[], diferente de indisponibilidad.

## Cuerpos e intenciones

- Crear: `{commandId,title,description}`. Grupo procede de ruta, nunca cambia.
- Editar: `{commandId,expectedRevision,title,description}`.
- Iniciar/finalizar/cancelar: `{commandId,expectedRevision}`.
- Enviar: `{commandId,text}`; no exige revisión de gestión obsoleta por otro mensaje.
- Ocultar: `{commandId}`; mensaje debe pertenecer a la clase de la ruta.
  Ya oculto produce NO_CHANGE sin volver a divulgar texto.
- Silenciar/rehabilitar: `{commandId,expectedRevision}` de restricción (0 si no existe).
  NO_CHANGE solo si revisión coincide; alumno objetivo se revalida como participante.
- Ticket: `{}`; nunca acepta actor, sesión, rol o vencimiento del cliente.

UUID canónico; revisiones/cursors como decimal string, no number. Texto según
[modelo](../data-model.md): puntos de código, trim uniforme, límites del spec y
sin NUL/surrogates sueltos. Campo desconocido se rechaza; no HTML ni enlaces activos.

Comando confirmado responde `{data:{resource,command:{id,replayed,result,
appliedRevision,appliedEventSeq}}}`; campos inaplicables null. Create/send nuevos
201; replay y otros comandos 200. resource se vuelve a proyectar en su estado
actual permitido, no el DTO original guardado. El resultado conserva la decisión
original, pero nunca vuelve a emitir o restaurar un texto ocultado.

GET commands exige mismo actor y autoridad actual del destino: APPLIED si existe
receipt, o NOT_CONFIRMED si no existe para el actor. Este último **no significa
fallo definitivo**: puede competir con una transacción en curso. No crear nueva
intención; reintentar manualmente la misma conserva resultado único. Si un receipt
propio existe y perdió autoridad del destino, 404. No revelar resultados de terceros.

Autoridad antes de ledger; digest diferente bajo el mismo actor/ID produce conflicto.
Replay de mensaje antes de comprobar silencio/finalización para intención nueva,
siempre que siga teniendo permiso de lectura del resultado. Enviar no renueva matrícula.

## Proyecciones y sincronización

Sesión: id/groupId/title/description/state, fechas y revision; contexto mínimo
grupo/curso. Gestor añade acciones orientativas y atribución mínima. Alumno no
recibe canceladas. No precios, correos, nombres de tabla, claves o datos privados.

Mensaje visible: id, messageSeq, author `{id,name,role}`, acceptedAt, hidden:false,
text, viewVersion. Mensaje ocultado: mismos identificadores/orden permitidos,
hidden:true, viewVersion y **sin propiedad text**. Todos, incluido moderador,
reciben la misma regla de ocultación. No listar matrícula/roster global; el
responsable puede moderar un alumno referenciado en la conversación autorizada.

GET messages admite `beforeSeq?` y `limit` 1–100 (50 por defecto). Snapshot reciente
en orden ascendente para render, highWatermark de ClassChange, nextBeforeSeq para
historial anterior y hasOlder. Primera consulta no promete cargar todo el historial.
Una página `beforeSeq` nunca avanza el cursor global de sincronización, aunque
traiga un highWatermark más reciente. Solo snapshot inicial y delta aplicados
lo inicializan/avanzan; de lo contrario se omitirían cambios de mensajes ya cargados.
Restricción propia y estado de clase se incluyen; listado de restricciones ajenas
solo para responsables y referencias autorizadas de la conversación.

GET changes exige `after` decimal ≥0 y `limit` 1–100 (50). Respuesta:
items en eventSeq ascendente, nextCursor, highWatermark, hasMore. Cada item representa
efecto actual mínimo (mensaje, tombstone, sesión o restricción visible por rol), no
payload histórico. Nunca incluir motivo privado/otro alumno silenciado al alumno.
Los eventos filtrados por audiencia consumen posición mediante avance seguro del
cursor sin revelar datos; una página puede no tener items y sí avanzar nextCursor.
No saltar directamente a highWatermark si queda intervalo sin procesar.

Snapshot con H + delta después de H cierra la carrera de conexión. Tras reconexión,
leer desde último cursor confirmado; la UI aplica IDs/versiones/tombstones antes de
avanzarlo. Ocultación posterior al último mensaje también es un cambio. Cursor futuro
es conflicto de sincronización; cursor inválido no produce omisiones silenciosas.
El servidor toma clase SHARE, captura watermark y proyecta en una decisión coherente.
Todo resultado posterior a HIDE omite original, aun al consultar eventos SEND viejos.

## Errores y seguridad

Envelope existente `{error:{code,message,requestId,fields?}}`, campos/códigos de
clases en allowlists específicas, sin ampliar genéricamente contratos previos.

| HTTP | Código propuesto y recuperación |
| --- | --- |
| 400 | VALIDATION_ERROR; corregir campos/cursor |
| 401 | AUTH_REQUIRED; descartar estado/conexiones de sesión |
| 403 | REQUEST_NOT_ALLOWED para procedencia; FORBIDDEN para capacidad general |
| 404 | NOT_FOUND: inexistente/ajeno/no visible indistinguibles |
| 409 | CLASS_VERSION_CONFLICT, CLASS_STATE_CONFLICT, CLASS_ALREADY_LIVE, IDEMPOTENCY_CONFLICT, CHAT_SYNC_REQUIRED |
| 409 | CHAT_MUTED: mensaje funcional solo al propio alumno autorizado |
| 413/415 | VALIDATION_ERROR / UNSUPPORTED_MEDIA_TYPE, límites JSON existentes |
| 429 | RATE_LIMITED: cuota o admisión por actor; Retry-After técnico |
| 503 | TEMPORARILY_UNAVAILABLE: BD/recursos, resultado incierto o servicio degradado |

Video propio: 200 CONFIGURED con ID solo si LIVE configurada y permiso vigente;
NOT_CONFIGURED o CLASS_NOT_LIVE sin ID según contrato. CONFIGURED no acredita
señal ni exclusividad; accesos ajenos mantienen 404. GET video es consulta pasiva,
sin renovación de inactividad, incluso en sondeo. No retorna streamKey o tokens.
Sin cache público, logs de texto/cookies/tickets o respuestas de clase tras logout.
