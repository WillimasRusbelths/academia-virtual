# Contrato temporal y normalización — RP005

**2026-10-30, America/Lima. Diseño sin implementar.** Fuentes: [spec](../spec.md),
[modelo](../data-model.md), [integración](integration.md). RP005 precisa el plazo,
la autoridad del reloj, recuperación y ejecución diferida. [RP006](payments.md)
completa conciliación sin cancelación, extensión o confirmación manual.

## T01 — Representación exacta

**Decisión**: instantes financieros nuevos en PostgreSQL `timestamptz(6)`; dominio
con `InstantUs` representado por bigint de microsegundos desde epoch. El dominio
recibe el instante como dato; no importa pg, Nest, Prisma ni lee Date.now().

Transporte UTC canónico con seis fracciones y sufijo Z. Años 0001–9999 con cuatro
cifras; límites derivados posteriores admiten año ISO ampliado, por ejemplo
`+010000-01-01T05:00:00.000000Z`. No comparar esas cadenas lexicográficamente.
El JSON no contiene bigint nativo: serializar cadena exacta, sin convertir a number.

El adaptador obtiene tiempos decisorios mediante proyección explícita de texto UTC
o epoch numérico exacto convertido a texto y después BigInt. Nunca pasa antes por el
parser de pg a Date ni por Date/toISOString de JavaScript, que perderían microsegundos.
No modificar parsers globales ni tipos/migraciones de identidad/oferta. La captura,
persistencia, comparación y serialización de 003 conservan la misma precisión.
Parser/formatter manejan epoch negativo y resto fraccionario no negativo, no solo
instantes posteriores a 1970. No usar división truncada hacia cero como si fuera
piso para descomponer negativos. Rechazar infinitos, valores no finitos y más de
seis decimales sin redondearlos silenciosamente; las entradas civiles mantienen su rango.

**Motivo**: evita clasificar como igualdad dos hechos separados por un microsegundo.
**Alternativas descartadas**: flotantes, truncamiento implícito a milisegundos o
mezcla de seis decimales en BD con tres en decisiones. No se añade librería temporal.

## T02 — Un instante definitivo después de locks

**Decisión**: la unidad de trabajo captura `clock_timestamp()` una sola vez después
de todos los locks de decisión y del recheck, inmediatamente antes de validar el
conjunto. El adaptador ofrece un token temporal inmutable ligado a esa transacción;
aplicación/dominio no pueden recibir ese token desde una petición HTTP.

Con ese mismo t se evalúan: corte de nuevas reservas, vigencias, duplicados por curso,
compatibilidad de compromisos vigentes e inventario. Para reserva nueva,
`confirmedAt=t` y `expiresAtUs=confirmedAtUs+86_400_000_000n`.
No obtener varias horas ligeramente distintas dentro de una decisión conjunta.
Si se descubre otra referencia que requiere lock, abortar/redescubrir, no adquirirla
después de capturar t o aprovechar un instante anterior a la espera.

confirmedAt es el punto lógico de decisión que se confirma con la transacción, no
una medición física de COMMIT ni de llegada del paquete. Solo comunicar CONFIRMED
tras COMMIT. Si hay rollback, no existió reserva confirmada y otro intento toma
un t nuevo. Si COMMIT es incierto, consultar intención/orden persistidas antes de
reintentar; un resultado ya confirmado conserva los instantes originales.

**Motivo**: CURRENT_TIMESTAMP/now() representan inicio de transacción; también
statement_timestamp puede preceder la espera en locks. Usarlos permitiría decidir
con tiempo anterior al corte real del punto de decisión.
**Alternativas descartadas**: reloj del cliente, de sesión, admisión, sondeo del
worker, fecha del proveedor o inicio de petición como origen de las 24 horas.

## T03 — Duración e intervalos civiles

