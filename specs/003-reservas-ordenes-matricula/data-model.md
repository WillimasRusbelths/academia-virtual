# Modelo de datos previsto — reservas, órdenes y matrícula

**RP004/RP005/RP006, 2026-10-30**. Diseño aditivo, sin esquema generado ni aplicado.
Fuentes: [spec](spec.md), [investigación](research-rp004.md),
[integración](contracts/integration.md) y [contrato temporal RP005](contracts/time.md).
Reloj/worker y [conciliación RP006](contracts/payments.md) definidos por diseño;
RV001 integrará las comprobaciones antes de tareas. Ninguna garantía se presenta
como ejecutada. Se corrige explícitamente el estado provisional de pago pendiente.

## Convenciones e identidades

- UUID para entidades, intención y comando; revisiones positivas bigints representadas
  como cadenas. Identidad del alumno proviene de la sesión, nunca del cuerpo.
- Instantes UTC persistidos en timestamptz(6), bigint de microsegundos en dominio y
  cadenas UTC de seis fracciones en transporte; sin Date intermedio ni parser global.
  Fechas civiles `YYYY-MM-DD`, franjas y America/Lima conservadas. Límites derivados
  admiten ISO ampliado para año 10000; epoch negativo se conserva sin truncamiento.
- Precios/órdenes exactos PEN en unidades menores enteras; transporte mediante cadena decimal
  canónica. No flotantes, precio implícito, impuestos, descuentos o mínimos inventados.
  Ausencia de precio es distinta de un importe explícito; cero no activa matrícula.
  Evidencia económica auténtica incompatible conserva importe/escala/moneda reales,
  sin fingir PEN ni hacerla aplicable a una orden por ello.
- Referencias a User/AcademicCourse/AcademicGroup con RESTRICT; sin borrado en cascada
  de antecedentes. SQL de un módulo accede solo a sus datos, mediante puertos para otros.
- Estados siguientes son representación técnica de reglas aprobadas, no operaciones
  nuevas disponibles al usuario. No cancelación voluntaria de compromisos.

## Entidades nuevas

