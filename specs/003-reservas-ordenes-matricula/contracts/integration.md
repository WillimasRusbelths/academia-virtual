# Contrato de integración y transacciones — RP004/RP005/RP006

Diseño, no interfaces implementadas. [Reglas](../spec.md), [modelo](../data-model.md),
[decisiones técnicas](../research-rp004.md). Dominio/aplicación/public sin Nest,
Prisma, pg ni imports de infraestructura. Entre módulos, solo superficies public.
RP005 concreta [autoridad/precisión temporal y normalización](time.md);
RP006 cierra por diseño [pago/vencimiento y recuperación](payments.md), sin ejecución.

## Dueños y capacidades

| Capacidad prevista | Dueño / consumidor | Contenido y límite |
| --- | --- | --- |
| ReservationOfferingAccess | academic-offering/public/reservation-boundary.ts → enrollment | Descubrir padres/docentes y obtener snapshots autoritativos después de locks: IDs/revisiones, visibilidad, período/franjas, capacidad y generación/revisión docente. No email, credencial o motivo privado. |
| EffectiveSchedule | academic-offering/public/schedule.ts → enrollment | Exponer el predicado puro de coincidencias efectivas existente, sin copiarlo ni importar dominio ajeno. No decide permisos, precios o vigencia de compromisos. |
| GroupCommitmentPolicy | enrollment/public/commitments.ts → oferta | Comprobar presencia de reservas/matrículas vigentes e incidencias abiertas para operación/campos concretos. Lectura bajo los mismos locks y reloj de la unidad de trabajo; no inicia transacción propia. |
| EnrollmentStore / ReservationCoordinator | aplicación enrollment → adaptadores propios | Confirmar selección/orden/reservas, consultar estados, registrar resultados/auditoría y ejecutar decisiones atómicas. No devolver conexión a la aplicación. |
| PaymentGateway | enrollment/public/payments.ts → aplicación/adaptador | Iniciar con clave estable, consultar inciertos y obtener evidencia auténtica normalizada. Red fuera de transacción; recibo técnico separado del resultado final. D02 acredita garantías reales, sin éxito del navegador o simulador de producción. |
| Acceso actual | authorization/public/session.ts + users/public/account.ts | SessionActor/Permission/tipos existentes; ampliar permisos según matriz del API. Revalidación dentro de transacción se ensambla en composición, sin ampliar SessionRepository con PoolClient. |
| TemporalDecision / ExpirationNormalizer | aplicación enrollment → adaptador de la misma unidad de trabajo | Token exacto en microsegundos capturado después de todos los locks/recheck. Normalización oportuna recibe el mismo token de la nueva selección; worker independiente obtiene otro en su propia transacción. No reloj cliente, parser global o nueva transacción anidada. |

AppModule e infraestructura de coordinación construyen participantes de cada módulo
ligados al mismo PoolClient. Los callbacks reciben solo capacidades puras, efímeras
y no reutilizables fuera del callback. Solo infraestructura hace BEGIN/COMMIT.
Enrollment no importa OfferingStore ni session-store. Oferta no consulta tablas
financieras directamente: recibe el guard público con implementación ligada al cliente.
Ningún participante abre otra transacción o llama por HTTP al propio monolito.

Recepción de ProviderReceipt solo escribe su evidencia técnica mínima sin FK/lock
provisional de orden; evita invertir el orden financiero. El finalizador SYSTEM
completa contrastes locales y confirma pago terminal/efectos/auditoría juntos.
PaymentAttempt no repite cobro ante un incierto ni regresa a pendiente por respuesta
tardía. Cada capacidad mantiene su propia responsabilidad, sin ledger duplicado.

## Orden global y presupuesto

Familias de escritura y lectura crítica con `accountTransaction` y un solo
presupuesto de hasta tres intentos para abortos conocidos tras rollback confirmado:

1. Admisión: AdmissionSequence → cuenta alumno → sesión → solicitud/intención.
   No solicita DispatchState, cursos, grupos o filas financieras de órdenes.
2. Despacho: DispatchState → descubrir → cuentas UUID ordenadas (alumno y docentes)
   → sesión → cursos UUID → grupos UUID → órdenes/detalles/solicitud → resultado/auditoría.
3. Escritura de oferta, precio, conciliación o seguimiento: descubrir → cuentas UUID
   → sesión cuando es usuario → cursos UUID → grupos UUID → filas financieras
   en orden: órdenes UUID → intentos UUID → recibos UUID → pagos económicos →
   matrículas/incidencias → auditoría. Nunca solicita las coordinadoras.
