# Pago, conciliación y recuperación — RP006

**2026-10-30, America/Lima. Diseño sin implementar.** Fuentes: [spec](../spec.md),
[tiempo RP005](time.md), [integración](integration.md) y [modelo](../data-model.md).
Conserva las quince aclaraciones, las 24 horas y los límites RA-04. No acredita
Izipay, sandbox, política económica, cobros reales o capacidad.

## P01 — Corrección explícita del diseño provisional

**Decisión**: separar observación técnica recuperable de verificación final.
ProviderReceipt representa entrada/evidencia pendiente, sin verificationFinishedAt.
VerifiedPayment solo se confirma con resultado terminal APPLIED o INCIDENT y con
sus efectos/auditoría en el mismo COMMIT. No habrá un nuevo pago finalmente verificado
durable PENDING_RECONCILIATION con decisión de cupo aplazada.

**Motivo**: ese estado provisional de RP004/RP005 dejaba una ventana entre fecha
de verificación y conversión, durante la cual vencimiento/reasignación podían competir.
RP006 cierra la brecha sin guardar plazas después del plazo ni backdatear matrículas.
Se actualizan documentos vigentes; informes anteriores y spec permanecen intactos.

**Alternativas descartadas**: una retención de seguridad tras 24 h, devolver una plaza
reasignada, tratar recepción como verificación completa o dejar que un worker decida
después usando una fecha anterior en memoria. Esta es una precisión del diseño
pendiente de RP006, no una regla comercial nueva ni una tolerancia al vencimiento.

## P02 — Tres identidades, sin ledgers duplicados

| Identidad | Autoridad y unicidad |
| --- | --- |
| PaymentAttempt | (studentId,initiationId), digest incluye operación/orden. Referencia mercantil y clave externa estables, emitidas por servidor. Un intento no resuelto por orden. Es su propio registro de iniciación. |
| ProviderReceipt | ID local y, solo si D02 acredita su ámbito, clave de entrega del proveedor. Guarda evidencia mínima/correlación y estado de trabajo, no otro ledger económico. Muchas entregas pueden describir un solo pago. |
| VerifiedPayment | UNIQUE(providerScope,providerPaymentId): transacción económica auténtica y resultado final. providerScope identifica proveedor/comercio/entorno configurados, sin secretos. Es la autoridad de deduplicación económica. |

La identidad del evento de entrega no sustituye la transacción económica. Si el
proveedor no garantiza eventId, no inventarlo como unicidad: la clave económica
evita efectos duplicados. Nunca sobrescribir asociación, importe o moneda de una
transacción ya confirmada por una notificación diferente.

Una repetición idéntica recupera fecha/resultado originales. Mismo identificador
económico con datos incompatibles genera diagnóstico de integridad del recibo,
conservando el hecho original; no reasigna el pago ni filtra otra orden. Otra
transacción económica para una orden matriculada es otro hecho: incidencia, sin
otra matrícula ni devolución automática. Incidencias se deduplican por hecho/motivo.

## P03 — Iniciación recuperable y red fuera de transacción

1. Con sesión/rol/propiedad actuales, adquirir locks comunes y resolver primero
   (studentId,initiationId). Idéntica recupera su resultado aunque después venza
   u oculte la oferta; contenido diferente produce 409. Solo para una identidad
   nueva revalidar reserva, plazo, visibilidad y total original. No imponer el
   corte de nuevas reservas a pagar una anterior. Replay no vuelve a llamar al proveedor.
2. Si existe intento no resuelto de la orden, devolver su estado seguro; una
   initiationId nueva recupera el intento canónico existente: no se presenta como
   otra iniciación aceptada sin registro, ni crea otra operación externa. Si ya se aplicó pago o hay
   incidencia financiera no resuelta de esa orden, no habilitar otro cobro.
3. Persistir PaymentAttempt SUBMITTING, referencia mercantil, clave externa y
   resultado local antes de la llamada. Solo el creador autorizado despacha esa
   operación; un duplicado no vuelve a iniciarla. No mantener conexión/locks durante red.