| Entidad / dueño enrollment | Campos y relaciones mínimos | Integridad prevista |
| --- | --- | --- |
| CoursePrice | courseId, amountMinor, currency=PEN, revision, changedBy, changedAt | Una fila por curso. Sin fila: no definido. Escritura administrativa bajo curso y revisión; detalle reservado no se actualiza. |
| AdmissionSequence | id fijo, nextSequence | Fila creada por migración; contador transaccional, bloqueo hasta COMMIT de admisión. No secuencia de PostgreSQL como sustituto de prioridad durable. |
| DispatchState | id fijo | Coordinadora distinta, sin reloj de negocio ni lease de cupo. Mutex hasta COMMIT de la decisión de la cabeza. |
| ReservationRequest | id, studentId, intentionId, selectionDigest, groupIds canónicos, admittedAt, admissionSequence, actorSessionReference, authVersion, state, decisionCode, decidedAt | UNIQUE(studentId,intentionId), UNIQUE(admissionSequence). Orden derivada de EnrollmentOrder.requestId único, sin FK inversa redundante. Misma selección/intención recupera resultado. No guardar cookie o token. |
| EnrollmentOrder | id, studentId, requestId, currency, totalMinor, state, revision, confirmedAt, expiresAt, expirationProcessedAt nullable | UNIQUE(requestId). RESERVED, ENROLLED o EXPIRED. Inicio/vencimiento inmutables; diferencia exacta 86 400 s. expirationProcessedAt registra materialización, no instante efectivo del vencimiento. Una orden con reservas vigentes por alumno. |
| EnrollmentOrderItem | id, orderId, courseId, groupId, priceMinor, courseName, groupName, periodStart, periodEnd, timeZone, groupStartAt, enrollmentValidUntil, scheduleSnapshot | UNIQUE(orderId,courseId). Un grupo del curso por selección. Detalle, dinero y condiciones originales inmutables. Límites civiles convertidos al confirmar reserva y conservados con el snapshot; matrícula copia su límite original, no lo recalcula tras cambios de tzdata. Relación curso/grupo comprobada bajo locks del dueño oferta. |
| SeatReservation | id, orderItemId, state | UNIQUE(orderItemId). Usa confirmedAt/expiresAt de su orden; no copiar relojes divergentes. CONFIRMED, CONVERTED, EXPIRED. |
| PaymentAttempt | id, orderId, studentId, initiationId, payloadDigest, state, merchantReference, externalIdempotencyKey, providerScope, providerReference nullable, createdAt | UNIQUE(studentId,initiationId), FK compuesta (orderId,studentId). Una iniciación no resuelta por orden, referencia/clave estables antes de red. Replay conserva resultado y nunca despacha otra llamada. |
| ProviderReceipt | id, providerScope, deliveryKey nullable, merchantReferenceHint, providerPaymentIdHint, normalizedEvidenceReference/digest, receivedAt, externalObservedAt nullable, state, processedAt nullable, terminalPaymentId nullable | Entrada/trabajo durable mínimo, no ledger económico. Sin FK provisional a orden que introduzca locks recibo→orden. Deduplicación de entrega solo si D02 acredita ámbito; recepción no es verificación final ni extiende reserva. |
| VerifiedPayment | id, providerScope, providerPaymentId, orderId nullable, amount exacto y escala, currency real, merchantReference, verificationFinishedAt, reconciliationState, normalizedEvidenceReference | UNIQUE(providerScope,providerPaymentId), scope configurado proveedor/comercio/entorno. Solo APPLIED o INCIDENT terminales, confirmados con efectos/auditoría. APPLIED exige asociación/total/PEN exactos; hecho auténtico incompatible conserva valores reales como INCIDENT. Sin cuerpo arbitrario, tarjeta, tokens o secretos. |
| Enrollment | id, orderItemId, studentId, courseId, groupId, paymentId, confirmedAt, originalPeriodStart, originalPeriodEnd, timeZone, scheduleSnapshot, validUntil | UNIQUE(orderItemId). Pago aplicado a una sola orden y matrícula por cada detalle. validUntil es 00:00 del día siguiente a fecha final original, America/Lima convertido a UTC. |
| PaymentIncident | id, orderId nullable, verifiedPaymentId, reason, affectedGroupIds, openedAt | Una incidencia por hecho/motivo, abierta, sin resolución económica. Solo asociación confiable vincula titular/grupos; referencia desconocida no adjudica alumno, usa grupos vacíos y no bloquea oferta arbitraria. Seguimiento administrativo mínimo. |
| IncidentFollowUp | id, incidentId, adminUserId, commandId, recordedAt, content | Append-only; UNIQUE(actor,commandId) en ledger. No modifica compromisos ni resuelve incidencia. Proyección administrativa y resumen del alumno separados. |
| EnrollmentCommand | actorKind, actorReference, commandId, operation, payloadDigest, outcomeCode, resourceReferences, resultingRevision, appliedAt | Clave (actorKind,actorReference,commandId); operación incluida en digest, sin namespace separado. Misma clave y operación diferente: conflicto. No reutilizar AcademicCommand ni duplicar payload privado en resultado. |
| EnrollmentAuditEvent | id, actorKind/reference, operation, targetKind/id, commandId o providerEventId, effectKey nullable, requestId, occurredAt, before/afterRevision, result | Evento mínimo e inmutable; misma transacción que decisión/cambio/resultado. Para expiración, effectKey único (ORDER_EXPIRED,orderId); sin otro ledger del timer ni auditoría por cada sondeo. No fingir targetUserId ni acción GROUP_EDIT. |

PaymentAttempt conserva studentId obtenido de su orden para materializar esa UNIQUE,
comprobado mediante FK compuesta; nunca recibido del cliente como autoridad.
ReservationRequest es su propio ledger de reserva; PaymentAttempt, de iniciación.
EnrollmentCommand registra precio y seguimiento, sin copiar las mismas decisiones
en dos ledgers. La auditoría añade trazabilidad, no otra identidad del comando.

## Estados y transiciones

