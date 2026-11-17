# Contrato HTTP previsto — reservas, órdenes y matrícula

RP004/RP005/RP006, diseño. Ninguna ruta nueva existe por este documento. Base `/api/v1`, cookie
HttpOnly existente, autorización backend y revalidación transaccional en escrituras.
Fuentes: [spec](../spec.md), [modelo](../data-model.md), [integración](integration.md).

## Transporte y permisos

JSON estricto, cuerpo máximo 16 KiB, mismo origen, CSRF existente en mutaciones de
usuario, no-store y requestId seguro. Rechazar claves/query desconocidas, UUID inválidos,
fechas imposibles, enteros/revisiones fuera de representación y dinero no exacto.
No añadir cuotas comerciales, máximos de cursos o tolerancias de pago no aprobados.
Conservar cuotas y seguridad de identidad; los límites de admisión se diseñan/miden
en VP003, no se inventan como política aprobada en RP004.

Permisos nuevos previstos, ampliando la matriz cerrada existente:

| Operación / permiso | ADMIN | STUDENT | TEACHER | Visitante |
| --- | --- | --- | --- | --- |
| enrollment:price-manage | Sí | No | No | No |
| enrollment:reserve-own | No | Solo propio | No | No |
| enrollment:pay-own | No | Solo propio | No | No |
| enrollment:read-own | No | Solo propio | No | No |
| enrollment:read-all | Sí | No | No | No |
| enrollment:incident-follow-up | Sí | No | No | No |

La proyección reservable del alumno usa reserve-own; administración ve precio y
compromisos mediante rutas propias. academic:manage no concede facultades financieras.
Docente conserva sus rutas 002, sin acceso a este módulo. La entrada técnica de pago
no es un permiso de usuario ni confirmación manual administrativa.

## Operaciones del núcleo

Todas las respuestas de éxito son `{data: DTO}`. Paginación: page/pageSize, default
20 y máximo técnico 50 como listados existentes; no es aforo ni cuota de reserva.
Las rutas propias no aceptan studentId del navegador como autoridad.

| Método y ruta | Entrada / permiso | Respuesta y garantías |
| --- | --- | --- |
| GET /admin/enrollment/courses/:courseId/price | price-manage | Precio definido con importe/PEN/revisión, o representación explícita sin definir; no cero ficticio. |
| PUT /admin/enrollment/courses/:courseId/price | commandId, expectedRevision o null para alta, amountMinor, currency=PEN; price-manage | Precio y revisión resultante. Actualizar no cambia orden confirmada. commandId repetido idéntico recupera resultado tras reautorizar; payload distinto, conflicto. |
| GET /enrollment/offerings | reserve-own; page/pageSize, q opcional | Proyección reservable paginada de grupos visibles con curso, período/franjas/docente por nombre, precio definido o sin definir, capacidad/retenciones/ocupación/disponibilidad reales y evaluatedAt. No reserva ni garantiza cupo. |
| POST /enrollment/selection-preview | groupIds; reserve-own | Resumen/desglose/total calculados por servidor con evaluatedAt; consulta no vinculante, sin intención admitida, prioridad, precio congelado ni plaza retenida. |
| POST /enrollment/reservation-requests | intentionId, groupIds; reserve-own | 200 con solicitud ADMITTED o resultado existente. Espera no confirma reserva ni inicia plazo. La misma intención nunca obtiene nueva secuencia. |
| GET /enrollment/reservation-requests | read-own; page/pageSize | Solicitudes propias pendientes e históricas, con intención y estado. Recuperación tras recarga/logout sin necesitar conservar el ID en el dispositivo ni crear otra admisión. |
| GET /enrollment/reservation-requests/:intentionId | read-own | ADMITTED, REJECTED con motivo seguro o CONFIRMED con referencia de orden. Recuperación autorizada incluso tras respuesta perdida. |
| GET /enrollment/orders | read-own; page/pageSize | Órdenes propias vigentes e históricas, con estado y resumen de incidencia, sin datos ajenos. |
| GET /enrollment/orders/current | read-own | Orden con reservas vigentes o null; no la confunde con una orden histórica pagada. |
| GET /enrollment/orders/:orderId | read-own | Detalle original, importes, inicio/vencimiento, serverNow y estado confirmado. Oferta oculta no impide consultar compromisos propios. |
| POST /enrollment/orders/:orderId/payment-attempts | initiationId; pay-own | Replay autorizado recupera intento canónico antes de condiciones mutables. Nueva iniciación exige reservas vigentes y grupos visibles; incierto no autoriza otro cobro. Sin confirmación de matrícula; adaptador real sigue D02. |
| GET /enrollment/enrollments | read-own; page/pageSize | Matrículas propias, vigencia efectiva/historial y período original. No amplía acceso a materiales/clases. |
| GET /enrollment/enrollments/:enrollmentId | read-own | Matrícula propia con curso/grupo/fechas/franjas originales, sin reactivación por editar oferta. |
| GET /admin/enrollment/orders | read-all; page/pageSize, studentId opcional | Consulta administrativa de todos, con identificación mínima necesaria para investigar; sin secretos ni datos de tarjeta. |
| GET /admin/enrollment/orders/:orderId | read-all | Compromisos y antecedentes necesarios, sin facultad implícita de modificarlos. |
| GET /admin/enrollment/incidents | read-all; page/pageSize | Incidencias abiertas e historial de seguimiento. No indicador de resolución económica por una anotación. |
| GET /admin/enrollment/incidents/:incidentId | read-all | Hechos normalizados y seguimiento administrativo autorizado. |
| POST /admin/enrollment/incidents/:incidentId/follow-ups | commandId, content; incident-follow-up | Seguimiento append-only, actor/instante del servidor. No cambia pago, matrícula, reserva, plazo o bloqueo del grupo. |

