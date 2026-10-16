# Investigación de capacidad posterior a T103

2026-10-16, automatizada; base `b292403`, árbol inicial limpio. Alcance: diagnosticar
y corregir lo justificado de [T103 original](load.md), sin adelantar T104–T108.
Skill speckit-implement limitada a este seguimiento; checklist 16/16, sin AGENTS.md
aplicable ni hooks. Las 68 entradas del manifiesto original verifican tamaño/SHA-256;
no se modifica su paquete `load-test-results/identity/t103-20261016/` ni sus resultados.

## Clasificación que se conserva

| Regla | Clasificación vigente |
| --- | --- |
| /me p95<500 ms, p99<1000 ms; login p95<3000 ms; errores<1 % | Umbrales **provisionales de diseño**, pendientes de D10; contrastarlos no equivale a aprobación con la rúbrica. |
| 1000 cuentas/sesiones distintas y meseta prescrita | Objetivo del escenario exploratorio ID-LOAD-01, pendiente de aceptación D10. No se reduce muestra ni duración. |
| Cero cruces, duplicados y aceptación tras revocación | Exigencias funcionales de identidad que deben preservarse; sus ceros en carga no reemplazan toda la matriz funcional. Los umbrales del escenario también están sujetos a D10. |
| SC-008: 19/20 accesos con inicio visible<3 s | Criterio del spec, distinto del p95 de login HTTP; su verificación T105 sigue pendiente. |
| Hash concurrency 2, cola 50, espera 5000 ms; Argon2id m19456/t2/p1 | Diseño vigente de protección; no se modifica. Parar ante espera>5 s o falta de memoria. |
| Márgenes RAM 128 MiB API/256 MiB Windows | Guardas operativas del ensayo; no umbrales de capacidad aprobada. |