| Agregado | Transiciones permitidas | Condición / resultado |
| --- | --- | --- |
| Solicitud | ADMITTED → CONFIRMED | Una decisión atómica crea orden, detalles, reservas, resultado y auditoría. |
| Solicitud | ADMITTED → REJECTED | Denegación comprobada de autorización o negocio; sin reservas parciales. Fallo temporal no produce rechazo terminal. |
| Solicitud | CONFIRMED/REJECTED → mismo resultado | Repetición autorizada idéntica, sin nueva secuencia/plazo. Estado no se reactiva al recuperar rol o visibilidad. |
| Orden | RESERVED → ENROLLED | Pago total auténtico, verificado antes de vencer, plaza válida, visibilidad y compatibilidad; todas las reservas se convierten juntas. |
| Orden | RESERVED → EXPIRED | Vencimiento sin pago aplicable; materialización idempotente. Instante efectivo no depende de ejecución del worker. |
| Reserva | CONFIRMED → CONVERTED | Matrícula del detalle confirmada en la misma transacción, sin ocupar segunda plaza. |
| Reserva | CONFIRMED → EXPIRED | No retiene desde expiresAt aunque aún espere materialización. No cancelación ni renovación. |
| Intento | SUBMITTING → PENDING, INITIATION_UNKNOWN o FAILED_NO_CHARGE; recuperación de INITIATION_UNKNOWN/PENDING → PENDING o FAILED_NO_CHARGE | Estados internos. Recuperar por consulta auténtica; FAILED_NO_CHARGE solo ante prueba definitiva de ausencia de movimiento, nunca por timeout/404 aislado. Solo entonces admite otro intento explícito con condiciones originales. No regresiones desde resultado económico terminal. Garantías reales D02 pendientes. |
| Intento conciliado | Estado no resuelto → APPLIED o INCIDENT | Referencia al resultado VerifiedPayment canónico dentro de su misma transacción; no otra autoridad económica. Una respuesta externa tardía no lo rebaja. |
| Recibo técnico | RECEIVED → PROCESSED | Puede sobrevivir rollback financiero sin verificationFinishedAt. Consulta externa fuera de locks; asociación final y referencia terminal en la transacción común. |
| Pago verificado | Creación terminal APPLIED o INCIDENT | Terminar contrastes locales, capturar t y confirmar hecho, resultado, conversión/incidencia y auditoría juntos. Sin estado durable PENDING_RECONCILIATION. Replay conserva asociación/fecha; no reaplica. |
| Matrícula | vigente → finalizada por tiempo | confirmedAt <= t < validUntil. Historial siempre conservado; no estado reactivo al editar grupo. |
| Incidencia | abierta → abierta con seguimiento | Sin cierre económico, devolución, traslado ni matrícula manual. |

Los estados del proveedor no se inventan ni se equiparan a estos resultados internos.
Pago tardío puede coexistir con una orden EXPIRED y una incidencia. Incidencia por
ocultamiento puede coexistir con reservas aún vigentes: no libera antes de las 24 h.
Si la orden ya fue matriculada, otra transacción económica no matricula de nuevo;
se conserva el hecho para conciliación sin inventar devolución.

## Inventario, vigencia y restricciones cruzadas

En un mismo instante autoritativo t:

- Retenciones: reservas CONFIRMED no convertidas, con confirmedAt <= t < expiresAt.
- Ocupación: matrículas con confirmedAt <= t < validUntil original.
- Disponibilidad = capacidad configurada − retenciones − ocupación; nunca negativa.
  No truncar un valor negativo a cero para ocultar corrupción: error seguro y alerta.
- Oferta oculta conserva retenciones/ocupación. Vencidas e historial terminado no
  consumen; una incidencia aislada no crea consumo. Consulta real lleva evaluatedAt
  y una sentencia/instantánea consistente para visibilidad, capacidad y conteos,
  después de esperar locks críticos según P06; no sumar momentos distintos.

Capacidad 1–50 y relación curso/grupo siguen perteneciendo a oferta. El lock de grupo
serializa todos los cambios que afectan la fórmula. Los lectores críticos 003 esperan
cursos/grupos FOR SHARE y órdenes pertinentes bajo orden común, tras actor/sesión;
proyectan en otra sentencia READ COMMITTED con evaluatedAt posterior. Referencias
finales deben estar cubiertas; topología nueva requiere redescubrimiento, no locks
tardíos. Evita disponibilidad transitoria durante conversión que cruza el límite.
No hay contador mutable ni tabla adicional de claims que duplique autoridad.