| Concepto | Regla exacta |
| --- | --- |
| Duración de reserva | expiresAtUs − confirmedAtUs = 86_400_000_000n. Sumar segundos fijos, no un día civil. |
| Reserva vigente | Estado CONFIRMED no convertido/terminal y confirmedAt <= t < expiresAt. |
| Reserva vencida | t >= expiresAt, sin pago aplicado que la haya convertido. El worker no decide cuándo empieza ese vencimiento. |
| Nueva reserva admisible temporalmente | t < medianoche de periodStart en America/Lima. Igualdad rechaza; consulta/admisión anterior no cambia el corte. |
| Pago admisible temporalmente | verificationFinishedAt < expiresAt. Igualdad o posterior: incidencia RA-04 sin matrícula. Aplicabilidad completa según P05 de RP006. |
| Matrícula vigente | confirmedAt <= t < originalValidUntil, calculado a partir de fecha final original. |

Para inicio, convertir la fecha civil a medianoche con la zona explícita America/Lima.
Para fin de matrícula, sumar un día a la **fecha civil final original** y convertir
esa medianoche regional a UTC. No usar offset -05 fijo para todo el rango histórico,
zona del proceso ni `new Date('YYYY-MM-DD')`. Conversión en el adaptador PostgreSQL
con `AT TIME ZONE`, sin depender de TimeZone por defecto de la conexión.

Se conserva el rango civil 0001–9999 de 002; 9999-12-31 requiere representar el
límite exclusivo derivado del año 10000, sin saturar a 9999, infinito o fecha inválida.
Registrar versión PostgreSQL/tzdata en evidencia futura. Las reglas históricas IANA
pueden tener transiciones; se usa la resolución documentada del motor para esa zona,
sin inventar un offset constante. Se persisten los límites calculados originales:
actualizar tzdata o editar/republicar el grupo no recalcula el historial. Al confirmar
reserva se conservan groupStartAt y enrollmentValidUntil en su detalle; la matrícula
copia el límite original, sin reconvertir la fecha con otra versión de tzdata.

Una reserva anterior al corte conserva sus 24 horas aunque empiece el período.
Pagar esa reserva no exige que siga siendo anterior al inicio: exige plazo restante,
oferta visible y demás condiciones aprobadas. Ninguna republicación reinicia el reloj.

## T04 — Lecturas y estados efectivos

**Decisión**: cada consulta/preview usa una instantánea consistente y un solo
evaluatedAt. Capacidad, retenciones, matrículas y disponibilidad se evalúan con él;
no combinar conteos de sentencias READ COMMITTED de momentos distintos.
P06 añade coordinación necesaria: actor/sesión primero, cursos/grupos FOR SHARE
ordenados y órdenes pertinentes; después, otra sentencia READ COMMITTED captura
evaluatedAt/proyección. Nada de upgrades, locks tardíos o normalización desde GET.
Si referencias finales quedan fuera de la topología cubierta, redescubrir. Así no
se muestra un cupo transitorio al cruzar expiresAt mientras conversión espera COMMIT.

Una orden aún RESERVED en almacenamiento puede presentarse vencida según su plazo
efectivo, sin afirmar que el worker ya materializó el cambio. No exponer detalles
internos de procesamiento como una obligación del alumno. Una incidencia se muestra
separadamente y no convierte el plazo en vigente otra vez. Con anomalía de reloj o
resultado de pago aún no resoluble, no fabricar disponibilidad o matrícula confirmada.

La UI conserva el instante completo. Puede redondear solo para presentar una cuenta
atrás orientativa; ni un cero visual ni el reloj local autorizan pago o vencimiento.
Actualizar la consulta del servidor para conocer el resultado. No añadir gracia de
un microsegundo, milisegundo, segundo o ciclo del scheduler.

## T05 — Normalización transaccional compartida

**Decisión**: una capacidad interna normaliza una orden completa; la usan tanto el
worker como la normalización oportuna antes de una nueva reserva. Sin implementar
dos algoritmos, decrementar contadores o crear comandos distintos por cada tick.

Secuencia de normalización:

1. Seleccionar referencia candidata sin bloquear anticipadamente una fila financiera.
   Descubrir alumno, docentes pertinentes, todos los cursos/grupos de la orden y
   referencias de conciliación necesarias. Redescubrir dentro de cada intento.