Referencias: [protocolo](../verification.md#escenario-de-carga-id-load-01-1000-sesiones-activas),
[spec](../spec.md), [R04/R05](../research.md), [modelo Session](../data-model.md),
[D10](../../../docs/decisiones-pendientes.md). ID-LOAD-02 solo configura nativamente
login/errores/cruces; /me p95 conserva su referencia contrastada, aunque k6 salga 0.
No se reclasifica ni altera un valor para obtener cumplimiento.

## Diagnóstico de la evidencia original

| Aspecto | Evidencia y conclusión permitida |
| --- | --- |
| Espera HTTP | /me ID-LOAD-01 p95 waiting=1551.548 ms, recepción=0.306 ms, bloqueo previo=1.413 ms. La espera concentra la latencia; esto no identifica por sí solo la sentencia o CPU responsable. |
| Pool | 424/923 muestras durante el generador con waiting>0; pico 546. Prueba presión del pool, sin tiempos de adquisición/sentencias originales para atribuir todo retroactivamente. |
| PostgreSQL | Límite 1 CPU/512 MiB; CPU p95=96.593 %, p99=99.271 %, máximo 100.01 %. Presión cerca de cuota; el original carece de cgroup throttling y de perfil por sentencia. |
| API | 2 CPU/1 GiB; CPU p95=133.431 %, memoria pico 192.9 MiB. La contención del host y el costo del observador no se separaron experimentalmente en el original. |
| Argon2 ID-LOAD-01 | Cola 0, espera máxima 0.319 ms: no hay evidencia de que la cola hash causara la latencia de /me en meseta. |
| Argon2 ID-LOAD-02 | Cola 35, espera máxima 2426.521 ms, trabajo máximo 493.065 ms; cero rechazos, login p95=2239.718 ms. Presión observada, sin incumplir espera 5 s ni justificar bajar seguridad. |
| Generador | CPU p95=54.341 %, p99=85.382 %, pico 100.89 %; RAM 479.7/512 MiB, sin OOM. Un pico no prueba saturación continua ni invalida automáticamente los tiempos HTTP. |

La calibración separada `clock-calibration-01`, 1000 VU/30 s/sleep5 s, completó
6000 iteraciones; desfase según Date.now p95/p99=2 ms, rango −4..3 ms. Es carga
mínima sin HTTP, no mide precisión bajo 95 635 solicitudes ni un reloj independiente.
No se registraron GC/temporización del Go runtime original. Falta generador en otro
host o una referencia temporal independiente para separar concluyentemente esas
interferencias; no se contrata infraestructura ni se atribuyen errores sin evidencia.

### Las dos muestras iniciales

[Auditoría histórica reproducible](../../../load-tests/identity/continuity-audit.ts):
cuatro filas Session tienen createdAt posterior al segundo300, la última a 300.489;
última respuesta de login recibida a 300.628 y último primer /me por slot a 300.740.
createdAt se establece antes del commit: no se confunde con instante exacto de
visibilidad. El original no registró esos commits ni los timestamps de consulta.
La primera revocación lleva timestamp 900.027, posterior a la meseta.

| Timestamp publicado, relativo al escenario | Contador original | Filas creadas/no revocadas según timestamps persistidos |
| --- | ---: | ---: |
| 300.108 s | 993 | 997 |
| 300.615 s | 998 | 1000 |

La reconstrucción por createdAt no reproduce snapshots MVCC/commits. La segunda
publicación ocurrió13 ms antes de recibirse el último login: **no demuestra que
ya fueran visibles1000 sesiones**. La activación tardía está confirmada; el código
publica después de tres consultas de grupos y otra de actividad, pero faltan los
timestamps originales para cuantificar su contribución a cada contador. No se
atribuye exclusivamente a demora de publicación ni a pérdida de sesiones. Una
interpretación inicial de 301.017 s en conversación fue incorrecta: el tiempo relativo
correcto es300.615 s. El original conserva
518/520 muestras completas y no acredita diez minutos íntegros. Los 1.201 s hasta
la primera publicación completa no son un tiempo exacto de creación/commit.
Relojes API/BD actuales: diferencia al punto medio0 ms, RTT2 ms; no prueba sincronía
histórica exacta. La corrección fecha cada lectura PostgreSQL y mantiene el intervalo
de meseta 300–900 s; no lo desplaza hasta alcanzar1000.

## Corrección y ensayos dirigidos

`47f9d7e`: [SessionStore](../../../apps/api/src/modules/identity/infrastructure/session-store.ts)
reutiliza el snapshot obtenido después de bloquear User y Session; en accept evita
SAVEPOINT/RELEASE redundantes y una segunda lectura del mismo estado bloqueado.
La guarda pública de transacción conserva SAVEPOINT. Sin caché, sin cambio de
permisos/expiración/reintentos/SQL parametrizado/orden de locks ni GREATEST.
No se eleva pool, CPU o memoria ni se altera Argon2.

[Benchmark dirigido](../../../load-tests/identity/session-benchmark.spec.ts): otro
schema temporal, 100 pares cuenta/sesión sintéticos del fixture existente, 50 recorridos
secuenciales +2000 con concurrencia 100; driver2 CPU/1 GiB, pool10, BD1 CPU/512 MiB.
Ejecuta lookup→getOwn→accept y verifica resultados; sin HTTP, login ni Argon2.
Los percentiles abarcan2050 operaciones; el tiempo concurrente solo2000.

| Medición | Antes `baseline-session-02` | Después `optimized-session-01` |
| --- | ---: | ---: |
| Sentencias por recorrido | 11 | 8 |
| Lecturas snapshot acumuladas | 6150 | 4100 |
| Tiempo de 2000 operaciones concurrentes | 9825.610 ms | 7712.307 ms |
| Recorrido p95 | 730.932 ms | 541.594 ms |
| Espera pool acumulada por recorrido p95 | 657.279 ms | 503.620 ms |
| Sentencias acumuladas por recorrido p95 | 94.734 ms | 79.649 ms |

Tiempo de sentencia visto por cliente pg incluye red/backend/parseo; no se presenta
como tiempo SQL puro dentro de PostgreSQL. Los percentiles no se suman entre sí.
Una pareja de ensayos no aporta intervalo de confianza: la eliminación de tres
sentencias es determinista; la magnitud temporal observada es local, no un SLA.
Esta mejora justifica **una** repetición completa de cada perfil afectado.

`5fb394a`/`74df818`: [diagnóstico](../../../load-tests/identity/diagnostics.ts) opcional,
conteos con timestamps SQL, CPU cgroup/event loop y duración/adquisición de pg.
No conserva SQL/valores/identidades ni crea endpoints. Los tiempos por ruta incluyen
los 401 funcionales de cierre; percentiles k6 de tráfico válido van separados.
La instrumentación suma costo y comparte el pool API: comparación con original
no instrumentado declarada, sin atribuir toda diferencia a la corrección.

Se conservaron fallos de preparación: lint inicial, compilado antiguo de la imagen,
propiedad de constructor incompatible con Node strip, quoting de un comando y guarda
erasable aplicada inicialmente a código que sí se compila. Ninguno generó carga de
aceptación. Node directo y tsconfig.strip separados del transformador Vitest lo
verifican ahora. No se repite un perfil por umbral desfavorable sin nuevo motivo.

## Perfiles completos y control de medición

Sobre `74df818`, misma laptop/VM/proyecto aislado, límites y cohortes.
Docker fue reiniciado antes de esta investigación; cambian estado de cachés y filas
históricas revocadas acumuladas. No se restauró/purgó para fabricar equivalencia.
Las diferencias de contexto y diagnóstico limitan atribución causal de percentiles.
Calentamiento nuevo `sessions-warmup-799c756f`: 68.137 s generador, 20 VU, 20 sesiones/
logout, 225 solicitudes, 0 errores y 0 sobrantes; login p95=1944.823 ms, /me p95=215.834 ms.

ID-LOAD-01 instrumentado `sessions-22ffd8a3` completó 1020.551 s (externo 1026.119),
k6 exit 99/API 0, sin parada/OOM. /me p50/p95/p99=416.001/2752.879/4642.224 ms;
login=151.718/2287.196/3156.655 ms. 93 214 solicitudes, 92 243 válidas, 91.337 RPS total.
1000 VU y 1000 sesiones distintas; pico HTTP 631, espera pool 567, PG conexiones 11,
locks 0. Muestras 887, meseta 489/490 completas, hueco máximo 7125 ms; 971 logouts,
29 sobrantes revocados. Cero errores inesperados/503/cruces/aceptaciones revocadas.
Lectura fechada en SQL: no se acredita toda la meseta. No sustituye el resultado original.

| Recurso, pico | API | PostgreSQL | k6 |
| --- | ---: | ---: | ---: |
| CPU Docker % |169.62|87.29|111.42|
| RAM MiB |220.8|80.88|485.5|
| Último BlockIO lectura/escritura |0/1.88 MB|13.4/854 MB|0/320 MB|
| Último NetIO entrada/salida MB |391/433|376/364|80.6/48.5|

Los contadores son acumulados observados, no tasas/deltas exclusivos; no se atribuye
el cambio de bytes a una duración de fsync. `fsync`, `synchronous_commit` y
`full_page_writes` permanecen on; shared_buffers 128 MiB. track_io_timing y
track_wal_io_timing off: faltan tiempos puros de I/O/WAL, que no se reconstruyen de bytes.

Diagnóstico de 91 243 respuestas /me, incluidos 971 rechazos funcionales del cierre:
p95 de pared 2478.241 ms; espera pool acumulada 2372.848 ms; sentencias acumuladas
149.516 ms. COMMIT p95=27.802 ms, snapshot=22.907 ms, lock User=19.417 ms,
UPDATE Session=19.899 ms. No son tiempos puros del motor ni percentiles sumables.
90272 recorridos válidos × 8 sentencias +971 rechazados × 1 =723147 sentencias medidas:
se confirma la reducción, pero persiste admisión en cola. Las latencias k6 válidas
permanecen separadas. No hay prueba para culpar exclusivamente una sentencia,
Argon2 o la cuota CPU de PostgreSQL del incumplimiento completo.

Pareja dirigida posterior, mismas 2050 verificaciones/2000 concurrentes:
`overhead-on-01`: 7250.384 ms/p95=464.060 ms;
`overhead-off-01`: 7464.621 ms/p95=552.760 ms. No demuestra sobrecosto positivo del
perfilador ni explica causalmente el empeoramiento completo. Es una pareja local,
sin intervalo de confianza. Quitar la instrumentación conserva toda la seguridad.

Para acercar el control a las condiciones originales se realiza **una ejecución sin
perfilador SQL** de ID-LOAD-01, seguida de ID-LOAD-02 también sin él. Motivo: contraste
del producto bajo el modo original de observación, no búsqueda de una pasada favorable.
No se repite después sin otro cambio/hipótesis justificado. Calentamiento sin
perfilador `sessions-warmup-6ebf7bbb`: 67.959 s, 20 VU, 230 solicitudes, 20 login/logout,
0 errores/sobrantes; /me p95=148.088 ms, login p95=1462.243 ms.

### Control ID-LOAD-01 sin perfilador

`sessions-985379d4`, 17 min completos: 1020.555 s generador /1028.073 s externos;
k6 exit 99/API0, ninguna parada ni OOM. Comparación observada, sin atribuir toda
diferencia al código: cambian hora/estado del host, historial/cachés y precisión
del timestamp de observación. Perfiles, cuotas, pool, criptografía y umbrales idénticos.

| Medición | Original | Corregido sin perfilador |
| --- | ---: | ---: |
| VU / sesiones válidas distintas máximos |1000/1000|1000/1000|
| Solicitudes / RPS total |95 635/93.716|99 276/97.276|
| Tráfico válido / errores inesperados |94 669/0|98 311/0|
| /me p50 / p95 / p99 ms |319.202/1551.978/2794.672|52.254/805.894/1379.327|
| Login p50 / p95 / p99 ms |105.565/1328.946/2077.204|90.631/721.619/1237.560|
| Pico solicitudes HTTP / espera pool |555/546|424/370|
| Muestras de meseta completas/total |518/520, publicación|589/589, lectura SQL|
| Mayor hueco entre publicaciones |4848 ms|4608 ms|
| Logouts / sobrantes revocados |966/34|965/35|
| Hash espera máxima / cola pico |0.319 ms/0|0.325 ms/0|

Siguen incumplidos /me p95<500 y p99<1000 ms. Cero 503/cruces/aceptaciones revocadas;
1000 slots distintos validados en meseta. Todas las muestras nuevas están completas,
pero eso no demuestra observación continua ni reemplaza auditar la frontera real.
No se reescriben las 518/520 originales usando el timestamp nuevo.

| Recurso, pico | API | PostgreSQL | k6 |
| --- | ---: | ---: | ---: |
| CPU Docker % |150.42|97.52|104.52|
| RAM MiB |189.4|83.43|461.8|

1009 muestras servidor/300 externas, 10 conexiones PG máximas, 0 locks esperando;
21 775 924/54 832 027 bytes enviados/recibidos originales frente a
22 592 431/56 932 986 del control. IO/red Docker al salir puede reiniciarse a 0;
usar último contador con PIDs>0, además de bytes k6 y serie completa.

### ID-LOAD-02 sin perfilador y recuperación

`authentication-86e0dd66`: cuatro escalones completos, 486.080 s de generador/
489.039 s externos; k6/API exit 0, ninguna parada/OOM.100 VU, 100 cuentas distintas
auditadas, 3938 login/me/logout, 11 814 solicitudes válidas/24.305 RPS, cero errores.

| Medición | Original | Corregido |
| --- | ---: | ---: |
| Login p50 / p95 / p99 ms |365.038/2239.718/2941.030|238.803/1819.693/2720.493|
| /me p50 / p95 / p99 ms |72.557/602.740/814.106|32.875/387.734/663.772|
| Espera hash máxima / cola pico / rechazados |2426.521 ms/35/0|1986.546 ms/32/0|
| Trabajo hash máximo / terminados, incluido dummy |493.065 ms/3771|303.464 ms/3939|
| VU / sesiones válidas instantáneas pico / HTTP en vuelo pico |100/24/65|100/20/65|
| Espera pool pico / conexiones PG / locks esperando |32/10/0|21/10/0|
| Muestras servidor / externas / hueco máximo |486/142/1866 ms|488/145/1988 ms|

| Recurso, pico | API | PostgreSQL | k6 |
| --- | ---: | ---: | ---: |
| CPU Docker % |206.91|74.50|24.40|
| RAM MiB |172.7|85.82|60.08|
| Último BlockIO lectura/escritura |0/999 kB|14.5 MB/1.92 GB|0/33.3 MB|
| Último NetIO entrada/salida MB |61/72.8|841/807|7.53/4.51|

Bytes k6 enviados/recibidos3 196 812/6 078 584. La cuota API inspeccionada sigue
siendo 2 CPU; un pico Docker206.91 % no implica haberla elevado. Todas las referencias
numéricas de latencia/error contrastadas se satisfacen en **este** ID-LOAD-02,
sin convertirlo en aceptación D10 ni en capacidad de 1000 logins simultáneos.
No se probó revocación por cada ciclo: se comprueba aparte, como prescribe el protocolo.

Smokes de recuperación tras reiniciar proceso aislado, ambos2 VU/10 solicitudes,
dos login/logout y dos rechazos401 con cookie anterior, sin errores/503/cruces:
`smoke-sessions-fcefc481`14.803 s, /me p95=24.035 ms, login p95=273.555 ms;
`smoke-sessions-2480b34d`14.166 s, /me p95=19.842 ms, login p95=163.957 ms.
Cero sobrantes. No demuestran recuperación automática sin reinicio ni un SLA.

### Frontera real y componente de espera

La auditoría posterior del control encontró **seis** Session con createdAt>300 s,
última 300.935, última respuesta login301.122 y último primer /me301.519.
Primera revocación900.108. Por tanto589/589 muestras completas **no aprueban los
diez minutos íntegros**: la activación tardía persiste. En el diagnóstico instrumentado
hubo siete creaciones tardías, última 301.500; primera revocación900.435.
No se añaden tolerancias ni se cambia el comienzo de meseta para corregirlo.

En el diagnóstico instrumentado, espera de adquisición suma 89.311 % del tiempo
acumulado medido por ruta /me; sentencias 10.223 %. Es evidencia del componente
inmediato de espera en ese ensayo; no atribuye el origen exclusivamente a CPU/I/O
ni reconstruye porcentajes del original. Tiempos por solicitud no se confunden con
CPU consumida. Ventana cgroup16:20:10.072–16:37:09.921 UTC:

| Cgroup | Δusage_usec | Δnr_periods | Δnr_throttled | Δthrottled_usec |
| --- | ---: | ---: | ---: | ---: |
| API |1000020771|9981|735|27205074|
| PostgreSQL |606408021|9596|1856|223760613|
| Generador |375115265|10190|426|176262279|

Hay períodos limitados por cuota, no evidencia de CPU agotada continuamente. Los
contadores throttled no son latencia individual de solicitudes ni se suman a sus
percentiles. El generador conserva un margen RAM estrecho, sin OOM observado.

[Plan del lookup](../../../load-tests/identity/query-plan.ts), puntual en reposo:
Nested Loop con Index Scan Session_tokenHash_key y User_pkey, una fila, 13 buffers
hit/0 read; planificación 0.784 ms y ejecución 0.134 ms. No se detecta índice ausente
en esa consulta. No representa planes/tiempos dentro del motor bajo saturación y no
justifica cambiar índices, preparar consultas a ciegas o ampliar conexiones.

Retraso máximo observado entre consulta y publicación:5113 ms en diagnóstico,
3380 ms en control y 751 ms en autenticación. En el diagnóstico, pico del histograma
de event loop por ventana de 1 s=97.124 ms, resolución 20 ms; no es el p99 global
del perfil. En los controles sin perfilador el dato es **no medido**, no cero.
Clasificando la meseta instrumentada por publicación se obtienen488/490 muestras
completas; por lectura SQL489/490. Ambas conservan el incumplimiento; el cambio de
reloj no modifica la meseta ni la activación tardía auditada.

## Conservación, comprobaciones y estado de aceptación

En los siete ensayos las huellas de 1120 User y SystemState coinciden antes/después.
Auditorías de filas confirman1000 sesiones/1000 usuarios/1000 secretos por perfil
de sesiones y 3938 sesiones/100 usuarios/3938 secretos en el nuevo ID-LOAD-02,
todas revocadas al auditar. Cero duplicados observados de usuario/secreto en los
conteos de sesiones válidas; identidad/rol verificados en cada respuesta válida.
Las sesiones cortas de autenticación se distinguen de VU y HTTP en vuelo.
Limpieza dirigida:29 sobrantes del diagnóstico y 35 del control;0 en demás ensayos;
repetición0, cuentas borradas0. Snapshot final1120 cuentas y 0 sesiones válidas
en las tres cohortes. Audits de carga registraron MailDelivery vacía y Mailpit0
antes de las regresiones administrativas; estas usan otros schemas de prueba.

Las 15 cuentas manuales, 12 originales, credenciales y singleton conservan sus
huellas. No se restaura/purga desarrollo/manual ni se elimina un volumen. Los
servicios del ensayo quedan detenidos; los cuatro manuales siguen saludables.
Archivos nuevos privados en `load-test-results/identity/t103-investigation-20261016/`:
JSONL/resúmenes nativos, metadatos/recursos, diagnóstico, planes saneados,
auditorías, pruebas y scripts de postanálisis, con ACL privada y manifiesto SHA-256.
Los 68 archivos del manifiesto original se verificaron otra vez sin cambios.
No se copian fixtures.json ni private.env al paquete ni se versionan crudos.
Manifiesto final:152 entradas verificadas,706 212 076 bytes, ACL privada; derivados
iniciales conservados y valores no medidos indicados como null en el análisis final.

Build/lint de ambos workspaces y 120/120 unitarias/arquitectura aprobadas; lote de
105/105 integración/diagnóstico, 73/73 consumidores administrativos, 12/12 controles
del runner y 2/2 observación, sin omitidas. Controles de promesas/callbacks, atribución
concurrente y privacidad del diagnóstico aprobados; importación Node strip y ambos
chequeos TypeScript aprobados. Los siete ensayos coinciden en conteos/percentiles
crudos frente a resúmenes. No se presenta esto como toda la regresión T106.
494 enlaces locales comprobados; git diff --check sin errores. Comparación Git con
b292403 confirma perfiles, cliente, credenciales y configuración de entorno intactos.
Reproducción y herramientas: [runbook de carga](../../../load-tests/identity/README.md).

| Criterio contrastado, sin modificarlo | Estado actual en estos ensayos |
| --- | --- |
| ID-LOAD-01 /me p95<500 ms y p99<1000 ms | **Incumplidos: 805.894/1379.327 ms** en control sin perfilador. |
| ID-LOAD-01 1000 alcanzados | Demostrado, independiente de latencias. |
| ID-LOAD-01 1000 durante los diez minutos íntegros | **Incumplido en frontera:** seis creaciones posteriores al inicio; 589/589 muestras no lo corrigen. |
| Login p95<3000 ms, errores<1 % | Satisfechos numéricamente en ambos controles. |
| ID-LOAD-02 /me p95<500 ms y p99<1000 ms | Referencias satisfechas: 387.734/663.772 ms, sin aceptación D10. |
| Identidad, duplicados observados, revocación funcional separada | Cero fallos observados; no observación continua entre muestras. |
| Hash/cola/límites y parada prescrita | Conservados; sin paradas ni OOM en perfiles ejecutados. |

**T103 permanece [x] como ejecución e informe; capacidad y aceptación final no
aprobadas.** D10 debe acordar rúbrica/escenario/criterios y tratamiento de frontera,
sin tolerancia añadida en esta investigación. La aceptación final del spec no puede
cerrar capacidad con los incumplimientos actuales. SC-008/T105 y participantes
T104 siguen independientes; bootstrap intermitente abierto para T106. T095 continúa
CLI sin programación, D13 sin SLA aprobado; no se adelantan T104–T108.

Límites que impiden una atribución causal completa: faltan en el original timestamps
de consulta/commit, tiempos internos por sentencia/I/O/WAL, perfil de CPU/GC y reloj
externo o generador independiente. No pueden reconstruirse retrospectivamente.
Para separar motor/red/event loop y contención del host se requiere un ensayo
pareado con esas trazas y estado de datos/caché controlado, además de generador
independiente para validar sus interferencias. No se contrató infraestructura.
Las nuevas trazas no prueban cómo era el entorno histórico. No hay evidencia que
justifique ampliar pool, debilitar hashes, bajar carga o alterar umbrales. No se
extrapola identidad local a producción, matrícula, video, clases o chat.
