# Contrato HTTP propuesto — materiales

Fecha: 2026-11-16. Rutas relativas al proxy existente; todavía no disponibles.
UUID canónico, JSON cerrado de 16 KiB y rechazo de campos desconocidos. Escrituras
requieren cookie, Origin exacto, X-CSRF-Protection: 1 y Sec-Fetch-Site verificado.

## Superficie

| Método/ruta | Comportamiento |
| --- | --- |
| GET /materials/groups | Grupos mínimos accesibles por rol y relación actual. |
| GET /materials/groups/:groupId | Contexto mínimo autorizado, aunque no existan materiales. |
| GET /materials/groups/:groupId/items | Gestor todos los estados, alumno solo publicados. |
| POST /materials/groups/:groupId/uploads | Gestor: intención nueva 201 o replay 200. |
| GET /materials/uploads/:uploadId | Solo dueño de intención con permiso actual; PENDING/COMPLETED. |
| PUT /materials/uploads/:uploadId/content | Solo gestor dueño: binario completo, material 201 o replay 200. |
| GET /materials/items/:materialId | Vista de material según permiso actual. |
| GET /materials/items/:materialId/content | Descarga completa autorizada. |
| PATCH /materials/items/:materialId | Editar textos con revisión. |
| POST /materials/items/:materialId/publish | Publicar/republicar explícitamente. |
| POST /materials/items/:materialId/withdraw | Retiro lógico. |

Listado de grupos: admin todos (cancelados solo histórico), docente propios no
cancelados y habilitado, alumno mediante matrícula vigente. No catálogo como fuente
de derecho. Paginación page entero ≥1, pageSize 1–50 (20 por defecto), orden
createdAt DESC,id DESC. Query cerrado page/pageSize; solo gestor filtra state.
Autorizar antes de total/paginación. Vacío autorizado es 200 con items [], no error.
Contexto grupo mínimo: id, name, courseName; gestor recibe state/acciones orientativas.
Para grupos, orden name,id estable; no bytes/datos financieros en contexto.

## Upload

POST JSON: intentionId UUID, title trim 1–200, description null o hasta 2000,
downloadName seguro hasta 180, mediaType permitido, byteSize entero 1–20 000 000,
sha256 hex minúsculo 64. Digest canónico cubre todos esos campos y groupId.
Respuesta `{data:{uploadId,state,materialId,command:{replayed}}}`; PENDING no material.

PUT únicamente application/octet-stream, Content-Encoding ausente/identity,
archivo como cuerpo. Contar bytes reales aun sin Content-Length, respetando framing
válido; rechazar longitud/hash/estructura incoherentes. MIME de archivo se determina
desde intención/contenido, no desde octet-stream. Sin multipart/base64. Replay de
PUT también compara contenido; un archivo distinto no se acepta por estar COMPLETED.
Error no altera material previo ni publica PENDING. Corrección requiere intención nueva.

## Comandos y proyecciones

PATCH `{commandId,expectedRevision,title,description}`. Publicar/retirar
`{commandId,expectedRevision}`. Revisión decimal positiva string. Reautorizar,
resolver replay; intención nueva compara revisión actual. Respuesta
`{data:{resource,command:{id,replayed,appliedRevision,result}}}` con APPLIED/NO_CHANGE.
resource es vista actual permitida; appliedRevision/result corresponden al comando
original, sin devolver una publicación vieja como actual.

Alumno: id, groupId, title, description, mediaType, byteSize, downloadName,
publishedAt. Gestor añade state, revision, createdAt, updatedAt, createdBy como
referencia mínima, withdrawnAt. No emails, secretos, digest interno, bytes, rutas,
órdenes o pagos en JSON. Envelopes de consulta `{data:...}`, página con
items/page/pageSize/total. DTO no extiende fila SQL.

Descarga 200: MIME detectado, Content-Length real, Content-Disposition attachment
con nombre ASCII seguro y filename* UTF-8 escapado; Cache-Control no-store,
X-Content-Type-Options nosniff, Referrer-Policy no-referrer. Sin ETag/304, visor o
enlace público. Range se ignora: 200 completo reautorizado. HEAD reautoriza y responde
solo metadatos, sin leer bytea. No tokens en URL ni redirección a almacenamiento.

## Errores seguros

Envelope `{error:{code,message,requestId,fields?}}`, allowlist propia de campos;
no causas SQL/bytes/digest/ruta ni datos de otro actor.

| HTTP | Código |
| --- | --- |
| 400 | VALIDATION_ERROR: textos, archivo vacío/truncado, formato/hash/longitud incompatibles. |
| 401 | AUTH_REQUIRED: sesión ausente/revocada/inválida. |
| 403 | REQUEST_NOT_ALLOWED procedencia/CSRF; FORBIDDEN capacidad general prohibida. |
| 404 | NOT_FOUND para referencia inexistente o recurso ajeno/no visible, indistinguibles. |
| 409 | MATERIAL_VERSION_CONFLICT, MATERIAL_STATE_CONFLICT, IDEMPOTENCY_CONFLICT. |
| 413 | VALIDATION_ERROR por exceso de archivo o JSON según sus límites separados. |
| 415 | UNSUPPORTED_MEDIA_TYPE por transporte/encoding no admitido. |
| 429 | RATE_LIMITED: cuotas o plaza de actor, Retry-After técnico. |
| 503 | TEMPORARILY_UNAVAILABLE: plaza global/BD/espacio/error seguro o resultado incierto. |

Resultado incierto requiere consulta de intención antes de reintento manual. Error
tras headers cierra flujo sin JSON adicional. Registro seguro con plantilla de ruta,
acción/código y referencias mínimas, sin cuerpo/cookies/textos libres. Mantener
allowlists/errores previos de 001–003 sin ampliarlos genéricamente.
