# Contrato HTTP — oferta académica

**Estado**: propuesto para implementación, sin endpoints nuevos disponibles todavía.
Normativa: [spec](../spec.md), [modelo](../data-model.md) y
[protocolo transaccional](integration.md). Mantener `/api/v1` y JSON UTF-8.

## Transporte y autorización comunes

- Cookie de sesión HttpOnly existente; sin bearer ni sesión en almacenamiento web.
- Mutaciones POST/PATCH/PUT con Origin exacto, Content-Type application/json y
  X-CSRF-Protection: 1; respetar Sec-Fetch-Site y límite 16 KiB existentes.
- GET sin body; parámetros desconocidos, arrays de query y campos desconocidos se rechazan.
- Cache-Control: no-store y Referrer-Policy: no-referrer. No relajar CORS/CSP para oferta.
- Guard verifica permiso antes de buscar recursos; mutaciones revalidan dentro de la
  transacción. Nunca confiar en role, actorId o teacher eligibility recibidos del cliente.
- Éxito de consulta: `{data: DTO}`. Listado:
  `{data:{items:DTO[],page:number,pageSize:number,total:number}}`.
- Éxito de comando:
  `{data:{resource:AdminCourse|AdminGroup,command:{id:UUID,replayed:boolean,appliedRevision:Revision,result:APPLIED|NO_CHANGE}}}`.
  Mantiene ApiClient actual, que retorna el contenido de data.
- Error:
  `{error:{code,message,requestId,fields?:[{field,message}],conflictingGroupIds?:UUID[]}}`.
  conflictingGroupIds solo se permite en los dos conflictos administrativos indicados abajo.
  Mensajes/fields salen de catálogos permitidos, nunca error.message de driver/dominio.

## Matriz por operación

Todos los permisos requieren cuenta/sesión habilitada conforme a identidad.
404 es indistinguible entre inexistente y fuera del conjunto consultable.
El docente puede consultar el curso solo como contexto de sus grupos, no enumerar
otros grupos del curso ni usar la ruta de catálogo general.

| Familia | Administrador | Alumno | Docente | Visitante |
| --- | --- | --- | --- | --- |
| admin/academic: lectura de cualquier estado y selector docente | Permitido | 403 | 403 | 401 |
| admin/academic: cualquier mutación | Permitido con versión/estado | 403 | 403 | 401 |
| academic/courses: catálogo publicado | Permitido, misma proyección pública | Permitido | 403; usar teaching/groups | 401 |
| teaching/groups: propios, cualquier estado | 403; usar administración | 403 | Permitido solo asignados | 401 |

Para alumno un curso sin grupos visibles o grupo no visible retorna 404 en detalle y
no figura en lista/conteo. Docente con grupo ajeno retorna 404, aun si conoce su curso.
Una cuenta sin sesión válida recibe 401 sin revelar estado de recursos.

## Tipos y validación

| Tipo/campo | Regla |
| --- | --- |
| UUID | Cadena UUID válida; identidad estable generada por servidor para recursos. commandId generado por cliente. |
| Revision | Cadena decimal canónica positiva, 1–9223372036854775807; sin conversión a number. |
| name | string con al menos un carácter no blanco después de recorte; no unicidad de nombres. |
| description | string recortado o null en preparación; no vacío para publicar curso. No HTML interpretado. |
| periodStart / periodEnd | YYYY-MM-DD real; inicio≤fin cuando ambos existen; ambos exigidos para publicar. |
| timeZone | Literal America/Lima, default del grupo; otro valor es inválido. |
| capacity | number entero 1–50; no aceptar string, null ni fracción cuando se configura. Omitido en alta de borrador significa aún no configurado. |
| teacherUserId | UUID de cuenta o null para desasignar en preparación; si se asigna debe ser docente activo/verificado. |
| schedule | Array de franjas; cada elemento solo dayOfWeek/startTime/endTime. Puede estar vacío solo en preparación. |
| dayOfWeek | number entero ISO 1–7. |
| startTime / endTime | HH:mm, 00:00–23:59; inicio<fin. No 24:00, segundos ni cruce de medianoche. |
| cancellationReason | string no vacío tras recorte; solo administración; body dentro de 16 KiB. |
| commandId | UUID obligatorio en toda mutación; no es requestId ni identidad de sesión. |
| expectedRevision | Revision obligatoria en toda mutación de recurso existente; no se exige en altas. |