2. Cuentas UUID → sesión si es operación de usuario → cursos UUID → grupos UUID →
   filas financieras en el orden común. Worker usa capacidad SYSTEM de composición,
   sin sesión administrativa ficticia ni SYSTEM aceptado del navegador.
3. Releer/recheck después de locks. Capturar t definitivo; comprobar estados actuales
   y resultado financiero confirmado. RP006 no deja un pago final pendiente de
   aplicar: recibo técnico pendiente no extiende plazo; una conversión en vuelo
   comparte locks, y su resultado se relee después de esperar.
4. Si corresponde vencimiento sin pago aplicable y t >= expiresAt, cambiar orden y
   todas sus reservas juntas a EXPIRED, incrementar revisión una vez y guardar
   expirationProcessedAt=t. El instante efectivo sigue siendo expiresAt, inmutable.
5. Confirmar transición/resultado estable/auditoría juntos. Si falla escritura o
   auditoría, rollback sin cambio parcial. ALREADY_TERMINAL o NOT_DUE no generan
   otra transición/auditoría de vencimiento ni consumen/liberan otra plaza.

Identidad única del efecto: (ORDER_EXPIRED,orderId) en auditoría de enrollment.
Persistirla como clave de efecto única; no otro ledger del timer. La revisión/estado
condicionados y esa identidad protegen repetición. Orden ENROLLED no se expira;
reservas EXPIRED/CONVERTED nunca vuelven a CONFIRMED. No borrar hechos de pago o incidencias.

Antes de otra orden, normalizar la anterior vencida bajo el lock del alumno y **todos
sus grupos**, aunque no estén en la selección nueva. Así un UNIQUE parcial sobre
RESERVED no impone esperar al worker. La normalización oportuna y la nueva reserva
reciben el MISMO token t capturado tras bloquear la unión de referencias anteriores
y nuevas: el normalizador no obtiene otro reloj dentro de esa transacción.
Una unidad de trabajo independiente del worker sí captura su propio token.
Revalidar la nueva selección con ese mismo t definitivo;
misma intención antigua recupera su resultado, no se transforma en una reserva nueva.

## T06 — Worker reanudable y fallos

**Decisión**: ciclo de vida en el mismo proceso/pool, patrón single-flight ya usado
en correo: ejecución al arranque, sondeo periódico, parada del timer y espera del
trabajo activo antes de cerrar pool. Fuente de trabajo durable: órdenes RESERVED
y expiresAt. Sin timer por alumno, broker, Redis, lease o cola de expiración duplicada.

Parámetros iniciales de diseño: sondeo cada 5 s, lote de hasta 20 candidatas y una
normalización simultánea por proceso. Son límites técnicos medibles, no cuotas
comerciales, plazo extra o rendimiento aceptado. Cada orden es una transacción;
no mantener todo el lote en una sola transacción ni conexión mientras se espera.

El sondeo solo descubre candidatas; su hora no autoriza transición. Cada barrido fija
un horizonte superior efímero (máximo par expiresAt,id elegible al comenzarlo).
Paginar hasta ese horizonte por (expiresAt,id), avanzando cursor por la última
candidata examinada, aunque falle. Al alcanzar el horizonte o agotar ese rango,
volver al inicio y tomar horizonte nuevo. Así la entrada continua no impide revisar
de nuevo las fallidas de un barrido finito. Cursor/horizonte solo organizan trabajo,
no son autoridad temporal ni prioridad ni una cola durable; perderlos al reiniciar
vuelve a descubrir datos. No son un watermark de reloj o una ampliación de plazo.
Continuar con las demás candidatas tras un fallo aislado; nueva ejecución vuelve a
considerar las pendientes. No saltar la cabeza del **despacho RA-02** por esta política
de mantenimiento, que no asigna plazas ni cambia prioridad de admisión.
Continuar solo ante fallos aislados. Configuración/destino inválidos o anomalía que
invalida la autoridad del reloj detienen el ciclo; no seguir decidiendo con ella.

