# US3: checkpoint técnico local T067–T069

Fecha: 2026-11-12, America/Lima. Rama `feat/003-reservas-ordenes-matricula`, base Git `cfc001eac89292c1b135dbba79be9a9ca8cc0b8b`. Se conserva por hashes el trabajo previo sin commit.

**T067–T069 completas: US3.01–US3.05 aprobados al nivel técnico local.** Se ejecutan **609 casos únicos, 950 ejecuciones aprobadas**, sin fallos, flaky ni omisiones. Se añaden seis casos PG/HTTP de límites. [Resultados por caso, ejecuciones, TV01–TV25, escenarios y fuentes](us3-results.json). Este cierre no acredita proveedor real, operación durante 24 horas físicas o aceptación humana integrada.

## Cambios y preparación

Se añade [enrollment-temporal-checkpoint.spec.ts](../../../apps/api/tests/integration/enrollment-temporal-checkpoint.spec.ts) y se incluye en la comprobación explícita de tipos de API. No cambia código de producto, dependencias, rutas públicas o migraciones.

TC01 recorre admisión y despacho reales para una selección de un grupo. La solicitud se admite antes del corte; al despachar a −1µs confirma una orden, detalle y reserva, cero matrículas y una auditoría. La hora persistida es 2090-01-02T04:59:59.999999Z y el plazo conserva 86400000000µs. Al despachar en igualdad o +1µs rechaza como OFFERING_NOT_RESERVABLE, sin orden, detalle, reserva o matrícula; registra una sola auditoría de rechazo. La admisión anterior no concede derecho a confirmar después.

TC02 parte de una orden/reservas producidas por US1 y de un pago aplicado por el finalizador real T051. Solo el intento, recibo y hecho económico de preparación son simulados explícitamente. En validUntil−1µs la matrícula sigue vigente; en igualdad/+1µs pasa a HISTORICAL. Lista y detalle HTTP conservan los demás campos originales. El inventario muestra ocupación 1/disponibilidad 0 solo antes y ocupación 0/disponibilidad 1 desde el límite, sin retención extra. La orden conserva ENROLLED/revisión 2, ambas reservas CONVERTED y el fingerprint financiero completo permanece igual tras las lecturas.

Los seis casos se ejecutan en procesos UTC y America/Lima. El reloj SQL controlado está limitado al esquema ficticio t_; no acepta una hora del alumno ni acorta las 24 horas del producto. Los controles del helper se distinguen en el JSON de la admisión, despacho, normalizador y finalizador reales.

## Ejecución y recuento

| Conjunto | Casos únicos | Ejecuciones aprobadas |
| --- | ---: | ---: |
| Reglas temporales UNIT, 11 archivos, UTC/Lima | 275 | 550 |
| Fronteras civiles/persistencia/adaptador, UTC/Lima | 20 | 56 |
| TC01/TC02 nuevos PG/HTTP, UTC/Lima | 6 | 12 |
| Vencimiento PG | 28 | 28 |
| Ciclo de vida Nest real | 4 | 4 |
| Vencimiento HTTP | 16 | 16 |
| Lecturas ante retroceso temporal | 9 | 9 |
| Finalización de pagos PG | 53 | 53 |
| Despacho/ejecución de reservas | 32 | 32 |
| Consultas/persistencia/HTTP | 47 | 47 |
| UNIT web de vencimiento | 6 | 6 |
| UNIT web de pagos/matrículas | 45 | 45 |
| Seguridad HTTP de pagos | 35 | 35 |
| Consultas HTTP del alumno | 9 | 9 |
| E2E vencimiento/nueva selección, escritorio/móvil | 13 | 26 |
| E2E pagos, escritorio/móvil | 11 | 22 |
| Total ejecutado en este checkpoint | 609 | 950 |

Las reglas temporales son 275 casos idénticos por proceso; no se suman como 550 casos nuevos. El archivo de fronteras produce 28 resultados por proceso: cuatro casos civiles se repiten con conexión UTC/Lima/Tokyo y los otros 16 son distintos. Se normaliza la zona de conexión para contar **20 casos únicos y 56 ejecuciones** en los dos procesos. Ocho de esos 20 prueban rechazo puro de texto epoch, sin PG; los otros 12 ejecutan persistencia/calendario/snapshots reales. TC aporta 6 casos/12 ejecuciones y navegador 24 casos/48 ejecuciones. Las 341 repeticiones se registran por caso, zona y proyecto.