4. Lectura crítica 003: cuenta actor/sesión primero, cursos/grupos FOR SHARE UUID y
   órdenes pertinentes después. No bloquear todas las cuentas de terceros, upgrades,
   coordinadoras o mutaciones. Recheck y proyección/evaluatedAt en otra sentencia
   READ COMMITTED; referencias finales solo dentro de topología cubierta (P06).

Despacho nunca toma AdmissionSequence; admisión nunca toma DispatchState. No existe
adquisición inversa desde un escritor existente. Mantener locks ya requeridos por
identidad/oferta, incluido el docente anterior/nuevo cuando se sustituye. Descubrir
también la orden anterior del alumno, sus grupos y compromisos pertinentes a D06;
no adquirir cuentas/grupos nuevos después del recheck. Cambio de topología exige
rollback y redescubrimiento, sin bucle de reintentos adicional.

Releer autorización, estados, versiones y conflictos después de locks en sentencias
separadas; no confiar en el snapshot de descubrimiento ni en una CTE de lock+lectura.
Se conserva READ COMMITTED y lock_timeout existente. Reintentar indisponibilidad de
conexión o un COMMIT ambiguo a ciegas está prohibido. Consultar intención/resultado
persistidos antes de resolver una respuesta incierta.

## Admisión y despacho RA-02

La entrada valida autenticación, rol y forma de selección antes de admitir. Dentro
de admisión reautoriza y comprueba (alumno,intentionId): idéntica recupera lo existente;
distinta selección con la misma intención genera conflicto. Nueva solicitud recibe
el contador bajo lock y lo confirma junto con su estado ADMITTED. El orden durable
es el de esa admisión válida, no de llegada TCP, clic, login o reloj del alumno.

Admisión no conserva precio ni elegibilidad y no consume plazas. Validez de forma y
permiso de entrada no sustituyen las condiciones de negocio al confirmar. El DTO de
espera no publica posición, número de competidores, sesión ni estado de otros alumnos.

El despachador toma la menor admissionSequence ADMITTED con su mutex mantenido hasta
COMMIT. Nunca salta una cabeza bloqueada mediante SKIP LOCKED ni asigna otro ticket
al reintentar. No mantiene conexión por alumno en espera. Dos procesos pueden competir
por el mutex; solo uno decide, por lo que un reinicio no cambia la prioridad.

Reautoriza sesión/cuenta/permiso vigentes de la intención. Revocación comprobada:
REJECTED sin reservar. Error de conexión o autorización indisponible: rollback, sigue
ADMITTED. Recuperar acceso no reactiva una intención terminal. Una denegación de
negocio se confirma como resultado terminal con auditoría y sin cambios de inventario;
no lanzar una excepción que revierta también ese resultado. Primero validar el conjunto,
después escribir sus compromisos; un fallo de escritura/auditoría revierte todo.

Una caída antes de COMMIT deja la cabeza pendiente; después de COMMIT, su resultado
es recuperable. Misma intención conserva secuencia/resultado originales incluso si
la reserva ya venció. Otra intención tras vencer se evalúa con prioridad/condiciones
actuales, sin sanción o espera adicional por abandono. La espera normal de admisión
no es una penalización por abandono ni inicia las 24 horas.

## Confirmación atómica de selección

1. Descubrir toda la topología, incluida normalización de reservas vencidas anteriores,
   y adquirir locks conforme al orden. Reautorizar; recheck; recuperar resultado si existe.
2. Obtener snapshots de oferta y precios por participantes ligados a la misma conexión.
   Validar publicación/visibilidad y habilitación/revisión actual; preparar límites
   civiles e inventario para evaluarlos con el instante definitivo del paso 4.
3. Comprobar una orden vigente por alumno, un grupo por curso, ausencia de reserva o
   matrícula vigente del curso y compatibilidad efectiva. Incluir compromisos ocultos;
   excluir vencidos/finalizados. No confundir período común con ocurrencia compartida.
4. Con un mismo instante autoritativo definitivo confirmedAt, comprobar corte estricto
   anterior a las 00:00 de fecha inicial America/Lima, vigencias y todos los cupos;
   revalidar los predicados temporales calculados antes y confirmar
   orden, detalles con precios/condiciones originales, reservas, solicitud y auditoría.
   Plazo exacto 86 400 s desde ese instante persistido, nunca desde admisión o respuesta.