4. Registrar resultado externo normalizado: PENDING si hay operación conocida,
   INITIATION_UNKNOWN si pudo existir efecto sin respuesta, o FAILED_NO_CHARGE solo
   con rechazo definitivo que acredite ausencia de movimiento. Estados son internos,
   no nombres de estados Izipay. Ninguno confirma matrícula. Actualizar bajo el
   orden común de locks, relectura y transición condicional del intento. Si callback
   o consulta ya confirmó APPLIED/INCIDENT, la respuesta tardía conserva ese resultado
   canónico; PENDING/UNKNOWN/FAILED no lo rebajan ni habilitan otro intento.
5. Si proceso cae con SUBMITTING, recuperar mediante la misma clave/referencia y
   consulta/idempotencia acreditadas por D02. No asumir «no se envió» ni reenviar
   por vencer un lease o reiniciar. Antes de un envío que aún pueda evitarse tras
   demora, revalidar condiciones actuales; ello no cancela la reserva ni reinicia plazo.

Solo un rechazo definitivo sin movimiento permite otro intento explícito dentro
del plazo original y condiciones vigentes. Un timeout, un 404 de consulta aislada
o la ausencia momentánea de respuesta no prueban que una operación en vuelo no
pueda producir efecto después. No sumar pagos parciales, convertir moneda o cobrar
diferencias. Esta protección no bloquea nuevas reservas de otros cursos por conservar
una incidencia antigua: rigen los compromisos vigentes y límites aprobados.

Si la modalidad real no acredita recuperación segura, mantener ese camino bloqueado
en D02, sin inventar una garantía de idempotencia externa. Vencer conserva el intento
y sus antecedentes; un pago auténtico posterior podrá producir incidencia.

## P04 — Recibo durable y verificación completa

La entrada técnica autentica la procedencia y valida forma conforme al adaptador
real; un callback inválido o datos del navegador no crean pago, matrícula ni bloqueo
financiero de un grupo. Persistir recibo normalizado mínimo antes de acuse definitivo
o de dar por recuperable una entrega. No registrar cuerpo arbitrario, PAN, secretos,
firma reutilizable o tokens de acceso; conservar referencias/digest necesarios.

Puede existir un recibo de notificación que solo indique «consultar resultado».
Consulta/autenticación externa se ejecutan sin transacción de negocio abierta. Recibo
o respuesta externa por sí solos no completan los contrastes contra la orden persistida.
receivedAt y externalObservedAt son hechos técnicos, no la referencia temporal RA-03.

La recepción inicial solo escribe su propio recibo, sin adquirir locks de órdenes
después de bloquearlo. Correlación provisional es referencia normalizada, no FK que
obligue a tomar una orden a destiempo. La asociación final se escribe dentro de la
transacción común. Evitar ciclos recibo → orden frente a orden → recibo.

Si no hay evidencia de movimiento confirmado, conservar estado pendiente o resultado
no confirmado; no fabricar pago verificado. Si existe hecho económico auténtico pero
incompatible, conservar importe/moneda/referencia reales sin presentarlo como pago
válido de una orden. Una referencia desconocida queda investigable, sin FK ficticia
ni facultad de asignación manual. Solo una asociación confiable a referencias emitidas
por el servidor vincula alumno, orden y grupos.

## P05 — Transacción final atómica

Procesamiento técnico con capacidad SYSTEM, no sesión del alumno ni administrador
ficticio. Cerrar sesión no invalida una reserva ni un pago auténtico ya iniciado.
Las operaciones interactivas sí exigen sesión/propiedad vigentes.

1. Descubrir orden canónica, titular, docentes, cursos/grupos completos y compromisos
   pertinentes a unicidad/D06, más la identidad económica existente si la hubiera.
2. Mismo orden: cuentas UUID → cursos UUID → grupos UUID → órdenes UUID → intentos
   UUID → recibos UUID → pagos económicos → matrículas/incidencias → auditoría.
   Sesión solo cuando el origen es usuario. Recheck después de locks; topología nueva
   exige rollback/redescubrimiento, sin adquirir recursos tardíos ni otro presupuesto.
3. Recuperar un pago terminal idéntico sin otra aplicación. Si no existe, completar
   verificaciones de autenticidad/procedencia, comercio/entorno, identidad económica,
   correlación de orden y comparación exacta de total/moneda con datos autoritativos.
   Revalidar evidencia local según reglas del adaptador, sin llamada de red bajo locks.