Se conserva, separada de las ejecuciones actuales, la evidencia de **787 regresiones aprobadas en T065–T066**: interfaz general (331), núcleo/contratos/arquitectura (455) y composición (1). Sus fuentes y todo código de producto coinciden con la base del directorio de trabajo por SHA256; la regresión afectada sí se ejecuta de nuevo arriba. No se atribuyen a este turno las ejecuciones históricas. La unión de cobertura actual y heredada contiene 1396 casos distintos; el total ejecutado ahora sigue siendo 609/950.

Lint, compilación de API/web, tipos de tests/soportes/API y configuración E2E aprobados. No se amplían timeouts, debilitan expectativas ni usan skip/only/fails para aprobar. Los errores de preparación no se contabilizan como comportamiento válido.

## Matriz temporal alcanzada

Los 25 IDs son familias de diseño, no 25 tests. El JSON vincula cada fila con casos y ejecuciones concretas; todos alcanzan las aserciones finales. UNIT usa puertos controlados y comprueba reglas, no atomicidad PG. RQ08 conserva su preparación de conversión ficticia y se clasifica como lector con hechos sembrados; las carreras de producto se acreditan aparte con PP03–PP10/EX24–EX26 y el finalizador real.

| Diseño | Niveles ejecutados | Aserciones finales y límites |
| --- | --- | --- |
| TV01 | UNIT/PG | 86400000000 microsegundos; confirmación y plazo persistidos exactos. |
| TV02 | UNIT/PG/HTTP | −1/0/+1µs: vigencia solo antes; GET conserva fingerprint. |
| TV03 | UNIT/PG | Finalización estrictamente anterior; igualdad/posterior incidencia sin matrícula. |
| TV04 | UNIT/PG | Admisión real anterior; despacho −1/0/+1µs; rechazo total desde inicio Lima. |
| TV05 | UNIT/PG/HTTP | Matrícula producida por finalizador; fin −1/0/+1µs; historial y cupo efectivo, cero escritura financiera. |
| TV06 | PG | Barrera de grupo observada; captura tras esperar y rechazo al cruzar inicio. |
| TV07 | UNIT/PG | Epoch negativo, seis fracciones, acarreo y rechazo sin redondeo; adaptador puro distinguido de PG. |
| TV08 | UNIT/PG | 0001/9999, bisiestos, fechas históricas y límite exclusivo +010000; referencias explícitas independientes. |
| TV09 | UNIT/PG/HTTP | Mismos 275 UNIT, 20 casos de fronteras y 6 PG/HTTP en procesos UTC/Lima. Conexiones UTC/Lima/Tokyo se cuentan como repeticiones. |
| TV10 | PG | Rollback confirmado; token nuevo dentro del presupuesto, sin resultado parcial. |
| TV11 | PG/HTTP | COMMIT ambiguo antes/después, recuperación canónica y sin renovación. |
| TV12 | PG/HTTP/E2E | Reinicio de Node/API real; mismas fechas y un efecto durable. |
| TV13 | PG/HTTP/E2E | Worker detenido/retrasado; vencimiento lógico efectivo, lector espera commit y no normaliza. |
| TV14 | PG | Dos normalizadores/workers reales: una transición, revisión y auditoría. |
| TV15 | PG | Fallo de reserva/auditoría: todas las filas y resultado juntos o rollback total. |
| TV16 | UNIT/PG/HTTP/E2E | NOT_DUE, EXPIRED y ENROLLED conservados; no revocación de matrículas. |
| TV17 | PG/HTTP/E2E | Selección disjunta cubre orden anterior; nueva intención explícita sin penalización ni renovación. |
| TV18 | PG | Worker y normalización oportuna comparten efecto; nueva selección usa el mismo token. |
| TV19 | UNIT/PG | Topología redescubierta, 40001/40P01 presupuesto común; 55P03 sin bucle inmediato. |
| TV20 | UNIT/PG | Horizonte finito/cursor por examinada; candidata fallida revisitada, sin cambiar RA-02. |
| TV21 | UNIT/PG/HTTP | Single-flight, detener timer, esperar trabajo y cerrar pool después. |
| TV22 | HTTP/E2E | Hora exacta servidor; cliente/logout/reload/error no renuevan ni reenvían automáticamente. |
| TV23 | PG/HTTP | Ocultamiento/republicación y cambio posterior no alteran límite original ni reactivan historial. |
| TV24 | UNIT/PG/HTTP | Retroceso detectable: error seguro/readiness suspendida; fechas/terminales conservados. D13 y 24h físicas pendientes. |
| TV25 | PG/HTTP | Recibo no extiende; finalizador real vs expiración/reasignación; atomicidad y no resurrección. |