La consulta de oferta puede mostrar precio sin definir pero no permitir reservarlo;
la decisión de reserva revalida todo bajo locks. No se comunica que la oferta filtrada
ya está garantizada. La lista existente 002 mantiene su contrato; el acceso a selección
se integra desde app mediante la proyección nueva, sin imports internos entre features.
Oferta/preview usan una instantánea consistente con evaluatedAt para precios, estado,
capacidad y conteos después de locks críticos y recheck según [P06](payments.md);
la proyección usa otra sentencia READ COMMITTED. Referencias nuevas exigen
redescubrimiento; espera fallida produce 503 sin cifras ficticias. Preview no admite
intención ni sustituye las validaciones al confirmar. Su POST conserva CSRF/origen.

Para solicitudes se envían groupIds únicos canónicos; el servidor resuelve curso,
precio, titular y fechas. Seleccionar dos grupos de un curso es rechazo del conjunto,
no normalización silenciosa a uno de ellos. No aceptar total, confirmedAt, expiresAt,
admissionSequence o matrícula como instrucciones del cliente.

## DTO y repetición

Solicitud: id propio, intentionId, estado, admittedAt y resultado seguro. La secuencia
de prioridad se conserva para auditoría administrativa necesaria; no mostrar lista o
posición de terceros. CONFIRMED referencia orden; REJECTED nunca referencia compromisos
de otro alumno. 200 con ADMITTED requiere UI explícita de espera; el cliente actual
descarta cuerpos 202, por eso esta ruta no usa 202 con ticket oculto.

Orden: id, estado de compromiso, revisión, detalle curso/grupo/precio/moneda, total,
confirmedAt/expiresAt/serverNow, resumen de pago y resumen seguro de incidencia.
`paymentState` no sustituye el estado de reservas ni implica matrícula. Ocultamiento
añade `paymentAllowed=false` y mensaje genérico de oferta no disponible, sin estado
de cuenta, motivo privado o generación docente. No enviar referencias de sesión.

Importes y revisiones: cadenas exactas; timestamps UTC; horario civil America/Lima.
RP005 precisa los timestamps financieros como UTC con seis cifras fraccionarias;
los límites derivados admiten año ISO ampliado. Lectores conservan su precisión,
sin Date intermedio para decidir vigencia, igualdad o permiso de pago. Los tipos
temporales históricos de identidad/oferta no cambian por este contrato 003.
La validación de representación no aprueba mínimos, descuentos o gratuidad. Un importe
cero explícito no da matrícula por omitir pago; modalidades cobrables y límites reales
se verifican con proveedor en D02, antes de habilitar ese camino.

Cada audiencia tiene proyección cerrada; no serializar filas por spread. Matrículas
y órdenes ocultan referencias internas de verificación y cuerpos del proveedor. Las
anotaciones internas de seguimiento no se entregan como texto arbitrario al alumno:
este recibe el estado «Pago en conciliación, sin matrícula» y el resumen autorizado.