4. Al terminar esas comprobaciones del servidor, capturar una vez t preciso. Este
   es verificationFinishedAt y token de decisión, no la hora de recepción/consulta
   externa, del proveedor, del inicio de transacción o del COMMIT físico.
5. Evaluar con t plazo estricto, estado/validez de reservas y plazas, visibilidad
   completa, revisión/habilitación, unicidad y compatibilidad D06. No contar las
   reservas de la propia orden como autoconflicto. Precios/períodos/franjas originales
   se conservan; sustituir docente no los cambia.
6. APPLIED: persistir VerifiedPayment y convertir todas las reservas, crear una
   matrícula por detalle, ordenar ENROLLED, revisión/resultado y auditoría juntos.
   No se consume otra plaza por convertir ni se confirma parte del conjunto.
7. INCIDENT: persistir hecho económico/resultado/incidencia/auditoría, sin matrícula.
   La incidencia no libera reservas antes del plazo; cuando corresponde vencimiento,
   materializarlo en la misma unidad usando el normalizador T05 y su mismo token.
   Conservar reserva, orden, precio y hechos originales; sin reembolso o traslado.

APPLIED exige asociación exacta, total/PEN y todas las condiciones. Hecho económico
auténtico con monto/moneda incompatibles produce INCIDENT y conserva valores reales;
no pasa por una constraint que obligue a falsificarlos como PEN. Si la referencia no
corresponde a una orden confiable, la incidencia no tiene titular/grupos adjudicados:
solo administración consulta el seguimiento mínimo, sin datos al alumno por una
referencia inventada ni bloqueo de grupos arbitrarios.

VerifiedPayment se confirma solo APPLIED o INCIDENT, nunca con su fecha final y
efectos pendientes. Si algo aborta, la fecha tentativa y todos esos efectos se
revierten; el recibo previo permanece para reintentar verificación completa. No
conservar una hora previa en memoria para vencer artificialmente la carrera.

Ante conflicto de unicidad económica concurrente, preservar el resultado canónico.
Si su orden/topología no estaba descubierta, abortar y redescubrir con el presupuesto
común antes de tocar recursos distintos. No reintentar cualquier 23505 como fallo
genérico ni sobrescribir otra orden para «resolver» la duplicación.

## P06 — Vencimiento, reasignación y lectores

| Intercalado | Resultado determinista |
| --- | --- |
| Verificación final termina antes de expiresAt con todas las condiciones | APPLIED conjunto. Worker/nueva asignación esperan los locks y observan conversión confirmada. |
| Prueba externa llega antes, pero comprobaciones finales terminan al vencer/después | INCIDENT sin matrícula; no backdatear a recepción. |
| Expiración/reasignación confirma primero | La verificación final posterior no recupera ni revive la plaza; INCIDENT si hay hecho económico. |
| Solo recibo técnico pendiente al vencer | No extiende reserva. Vencer no borra el recibo; su finalización posterior compara su propio t. |
| Cualquier grupo oculto cuando se verifica finalmente | INCIDENT de la orden completa. Mantener plazo original; republicar no resuelve el hecho terminal. |
| Conversión confirma y luego se retira/deshabilita | Matrículas conservan vigencia/historial; no revocación automática. |
| Cancelación válida antes de pago tardío | INCIDENT posterior; cancelación terminal conservada. Si incidencia confirma primero, guard bloquea cancelar. |
| Misma transacción notificada otra vez | Resultado/fecha originales, sin auditoría de aplicación, matrícula o incidencia duplicadas. |
| Otro pago económico para orden ya ENROLLED | Incidencia del hecho adicional, sin otra matrícula ni devolución automática. |

No comparar solo escritores. Una conversión puede capturar t anterior al límite y
confirmar después: un GET sin esperar vería la reserva vieja vencida y todavía no
la matrícula. Por ello las lecturas críticas 003 de inventario/preview y estado
financiero coordinan con los escritores:

- Cuenta del actor y sesión con revalidación existente primero; cursos y grupos
  FOR SHARE en UUID ordenado y filas de órdenes pertinentes después. No upgrades de
  esos locks ni mutaciones/normalización desde ese lector. No tomar coordinadoras.