## Escenarios independientes US3

| Escenario | Evidencia final alcanzada |
| --- | --- |
| US3.01 | Duración exacta y persistencia con seis fracciones, epoch negativo y año 10000; hora cliente alterada, logout y recarga conservan el plazo servidor. TV01/07–09/22; EE01–EE03. |
| US3.02 | −1µs conserva retención; igualdad/+1µs vencidos sin matrícula. GET calcula vigencia sin escribir; normalización posterior materializa una sola vez. TV02/13/16; EX01/02, HX01/02. |
| US3.03 | Reinicio de Node/API y worker retrasado reales recuperan las mismas fechas y resultado; lector espera locks y proyecta después del commit. TV06/12/13/21; EX22/26, EL01/02, HX03/10, EE02/05. |
| US3.04 | Dos workers/normalizadores y normalización oportuna concurrentes producen una transición, revisión y auditoría ORDER_EXPIRED. Fallos de escritura/auditoría revierten todo. TV14/15/18/20; EX03/06/21/27/28. |
| US3.05 | Pago antes del límite gana sin expirar ENROLLED; expiración/reasignación primero deja incidencia sin resurrección o sobreventa. Recibo previo no amplía plazo y verificación en igualdad/+1µs no matricula. TV03/17/19/25; PP02–PP10, EX24/25, HX09. |

La nueva selección se recorre en navegador hasta otra orden confirmada con intención diferente. Requiere consulta, selección, preview y consentimiento nuevos; la orden anterior conserva su resultado/plazo y una sola materialización. Si falla la consulta o el inventario, se exige recuperar el estado, se retira la acción del detalle y no se envía reserva/pago automáticamente. Pago pendiente, matrícula confirmada e incidencia se comprueban como estados distintos. Escritorio/móvil son automatización, no observación humana.

## Entorno y conservación

Proyecto Docker existente `academic-offering-fa3d46bddbb8`, APP_ENV=test, PostgreSQL 16.14 y base `academia_v00_test`, roles runtime/migración separados y cero puertos publicados. Se conserva el volumen creado el 2026-10-19 y la configuración privada. Node 22.23.1, Vitest 5.0.2, Playwright 1.63.0, ICU 78.2, tzdata Node 2026a y sistema 2026b; identificadores exactos en JSON.

Se reutilizan las imágenes existentes añadiendo exclusivamente el test y su configuración de tipos. Se comprueban **502 fuentes de apps** por SHA256 en API y navegador y ocho módulos compilados coincidentes con T065–T066. No se descarga Chromium ni se reconstruyen dependencias. Las suites PG son secuenciales, con esquemas propios; barreras observables y consultas de filas finales sustituyen a esperas arbitrarias.

Runner privado: `.cache/reservas-t067-t069/`. `start.ps1` comprueba destino y reanuda solo db/mailpit; `overlay.ps1` incorpora los tests, ejecuta TC en dos zonas y valida tipos/lint/build; `validate.ps1` ejecuta la matriz y regresión afectada; `record.mjs` comprueba los reportes y genera JSON; `audit.mjs` verifica alcance/conservación. Cada acción falla si el destino o resultado discrepa. Scripts y reportes crudos se conservan en esa carpeta ignorada por Git.

Al cerrar se detienen exclusivamente db/mailpit del ensayo, sin eliminar el volumen. Los esquemas previos de upgrade y aceptación humana permanecen idénticos. Siete migraciones, 74 archivos protegidos, spec/quince respuestas, contratos, checklist 12/16 y toda evidencia anterior se conservan. Solo se actualizan la configuración de tipos, las tres marcas/estado de tasks.md y la trazabilidad de verification.md; se añaden el test y estos dos artefactos de evidencia.

## Límites y continuidad

T067/T068/T069 cierran el checkpoint técnico local; **65/94 tareas completas, 29 pendientes**. La operación D13, el ensayo de 24 horas físicas T090, capacidad D10, proveedor/sandbox D02/T056–T059 y política económica anterior a cobros reales siguen pendientes. El fallo seguro ante retrocesos detectables no demuestra detección universal entre reinicios ni sustituye sincronización y observación operativa del reloj.

T042 conserva la aceptación humana previamente confirmada con consentimiento y computador. Este checkpoint no añade participantes ni observación humana móvil/teclado y no cierra T089, pendientes001/002, bootstrap, CI remoto o SMTP externo. No hay despliegue, carga, contratación, pagos reales, devolución, traslado o matrícula manual.

El siguiente bloque es **T070–T072**, preparación de pruebas de US4 para consulta administrativa y seguimiento autorizado.
