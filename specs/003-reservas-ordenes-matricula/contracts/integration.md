# Contrato de integración y transacciones — RP004

Diseño, no interfaces implementadas. [Reglas](../spec.md), [modelo](../data-model.md),
[decisiones técnicas](../research-rp004.md). Dominio/aplicación/public sin Nest,
Prisma, pg ni imports de infraestructura. Entre módulos, solo superficies public.

## Dueños y capacidades

| Capacidad prevista | Dueño / consumidor | Contenido y límite |
| --- | --- | --- |
| ReservationOfferingAccess | academic-offering/public/reservation-boundary.ts → enrollment | Descubrir padres/docentes y obtener snapshots autoritativos después de locks: IDs/revisiones, visibilidad, período/franjas, capacidad y generación/revisión docente. No email, credencial o motivo privado. |
| EffectiveSchedule | academic-offering/public/schedule.ts → enrollment | Exponer el predicado puro de coincidencias efectivas existente, sin copiarlo ni importar dominio ajeno. No decide permisos, precios o vigencia de compromisos. |
| GroupCommitmentPolicy | enrollment/public/commitments.ts → oferta | Comprobar presencia de reservas/matrículas vigentes e incidencias abiertas para operación/campos concretos. Lectura bajo los mismos locks y reloj de la unidad de trabajo; no inicia transacción propia. |
| EnrollmentStore / ReservationCoordinator | aplicación enrollment → adaptadores propios | Confirmar selección/orden/reservas, consultar estados, registrar resultados/auditoría y ejecutar decisiones atómicas. No devolver conexión a la aplicación. |
| PaymentGateway | enrollment/public/payments.ts → aplicación/adaptador | Iniciación idempotente y evidencia verificada normalizada para orden/importe/moneda. Adaptador real D02 separado de simulación exclusiva de pruebas. No acepta éxito del navegador. |
| Acceso actual | authorization/public/session.ts + users/public/account.ts | SessionActor/Permission/tipos existentes; ampliar permisos según matriz del API. Revalidación dentro de transacción se ensambla en composición, sin ampliar SessionRepository con PoolClient. |

AppModule e infraestructura de coordinación construyen participantes de cada módulo
ligados al mismo PoolClient. Los callbacks reciben solo capacidades puras, efímeras
y no reutilizables fuera del callback. Solo infraestructura hace BEGIN/COMMIT.
Enrollment no importa OfferingStore ni session-store. Oferta no consulta tablas
financieras directamente: recibe el guard público con implementación ligada al cliente.
Ningún participante abre otra transacción o llama por HTTP al propio monolito.

## Orden global y presupuesto

Tres familias de unidad de trabajo, todas con `accountTransaction` y un solo
presupuesto de hasta tres intentos para abortos conocidos tras rollback confirmado:

1. Admisión: AdmissionSequence → cuenta alumno → sesión → solicitud/intención.
   No solicita DispatchState, cursos, grupos o filas financieras de órdenes.
2. Despacho: DispatchState → descubrir → cuentas UUID ordenadas (alumno y docentes)
   → sesión → cursos UUID → grupos UUID → órdenes/detalles/solicitud → resultado/auditoría.
3. Escritura de oferta, precio, conciliación o seguimiento: descubrir → cuentas UUID
   → sesión cuando es usuario → cursos UUID → grupos UUID → filas financieras
   ordenadas por tipo/UUID → resultado/auditoría. Nunca solicita las coordinadoras.

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

## Pago, vencimiento y pendientes especializados

El efecto de conversión comparte locks de alumno/docentes/cursos/grupos con reserva
y mantenimiento. Verifica pago auténtico para orden/importe/moneda correctos, referencia
temporal estrictamente anterior a expiresAt, plaza válida, visibilidad y D06. Convierte
toda la orden sin consumir plazas adicionales ni comparar sus reservas consigo mismas.
Resultado, matrícula, reservas, hechos de pago y auditoría son atómicos; no confirmación
parcial. Repetir el mismo pago auténtico no repite efecto ni crea otra incidencia.

Si falta una condición aplicable, registrar hecho/incidencia sin matrícula, no eliminar
el pago ni inventar devolución. Una incidencia no libera por sí sola reservas antes
del vencimiento, no resuelve economía y no autoriza un segundo cobro. La lectura de
vigencia no depende del worker; su materialización posterior debe ser idempotente.

RP005 debe concretar captura/precisión temporal, worker y pruebas de límites/reinicio.
RP006 debe completar recibo durable de verificación, carreras con liberación/reasignación,
fallo tras verificación externa e iniciación ambigua del proveedor. No mantener locks
de BD durante llamadas externas ni asumir que una fecha anterior permite recuperar
una plaza reasignada. La matriz completa y esos detalles son puerta antes de tareas
de pago; aquí no se declaran resueltos por enumerar invariantes.

Si cancelar confirmó primero sin bloqueantes y luego aparece pago tardío, registrar
incidencia sin matrícula y conservar cancelación terminal; no revertirla. Si la
incidencia confirma primero, bloquea cancelar. Debe verificarse en PG real en RP006/RV001.

## Interfaces y regresión previstas

Ampliar composición, permisos, escritores de oferta/guard, puertos públicos y lector
de calendario. Nueva proyección reservable propia: no cambiar silenciosamente DTO
002 con NOT_CALCULATED. Cambios de transacciones requieren regresión real de identidad,
generación docente, publicación, revisión, ledger y auditoría. Un helper aprobado no
demuestra el protocolo de reservas. [Guía de verificación](../quickstart.md).