5. Solo el resultado confirmado habilita mostrar reserva. Rollback deja cero órdenes
   o reservas parciales y conserva la solicitud para decisión/reintento correcto.

No contador separado de ocupación. El lock de cada grupo protege el cálculo real;
el lock del alumno protege unicidad cruzada y D06. Normalizar una orden vencida antes
de insertar otra si se usa índice único parcial sobre estado materializado.

## Integración con cambios de oferta e identidad

El guard se ejecuta en el escritor real después de locks, antes de mutar. Con reservas
vigentes, matrículas vigentes o incidencias abiertas, bloquear período, franjas,
capacidad y cancelación. Nombre/descripción/asignación docente siguen 002. La relación
curso/grupo permanece inmutable por 0005, incluso sin compromisos. No crear traslado.

Retiro puede ocultar oferta con compromisos: no libera reservas, no cancela matrícula
y no pausa el plazo. Grupo oculto impide iniciar pago y confirmar todas las matrículas
de la orden. Pago verificado en ese estado: incidencia. Restaurar habilitación no
restaura generación publicada; revisión/publicación explícitas permiten plazo restante,
sin renovar ni resolver una incidencia ya abierta. Preservar PA-01–PA-05/E1.

La cuenta docente es autoridad común con cambios de rol/estado. Si deshabilitación
confirma primero, reserva falla; si reserva confirma primero, sus compromisos persisten
y el ocultamiento afecta pagos posteriores. Curso/grupo son autoridad común con retiro,
edición y cancelación. Los locks no sustituyen la relectura del guard.

Solo historial finalizado no bloquea editar/cancelar, pero nunca se reescriben las fechas,
franjas o condiciones originales de una matrícula. Oferta no amplía períodos de alumnos
anteriores al republicar ni revierte una cancelación terminal.

## Pago, vencimiento y recuperación RP006

[P01–P07](payments.md) sustituyen el estado provisional VerifiedPayment pendiente
por ProviderReceipt técnico durable y pago final APPLIED/INCIDENT atómico con sus
efectos/auditoría. Consulta/autenticación externa quedan fuera de locks; completar
contrastes locales bajo el orden común y capturar verificationFinishedAt al terminarlos.
Esa fecha, estrictamente anterior a expiresAt, no se sustituye por receivedAt o
fecha externa. CONVERTED/ENROLLED no consumen una segunda plaza; conjunto sin parcialidad.

Pago auténtico incompatible conserva hecho/importe/moneda reales como incidencia,
sin matrícula, devolución o asignación manual. Referencia desconocida no adjudica
alumno/grupos ni bloquea oferta arbitraria. Duplicados económicos con scope confiable
conservan resultado original; el conflicto concurrente exige redescubrir topología,
sin locks tardíos ni nuevo presupuesto. COMMIT incierto consulta resultado canónico.

La iniciación persiste intento/clave antes de red; respuesta perdida o SUBMITTING
requieren recuperación acreditada, sin otra llamada ciega ni otro cobro. Replay
reautoriza y recupera antes de condiciones mutables. Respuesta de iniciación tardía
actualiza condicionalmente: nunca rebaja un pago terminal. D02 permanece puerta real.

Una expiración o reasignación confirmada antes del finalizador no se revierte.
Solo recibo pendiente al vencer no retiene después de las 24 h. Cancelación válida
primero conserva terminalidad ante pago tardío; incidencia primero bloquea cancelar.
Lectores críticos esperan locks y proyectan después, para no publicar disponibilidad
transitoria durante conversión que cruza el límite. El coste exige medición D10.

[TV01–TV25](../temporal-verification.md) y [PV01–PV30](../payment-verification.md)
son diseño de pruebas futuras. RV001/RP007, sandbox real, política económica y operación
permanecen pendientes; no hay protocolo implementado o aprobado por enumerar invariantes.

## Interfaces y regresión previstas

Ampliar composición, permisos, escritores de oferta/guard, puertos públicos y lector
de calendario. Nueva proyección reservable propia: no cambiar silenciosamente DTO
002 con NOT_CALCULATED. Cambios de transacciones requieren regresión real de identidad,
generación docente, publicación, revisión, ledger y auditoría. Un helper aprobado no
demuestra el protocolo de reservas. [Guía de verificación](../quickstart.md).