Cada franja debe ocurrir al menos una vez cuando se completa periodo; duplicados y
solapamientos internos son inválidos. Publicación compara ocurrencias con grupos
Publicados de ese docente, sin excluirlos por curso retirado ni revisión requerida.

Altas de grupo requieren name; atributos omitidos quedan incompletos. La interfaz distingue
«sin configurar» de intentar guardar un valor de capacidad vacío/inválido.
PATCH aplica solo campos presentes; un PATCH sin atributos modificables se rechaza.
No aceptar state, revision, teacherReviewRequired, snapshot o generation en formularios.
Transiciones solo mediante comandos explícitos.

## DTO cerrados por audiencia

### AdminCourse

`id, name, description:null|string, state:DRAFT|PUBLISHED|WITHDRAWN,
revision:Revision, studentVisible:boolean, createdAt:ISOInstant, updatedAt:ISOInstant`.

studentVisible es derivado; no un estado adicional ni capacidad de inscripción.
El detalle de curso no incluye grupos sin paginar; se consultan por su listado.

### AdminGroup

`id, courseId, name, state:DRAFT|PUBLISHED|WITHDRAWN|CANCELLED, revision,
periodStart:null|Date, periodEnd:null|Date, timeZone:America/Lima,
capacity:null|integer, occupancy:null, availability:null, capacityStatus:NOT_CALCULATED,
schedule:Slot[], teacher:null|{id,name,eligible:boolean}, teacherReviewRequired:boolean,
studentVisible:boolean, cancellationReason:null|string, cancelledAt:null|ISOInstant,
lastPublishedTeacherId:null|UUID, createdAt, updatedAt`.

Referencia anterior permite administración aun si cambia la asignación. No exponer
authVersion ni generación docente al cliente. No usar UserView completo.

### CatalogCourse / CatalogGroup

Course: `id,name,description` (no vacía).
Group: `id,courseId,name,periodStart,periodEnd,timeZone,capacity,
occupancy:null,availability:null,capacityStatus:NOT_CALCULATED,
schedule:Slot[],teacher:{name}`.

Todos sus campos requeridos están completos; solo grupos visibles. Sin estado editorial,
revision, motivo de cancelación, email, rol/estado de cuenta o revisión docente.

### TeachingGroup

`id,course:{id,name,description:null|string},name,state,periodStart:null|Date,
periodEnd:null|Date,timeZone,capacity:null|integer,occupancy:null,availability:null,
capacityStatus:NOT_CALCULATED,schedule:Slot[],teacher:{name}`.

Solo si teacherUserId coincide con actor actual. Puede ser incompleto por estado;
mostrar esos valores como «Sin configurar». No motivos/fechas de cancelación, elegibilidad,
generación, studentVisible, ledger o datos de otros grupos.

### Slot / TeacherCandidate

Slot: `{dayOfWeek:number,startTime:HH:mm,endTime:HH:mm}`.
TeacherCandidate: `{id:UUID,name:string}`, solo elegibles; id permite distinguir
homónimos. Selector administrativo, no buscador público de cuentas ni exposición de email.

## Rutas de consulta

Prefijo común `/api/v1`; paths siguientes relativos.

| Método/path | Permiso | Datos | Query admitida |
| --- | --- | --- | --- |
| GET /admin/academic/courses | academic:manage | Página AdminCourse | q,state,page,pageSize |
| GET /admin/academic/courses/:id | academic:manage | AdminCourse | Ninguna |
| GET /admin/academic/courses/:courseId/groups | academic:manage | Página AdminGroup | q,state,page,pageSize |
| GET /admin/academic/groups/:id | academic:manage | AdminGroup | Ninguna |
| GET /admin/academic/teachers | academic:manage | Página TeacherCandidate | q,page,pageSize |
| GET /academic/courses | academic:read-published | Página CatalogCourse | q,page,pageSize |
| GET /academic/courses/:id | academic:read-published | CatalogCourse | Ninguna |
| GET /academic/courses/:courseId/groups | academic:read-published | Página CatalogGroup | page,pageSize |
| GET /academic/courses/:courseId/groups/:id | academic:read-published | CatalogGroup | Ninguna |
| GET /teaching/groups | academic:read-own | Página TeachingGroup | page,pageSize |
| GET /teaching/groups/:id | academic:read-own | TeachingGroup | Ninguna |