Idempotencia sin mecanismos duplicados: ReservationRequest es ledger de la intención;
PaymentAttempt es ledger de iniciación; EnrollmentCommand registra precio/seguimiento
por (actorKind,actorReference,commandId), incluyendo operación en digest. Verificación
se deduplica por (providerScope,providerPaymentId), scope confiable de proveedor,
comercio y entorno. ProviderReceipt es trabajo técnico, no otro resultado económico.
Auditoría no es otro ledger de resultados.
Repetir requiere permiso actual y mismo contenido; nunca amplía plazo o crea otro cobro.
Resolver replay de iniciación antes de revalidar vigencia/visibilidad para nueva acción.
Otra initiationId con intento no resuelto recupera el intento canónico, sin aceptar
otra iniciación ni disparar red. Respuesta tardía no rebaja resultado terminal.
DTO seguro distingue operación incierta, pago pendiente y matrícula/incidencia;
no expone claves externas, recibos, firmas, evidencias o causas privadas.

## Errores seguros y estado incierto

Envelope existente `{error:{code,message,requestId,fields?}}`, mensajes cerrados,
sin stack/cause, SQL, tokens, credenciales, callbacks ni datos privados del docente.
Errores se allowlistean por familia/ruta y audiencia en backend y cliente.

| HTTP | Código previsto | Uso |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | Forma/campos/query inválidos; fields solo de esa operación. |
| 401 / 403 | AUTH_REQUIRED / FORBIDDEN / REQUEST_NOT_ALLOWED | Cuenta/sesión/permiso/CSRF; sin efectos o datos privados. |
| 404 | NOT_FOUND | Recurso inexistente o ajeno indistinguibles tras autorización. |
| 409 | IDEMPOTENCY_CONFLICT | Misma identidad con contenido u operación distintos. |
| 409 | ENROLLMENT_VERSION_CONFLICT | Revisión administrativa antigua; no sobrescribir automáticamente. |
| 409 | ACTIVE_ORDER_EXISTS / COURSE_COMMITMENT_EXISTS | Conflicto propio vigente, sin retener plazas adicionales. |
| 409 | OFFERING_NOT_RESERVABLE / CAPACITY_UNAVAILABLE | Revalidación de visibilidad/corte/precio o cupo fallida; sin causas privadas. |
| 409 | STUDENT_SCHEDULE_CONFLICT | Incompatibilidad efectiva de selección/compromisos propios; no filtrar terceros. |
| 409 | RESERVATION_EXPIRED / PAYMENT_NOT_ALLOWED | Iniciar pago no permitido por plazo/condiciones, sin reiniciar reserva. |
| 409 | GROUP_COMMITMENTS_BLOCK_OPERATION | Solo administración de oferta; operación protegida bloqueada. No devolver lista financiera en error académico. |
| 413 / 415 / 429 | VALIDATION_ERROR / UNSUPPORTED_MEDIA_TYPE / RATE_LIMITED | Transporte y cuotas existentes; Retry-After seguro cuando corresponda. |
| 503 | TEMPORARILY_UNAVAILABLE | Fallo temporal o resultado incierto; no afirmar rollback por transporte. |

REJECTED de una solicitud consultada se representa como estado del DTO con motivo
seguro, no como un nuevo fallo HTTP de GET. Errores de entrada no crean solicitud
admitida. Un fallo temporal durante despacho deja la cabeza pendiente, sin rechazo
terminal para vaciar cola. No hay redespacho ciego del navegador.

Allowlists de fields: precio(commandId,expectedRevision,amountMinor,currency);
reserva(intentionId,groupIds); pago(initiationId); seguimiento(commandId,content);
preview(groupIds); listados solo su query. No habilitar todos los campos financieros
en todas las rutas.

## Superficies no habilitadas y proveedor

Sin DELETE/PATCH de compromisos, cancelación voluntaria, matrícula/confirmación manual,
resolución económica, reembolso o traslado. La gestión de oferta sigue sus rutas 002
con guard RA-05, revisión y descripción opcional prevista; nunca desactiva el guard.

No se define URL/firma/SDK Izipay ficticio. [P03–P07](payments.md) definen recepción
durable mínima, correlación, finalización atómica y recuperación; D02 debe acreditar
modalidad/autenticidad/IDs/idempotencia/consulta/acuse reales antes de habilitar ruta.
Entrada técnica SYSTEM no depende de sesión viva del alumno. Falsas entradas no crean
pago ni bloqueantes financieros; un hecho auténtico sin orden confiable queda solo
en consulta administrativa mínima, sin titular o grupos adjudicados arbitrariamente.
Excepción de transporte del callback será estrecha y autenticada, sin ampliar permisos.
Un simulador existe exclusivamente
en fixtures de test y nunca expone una ruta de aprobación accesible en producción.
No desactivar Origin/CSRF para todas las mutaciones por necesidades del proveedor.