Una orden activa por alumno: índice único parcial sobre estado RESERVED como defensa,
con normalización de la anterior vencida bajo lock del alumno y de todos sus grupos
antes de crear otra. No usar `WHERE expiresAt > now()` en un índice. La regla efectiva
depende del tiempo, no de que un worker haya corrido. Las órdenes pagadas/históricas
no bloquean nuevos cursos por sí mismas.

Unicidad alumno/curso: comprobar reservas y matrículas vigentes conjuntamente bajo
el mismo lock de cuenta del alumno. Dos UNIQUE separados no resuelven el cruce entre
tablas. Mismo lock protege D06: selección entre sí y contra compromisos propios
vigentes, incluidos ocultos, con fechas/franjas originales y excluyendo vencidos.
Al convertir, excluir las reservas de esa misma orden como falso autoconflicto.

CHECK locales previstos: forma de estados/moneda, revisión positiva, diferencia exacta
de 86 400 segundos entre instantes de reserva (no un día civil), períodos/snapshots
coherentes y campos obligatorios por estado. expirationProcessedAt solo se escribe
en la transición materializada y no cambia expiresAt. Agregados
como suma del total, capacidad y transiciones cruzadas se validan en la transacción;
no prometer que un CHECK entre filas los garantiza. Las pruebas deben intentar violar
también UNIQUE/FK/CHECK reales mediante el rol de pruebas autorizado.

Worker y normalización oportuna usan la misma capacidad, identidad de efecto y token
temporal por unidad de trabajo, conforme a T02/T05 y P05. Recibo técnico pendiente
no es pago final y no extiende plazo. Un pago final no queda durable sin sus efectos;
rollback conserva recibo previo, descarta t y recuperación consulta identidad económica
antes de reejecutar. No se implementa retención de seguridad tras el vencimiento.

## Oferta, habilitación y mantenimiento

- No alterar estados 002. Curso retirado oculta hijos sin reescribir sus estados;
  grupo CANCELLED sigue terminal. Visibilidad requiere docente/revisión/generación
  vigentes; reactivar cuenta no republica.
- Nueva reserva: validar visibilidad, precio, capacidad y corte de inicio al confirmar.
  No aplicar ese corte a pagar una reserva anterior que conserva su plazo original.
- Bloqueantes: reservas vigentes, matrículas vigentes o incidencias sin resolver.
  Impiden período, horarios, capacidad y cancelación. Nombre/descripción/docente
  siguen retiro previo, revisión, validación y republicación explícitas.
- `AcademicGroup.courseId` sigue inmutable incluso sin bloqueantes. No hay ruta de
  traslado. Para la descripción de grupo aprobada se prevé una columna nullable propia
  de oferta y su DTO administrativo; no se edita ni aplica ahora.
- Retiro/pérdida de habilitación no elimina compromiso ni matrícula. Cualquier grupo
  oculto pausa iniciar pago/confirmar matrícula de toda la orden. Pago verificado en
  ese estado: incidencia sin matrícula. Republicación solo permite plazo restante.

## Índices y evolución prevista

Índices: solicitud por estado/secuencia; orden por titular/estado/expiresAt; detalle
por grupo/curso/orden; reserva por detalle/estado; matrícula por titular/curso/validUntil
y grupo/validUntil; pago por orden y clave económica con scope; recibo por
estado/receivedAt/id e intento por estado/createdAt/id y orden; incidencia por grupo/abierta y
orden; auditoría por recurso/instante. No índices dependientes del reloj ni JSON de
credenciales. Medir planes con fixtures antes de ampliar índices.

La próxima migración debe numerarse tras las cinco existentes y crear tablas,
constraints, índices, coordinadoras y extensiones mínimas de oferta. Sin backfill de
reservas, precios cero, matrículas o estados históricos inventados. Conservar todas
las filas actuales y 0001–0005 intactas. Ensayar actualización desde snapshot 0005 y
restauración aislada; permisos de migración separados del runtime. Este documento
no es SQL ni autoriza aplicarlo. [Guía local futura](quickstart.md).