Presupuesto transaccional único de accountTransaction: hasta tres intentos solo para
40001, 40P01 o cambio de topología marcado como aborto, después de rollback confirmado.
El lock_timeout existente es 3 s. 55P03 por timeout no es reintentable dentro del helper:
registrar fallo seguro y redescubrir en un ciclo posterior. No bucles anidados 3×3.

Caída antes de COMMIT: reconstruir desde órdenes pendientes, sin nuevo plazo. Después
de COMMIT: resultado estable. COMMIT ambiguo: no repetir ciegamente en ese ciclo;
consultar estado/identidad persistida en recuperación posterior antes de normalizar.
Errores de conexión/configuración no son decisiones de vencimiento ni rechazo terminal.
Registrar códigos cerrados, SYSTEM y referencias necesarias; no secretos, URL de BD,
sesiones, callbacks o cuerpo de pago. No reutilizar identidad financiera ficticia de correo.

## T07 — Salud del reloj y frontera RP006

clock_timestamp es reloj de pared, no reloj monotónico persistente. Requisito operativo:
reloj PostgreSQL sincronizado y comprobado en arranque/operación; documentar su salud
en D13. El reloj monotónico del proceso sirve a timers/telemetría, no a vencer reservas.

Ante retroceso incompatible detectado frente a observaciones de la instancia o hechos
persistidos, suspender decisiones temporales con error seguro hasta comprobar salud;
no mover expiresAt, usar max(now,deadline), inventar gracia o reactivar terminales.
Comprobar referencias temporales conocidas al arrancar. No añadir un reloj lógico
global o watermark que oculte el fallo y se presente como tiempo real.

**Límite explícito**: un estado terminal durable evita su reactivación, pero no detecta
por sí solo todo retroceso arbitrario que ocurra antes de materializar el vencimiento.
El diseño no demuestra 24 horas físicas bajo pérdida de autoridad del reloj ni
detección completa entre reinicios. Esa condición impide certificar la operación;
requiere control/evidencia D13, sin cambiar duración o condiciones de negocio.

| Hecho de pago al normalizar | Resultado / dependencia |
| --- | --- |
| Ningún pago verificado; solo intento iniciado/pendiente | No extiende plazo. Vencimiento cuando corresponde, conservando intento/antecedentes. |
| Pago ya aplicado, orden ENROLLED | No expirar ni revocar matrícula. |
| Pago clasificado como incidencia | No extiende reserva. Vencer retención cuando corresponda conserva incidencia abierta y bloqueo académico. |
| Solo ProviderReceipt RECEIVED, aún sin verificación final | No es VerifiedPayment pendiente ni extiende plazo. Expirar cuando corresponde; finalización posterior usa su propio t y no revive una plaza reasignada. |

P01–P07 cierran por diseño la dependencia provisional de RP005: recibo durable separado,
verificación final y efectos/auditoría atómicos, deduplicación y lectores coordinados.
No hay retención de seguridad después de las 24 horas ni precedencia por recepción.
[PV01–PV30](../payment-verification.md) incluyen carreras; RV001/RP007 e implementación
y ejecución reales siguen pendientes. No atribuir resultados a esta corrección.

## Fuentes y verificación futura

Fuentes primarias consultadas el 2026-10-30:

- [Funciones temporales PostgreSQL 16](https://www.postgresql.org/docs/16/functions-datetime.html).
- [Precisión y tipos temporales PostgreSQL 16](https://www.postgresql.org/docs/16/datatype-datetime.html).
- [Tipos node-postgres y pérdida de microsegundos con Date](https://node-postgres.com/features/types).
- [Resolución temporal ambigua PostgreSQL 16](https://www.postgresql.org/docs/16/datetime-invalid-input.html).

Las decisiones T01–T07 son diseño aplicado a fuentes y código, no resultados de
producto. [Matriz temporal](../temporal-verification.md) conserva casos pendientes
UNIT/PG/HTTP/E2E; no sustituye RV001, sandbox, observación humana o capacidad.
