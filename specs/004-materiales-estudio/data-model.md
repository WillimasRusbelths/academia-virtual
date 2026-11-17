# Modelo de datos propuesto

Fecha: 2026-11-16; sin SQL aplicado. UUID, revisiones bigint positivas como string
y timestamptz(6) sin perder microsegundos. Migración aditiva posterior a 0007.

## Material y contenido

| Entidad/campo | Regla |
| --- | --- |
| Material.id/groupId | Identidad/grupo inmutables; FK restrict a grupo existente. |
| title | Trim 1–200 caracteres; sin controles. |
| description | Opcional hasta 2000 caracteres; vacío normaliza a null; texto sin HTML ejecutable. |
| state/revision | PREPARED/PUBLISHED/WITHDRAWN; revisión inicia 1, aumenta solo al cambiar. |
| createdBy/updatedBy | Referencias de cuentas; autor original inmutable. |
| createdAt/updatedAt | Instantes servidor; publishedAt/withdrawnAt última transición, nullable. |
| MaterialContent.materialId | PK/FK unique restrict; exactamente un contenido por material. |
| bytes/byteSize | bytea privado; 1–20 000 000 bytes; CHECK de octet_length igual a byteSize. |
| mediaType | application/pdf, image/jpeg o image/png validado frente a contenido. |
| downloadName | Nombre seguro hasta 180 caracteres, extensión coherente; nunca ruta. |
| sha256 | Hexadecimal minúsculo 64, recalculado por servidor. |

Contenido/metadatos se insertan juntos. Restricción diferida/trigger impide commit
de material sin contenido, incluso por SQL directo del rol escritor. Protección
de BD impide UPDATE de archivo/grupo/autor original; restauración por rol separado.
Listados nunca seleccionan bytes; digest no se entrega al alumno.

## MaterialUpload

uploadId UUID, `(actorId,intentionId)` unique, groupId, title, description,
downloadName, mediaType, byteSize y sha256 esperados, digest canónico, createdAt,
materialId nullable unique. Todos los datos esperados quedan inmutables.

PENDING técnico cuando materialId null, COMPLETED cuando creación atómica finaliza.
PENDING no es material ni publicable. Transferencia fallida no guarda bytes.
Timeout solo aborta red, no cambia identidad o permiso; reintento reautoriza.
Corregir archivo/textos de intento requiere nueva intención. Sin purga/expiración
automática de intenciones; retención con D13 y cuotas para crear intentos.

## MaterialCommand y MaterialAuditEvent

Comando unique `(actorId,commandId)`, materialId, acción, digest de entrada canónica
(incluye expectedRevision y cambios), appliedRevision, APPLIED/NO_CHANGE y momento.
Resultado persistido junto a cambio y auditoría; upload no duplica otro ledger.

Auditoría: id, actorId, groupId, materialId/intentionId aplicable, acción, momento,
resultado seguro y revisión. No bytes, textos completos, secretos, rutas privadas o
sesiones. Fallos/denegaciones de transporte se registran con seguridad existente;
no se inventa evento de cambio de negocio si el commit revierte.

## Transiciones y consistencia

| Origen | Acción | Destino |
| --- | --- | --- |
| PENDING técnico | Completar bytes y reautorizar | Nuevo Material PREPARED revisión 1; upload COMPLETED. |
| PREPARED/WITHDRAWN | Publicar explícitamente | PUBLISHED, revisión +1, publishedAt. |
| PUBLISHED | Publicar con intención nueva | NO_CHANGE si expectedRevision coincide. |
| PREPARED/PUBLISHED | Retirar | WITHDRAWN, revisión +1, withdrawnAt. |
| WITHDRAWN | Retirar otra vez | NO_CHANGE si revisión coincide. |
| Cualquier material permitido | Editar textos | Mismo archivo/grupo/estado, +1 solo ante cambio efectivo. |

Replay conserva efecto original y proyecta vista actual autorizada. Grupo cancelado:
solo administrador consulta/descarga/retira; nadie crea/edita/publica. Docente ajeno
o inhabilitado no gestiona aunque sea autor. Alumno requiere publicado y matrícula
propia vigente; no se inventan reglas de revocación financiera.

Índices: Material(groupId,state,createdAt,id); upload(actorId,intentionId);
command(actorId,commandId); auditoría(materialId,momento,id). Sin unique global
por hash: distintas intenciones pueden compartir contenido igual independientemente.
FK restrict conserva datos previos. Upgrade desde 0007 y restore con fixtures
deben verificar constraints, autoría, contenido, estados y permisos.