page entero≥1; pageSize entero 1–50, default20; q string recortado (vacío equivale a
sin búsqueda) aplicado a nombre sin distinguir mayúsculas; state solo enum de la entidad.
Orden estable por name e id; para grupos propios puede usarse el mismo orden.
Parámetros son strings de query validados, nunca fragmentos SQL. Filtrar permisos/
visibilidad antes de paginar y contar en la misma instantánea.
Páginas vacías responden 200 con items=[]; fallo de infraestructura no equivale a vacío.

## Rutas de mutación

Solo academic:manage. Atributos indicados no incluyen claves técnicas automáticas.
Crear devuelve 201; editar/transicionar 200. Replay conserva estado 201 del alta o
200 del comando; campo replayed permite distinguirlo sin reejecutar.

| Método/path | Body admitido | Precondiciones / efecto |
| --- | --- | --- |
| POST /admin/academic/courses | commandId,name,description? | Crear DRAFT; referencia del servidor. |
| PATCH /admin/academic/courses/:id | commandId,expectedRevision,name?,description? | DRAFT/WITHDRAWN; editar solo presentes. |
| POST /admin/academic/courses/:id/publish | commandId,expectedRevision | DRAFT/WITHDRAWN; descripción y revalidación completa de grupos PUBLISHED; no refrescar snapshots de grupos. |
| POST /admin/academic/courses/:id/withdraw | commandId,expectedRevision | PUBLISHED→WITHDRAWN; conservar grupos y su programación. |
| POST /admin/academic/courses/:courseId/groups | commandId,name,periodStart?,periodEnd?,timeZone?,capacity?,teacherUserId? | Crear grupo DRAFT; curso existe; franjas se configuran después. |
| PATCH /admin/academic/groups/:id | commandId,expectedRevision,name?,periodStart?,periodEnd?,timeZone?,capacity?,teacherUserId? | DRAFT/WITHDRAWN; no courseId ni schedule; revalidar franjas si cambian fechas. |
| PUT /admin/academic/groups/:id/schedule | commandId,expectedRevision,schedule | Reemplazo atómico; DRAFT/WITHDRAWN. |
| POST /admin/academic/groups/:id/publish | commandId,expectedRevision | DRAFT/WITHDRAWN, padre PUBLISHED, integridad/elegibilidad/agenda; capturar docente/generación actuales. |
| POST /admin/academic/groups/:id/withdraw | commandId,expectedRevision | PUBLISHED→WITHDRAWN; no borrar datos ni snapshot. |
| POST /admin/academic/groups/:id/cancel | commandId,expectedRevision,cancellationReason | DRAFT/PUBLISHED/WITHDRAWN→CANCELLED terminal; conservar datos. |

Para configurar un borrador no se requiere que el curso esté retirado si los datos
de curso no cambian. Editar un grupo PUBLISHED exige retirarlo aunque su curso ya esté
WITHDRAWN. Cambiar asignación solo en preparación, y debe ser una cuenta elegible.

## Conflictos, errores y resolución