- No bloquear cuentas docentes o de todos los alumnos para contar: la visibilidad
  de terceros se obtiene de la proyección consistente. El actor sí mantiene su
  autorización, sin debilitar el revalidador actual que bloquea su cuenta/sesión.
- Tras esperar locks/recheck, **otra sentencia READ COMMITTED** captura evaluatedAt
  y proyecta datos/conteos desde una instantánea consistente. No CTE que mezcle espera
  y cálculo con snapshot anterior, ni evaluatedAt tomado antes de esperar.
- La página/conjunto final solo entrega referencias cubiertas por sus locks. Si
  aparecen referencias nuevas al calcular página/topología, abortar/redescubrir con
  el mismo presupuesto; no bloquearlas fuera de orden ni devolver sus cifras sin cubrir.

Así un lector espera la conversión pendiente y después observa su resultado o rollback.
La consulta sigue sin prometer una plaza futura, dar prioridad o congelar precio.
Un timeout produce indisponibilidad segura, no disponibilidad cero, previa o ficticia.
No cambiar consultas históricas 002 para atribuirles esta proyección. El coste de
locks/esperas del lector requiere medición D10; no es aceptación de 2500 activos.

## P07 — Recuperación, proveedor y operación

Mismo accountTransaction, presupuesto único y tratamiento de 55P03 de RP005. Rollback
revierte recibo final/resultado/negocio/auditoría juntos; COMMIT ambiguo exige consultar
clave económica y resultado antes de reejecutar. Si ya es terminal, conservar fecha
original. Si solo hay recibo, la verificación completa sigue pendiente y usará su
nuevo punto real de finalización. No iniciar otro cobro para recuperarla.

Trabajo técnico pendiente se reconstruye desde recibos e intentos persistidos, sin
reloj/cola en memoria como fuente de verdad, ni lease que autorice otro pago. Un
worker puede consultar evidencia fuera de transacción y luego invocar la misma
conciliación SYSTEM que usa la entrada técnica. Conservar fairness/horizonte finito
de T06, usando claves propias estables: (receivedAt,id) para recibos y (createdAt,id)
para intentos. Fijar máximo elegible al comenzar cada barrido; avanzar por examinada
aunque falle y reiniciar al agotar horizonte. No copiar expiresAt de órdenes ni usar
una fecha mutable de reintento como cursor. Ningún orden de sondeo promete prioridad
comercial de pago o cambia RA-02.

Puerto PaymentGateway separa iniciar con clave estable, consultar operación incierta
y obtener evidencia auténtica normalizada. D02 debe acreditar sus capacidades reales:
modalidad, ámbito de IDs, autenticidad, referencias, dinero exacto, estados finales,
idempotencia/consulta de inciertos, notificaciones/reintentos, recuperación y sandbox.
No elegir SDK, URL, HMAC, formato de callback o garantías Izipay sin esa evidencia.

El callback futuro requiere excepción estrecha del transporte basada en autenticidad
real; no desactivar Origin/CSRF globalmente. Tamaño/formato/acuse y tratamiento de
reintentos deben verificarse con la modalidad contratada antes de habilitar ruta.
Simulador solo en fixtures test, inaccesible en producción; carga con pagos simulados
y sandbox separado, sin someter pasarela a k6.

Seguimiento administrativo no cierra economía, asigna plazas, confirma pagos o
desbloquea cancelación. D05/RA-04 exige política/procedimiento aprobados antes de cobros
reales incluso con sandbox correcto. D10/D13, bootstrap y pendientes humanos conservan
sus puertas. [Matriz financiera futura](../payment-verification.md) no acredita ejecución.

## Fuentes primarias

Consulta técnica del 2026-10-30, diseño aplicado al código local:

- [READ COMMITTED PostgreSQL 16](https://www.postgresql.org/docs/16/transaction-iso.html).
- [Locks PostgreSQL 16](https://www.postgresql.org/docs/16/explicit-locking.html).
- [Relojes PostgreSQL 16](https://www.postgresql.org/docs/16/functions-datetime.html).
- [Transacción en un mismo cliente node-postgres](https://node-postgres.com/features/transactions).

Las fuentes justifican mecanismos, no prueban el protocolo implementado ni aportan
contrato del proveedor. Las decisiones P01–P07 no cambian las reglas aprobadas.