| HTTP/código | Situación | Datos seguros / UI |
| --- | --- | --- |
| 400 VALIDATION_ERROR | Forma, campo desconocido, rango, fechas/franjas internas | fields permitidos; conservar formulario. |
| 401 AUTH_REQUIRED | Sesión no habilitada/expirada/revocada | Limpiar datos privados/navegar al acceso; sin replay automático. |
| 403 FORBIDDEN | Rol no permitido | Sin búsqueda del destino ni datos privados. |
| 403 REQUEST_NOT_ALLOWED | Origen/CSRF/fetch-site | Mantener política existente. |
| 404 NOT_FOUND | Inexistente, grupo no perteneciente a curso de URL o fuera de conjunto consultable | Respuesta indistinguible, sin causa/estado real. |
| 409 OFFERING_VERSION_CONFLICT | expectedRevision no vigente | Recargar y comparar; no sobrescribir ni reenviar automáticamente. |
| 409 OFFERING_STATE_CONFLICT | Editar publicado/cancelado o transición no permitida | Explicar retiro previo/terminalidad con catálogo de mensajes. |
| 409 TEACHER_NOT_ELIGIBLE | Docente seleccionado no habilitado | Solo administración, campo teacherUserId; no devolver estado/rol/email de cuenta. |
| 409 TEACHER_SCHEDULE_CONFLICT | Conflicto efectivo con otro grupo PUBLISHED | Mensaje de conflicto; solo admin puede recibir IDs académicos conflictivos, nunca datos de cuenta. |
| 409 COURSE_PUBLICATION_BLOCKED | Algún grupo PUBLISHED requiere revisión o no es válido | IDs de grupos afectados solo a administración; retirar/revisar individualmente. |
| 409 IDEMPOTENCY_CONFLICT | Mismo actor/commandId con payload diferente | No reintentar con clave anterior; revisar si era nueva intención. |
| 413 VALIDATION_ERROR / 415 UNSUPPORTED_MEDIA_TYPE | Transporte existente | Sin aumentar límite ni relajar JSON. |
| 429 RATE_LIMITED | Límites existentes si aplican | Respetar Retry-After; no afirmar nueva cuota académica. |
| 503 TEMPORARILY_UNAVAILABLE | Pool, locks agotados, aborto persistente o commit ambiguo | No afirmar que el comando no se aplicó; comprobar/reintentar manualmente con el mismo commandId. |

Mantener envelope existente: referencias de conflictos administrativos se expresan como
campos de detalle permitidos `conflictingGroupIds:UUID[]` solo en estos dos 409.
SafeErrorFilter debe permitir este detalle académico validado, sin abrir serialización
genérica; app/http.ts y el ApiFailure tipado lo reciben explícitamente.
El detalle no se incluye en 401/403/404 ni en consultas de alumno/docente.

fields admitidos: name,description,periodStart,periodEnd,timeZone,capacity,teacherUserId,
schedule,cancellationReason,expectedRevision,commandId,q,state,page,pageSize.
Errores de celdas del editor se resumen como schedule en servidor; validación local
puede señalar la franja concreta. El texto mostrado sale del catálogo local, no del
mensaje arbitrario recibido.

## Revisiones, replay y respuesta incierta

- Revision de agregado se compara tras locks. Guardar datos idénticos en estado editable
  puede responder NO_CHANGE con igual revision; una transición inválida no es un no-op.
- commandId pertenece a una intención y payload normalizado canónico, incluidos destino,
  operación y expectedRevision. Cambiar campos/revision exige un commandId nuevo.
- Consulta ledger después de reautorizar; mismo hash devuelve proyección actual del
  recurso y appliedRevision original, con replayed=true. No restaura estados previos,
  no vuelve a publicar ni genera segundo evento APPLIED.
- Dos intentos del mismo commandId se resuelven por bloqueo del actor y PK del ledger,
  confirmado en la misma transacción. Fallos de negocio no consumen la clave.
- Si la respuesta se pierde o cambia la sesión después de commit, conservar intención
  en memoria y permitir comprobación/reintento manual autorizado con igual ID/payload.
  No guardar sesión/secretos en storage ni reenviar al iniciar sesión.
- Recarga que pierde el formulario exige comprobar el estado antes de una nueva alta;
  una nueva intención con ID diferente no puede deduplicarse por nombre, que no es único.
  No prometer deduplicación entre intenciones distintas.

## Ejemplo documental

Alta de curso (forma, sin credenciales):
`{commandId:"<UUID nuevo>",name:"Álgebra",description:"Fundamentos de álgebra"}`.

Publicación de grupo preparado:
`{commandId:"<UUID nuevo>",expectedRevision:"4"}`.

Estos ejemplos muestran el contrato; los UUID entre ángulos son referencias
documentales y deben sustituirse por UUID válidos en una validación futura.
