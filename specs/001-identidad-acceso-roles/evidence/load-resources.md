# T103 — experimentos locales de cuotas CPU

2026-10-18; comprobaciones automatizadas, sin aceptación humana atribuida. Base
`b15a3a9`, árbol inicial limpio; instrucciones y checklist documental revisados.
Se conservan el [informe original](load.md), la [investigación](load-investigation.md),
el [seguimiento](load-followup.md) y las [mediciones del 17](load-environment.md).
T103 continúa [x] por ejecución/informe; capacidad y aceptación final siguen abiertas.

## Condiciones y alcance

Se mantiene el [protocolo original](../verification.md#escenario-de-carga-id-load-01-1000-sesiones-activas):
ID-LOAD-01, 1000 cuentas distintas, login real único al activarse, cookie propia y
/me cada 5–10 s; rampa 5 min, meseta **[300,900)** de 10 min y descenso 2 min.
Calentamiento separado de 20 cuentas/20 VU/1 min. ID-LOAD-02 conserva otras 100 cuentas,
login→/me→logout→5 s, escalones 10/25/50/100 VU, 2 min cada uno. No son 1000 logins
simultáneos ni capacidad de matrícula, clases, video, chat o producción.

Referencias provisionales pendientes de **D10/rúbrica**, sin reclasificación:
/me p95<500 ms, p99<1000 ms; login p95<3000 ms; errores inesperados<1 %.
1000 VU no demuestran 1000 sesiones válidas distintas durante toda la meseta.
Cero cruces y rechazo de sesiones revocadas también son obligaciones funcionales
aprobadas; esta carga no sustituye su aceptación completa. No se desplazan fronteras
ni se excluyen ventanas desfavorables. SC-008/T105 permanece independiente.

No cambia código de producto, SQL, pool (10), seguridad, cohortes, tráfico ni
duraciones. Argon2id m=19456/t=2/p=1/hash=32, gate 2, cola 50 y espera 5000 ms
intactos. Se mantienen las paradas por espera Argon2>5000 ms, margen API<128 MiB,
Windows libre<256 MiB, OOM o fallo de monitor y los abortos HTTP originales.

## Entorno y cambios controlados

Ryzen 7 3750H, 4 núcleos/8 hilos; Windows 14 966 218 752 bytes RAM. Docker 29.8.1,
8 CPU y 7 236 878 336 bytes. A las 08:24:33 -05:00: corriente, plan clásico Alto
rendimiento, 2300 MHz, CPU 19 %, 6 105 240 KiB libres antes de Docker. Tras reanudar
los cuatro servicios manuales, 08:30:07: CPU 4 %, 2 980 296 KiB libres. No se cambia
Windows ni se detienen procesos competidores. Se conservan capturas y series durante
carga; frecuencia nominal y CPU muestreada no prueban ausencia de interferencias.

Proyecto aislado `identity-load-80c2b6fa22ce`, BD marcada, schema `t_load_identity`,
red interna sin puertos publicados, volúmenes propios; 1120 fixtures (1000+20+100).
Manual `academia-local` conserva datos/volúmenes y 15 cuentas, incluidas las 12 originales.
API 2 CPU/1 GiB; PostgreSQL y k6 mantienen **512 MiB cada uno**.

[Override exclusivo](../../../load-tests/identity/compose.resources.yml) y
[runner](../../../load-tests/identity/measure.ps1), commits `e2739fc`, `5d92b9e`, `8170458`.
`compose.yml` original intacto. El runner aplica explícitamente db/mailpit/api y
comprueba cuotas efectivas con inspect antes de aceptar el ensayo; metadatos guardan
cuotas solicitadas y reales. La primera tentativa `sessions-warmup-d1844896`
solicitó PG=2 pero conservó **PG efectivo=1** por iniciar solo API. Se preserva y
se descarta como experimento PG=2; el defecto de preparación se corrigió en `5d92b9e`.

Observación: trazado pg/HTTP, cgroups y lector SQL base; sin V8 ni observación opcional
del motor durante perfiles completos. CPU/energía de Windows espaciadas y RAM por
ciclo, con costo CIM incluido. `memory.events` se lee en el mismo exec de cgroups.
Costo del PowerShell padre excluye docker.exe, CIM y daemon. Host, servidor, generador
y observador comparten equipo: no se atribuye a un componente todo el tiempo ajeno a Node.

## Control comparable A/B/A

Mismo benchmark real PostgreSQL: 100 cuentas/sesiones sintéticas propias de test,
50 consultas seriales y 2000 a concurrencia 100, ruta lookup→perfil→accept de 8 SQL.
Trazado y observación del motor activos en los tres; mismo driver 2 CPU/1 GiB y pool10.
Sin HTTP ni Argon2 en la ventana medida: **no es un perfil de capacidad**. Schemas
propios limpiados; resultados y preparación conservados.

| Control | CPU PG | 2000 concurrentes | wall p95 | espera pool p95 | SQL cliente p95 | CPU host máxima muestreada |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| resource-pg1-a-20261018 | 1 | 9340.977 ms | 807.855 ms | 721.836 ms | 98.441 ms | 87 % |
| resource-pg2-b-20261018 | 2 | 7540.567 ms | 643.008 ms | 581.224 ms | 68.853 ms | 60 % |
| resource-pg1-c-20261018 | 1 | 9302.133 ms | 748.023 ms | 673.984 ms | 101.193 ms | 55 % |

Percentiles incluyen las 2050 operaciones; duración concurrente solo las 2000.
Dos CPU reducen esa duración ~19 % frente a ambos controles de una CPU; A/C difieren
~0,4 %. Host libre mínimo B=2 712 530 944 bytes; máximo CPU PG=114,99 %.
No se oculta el pico host del primer control ni se asigna significación estadística
a tres ensayos. WAL sync acumulado A/B/C=3268,308/2551,008/3655,407 ms;
planificación SNAPSHOT=1044,417/737,338/871,621 ms. Son agregados internos, no
percentiles HTTP ni prueba de que fsync explique toda la espera. Mejora dirigida
suficiente para repetir ID-LOAD-01 con PG=2, manteniendo inicialmente k6=1.

Calentamiento PG=2 efectivo `sessions-warmup-96c2b441`: 20 VU, 67,488 s k6,
228 HTTP/208 válidas, cero errores; login p95=1619,310 ms, /me p95/p99=197,747/282,183 ms.
Hash espera máxima 762,654 ms, cola14, rechazos0; 20 logouts y 20 rechazos de cookie
previa; limpieza residual0. El calentamiento mal etiquetado anterior queda separado.

## ID-LOAD-01, PG=2 / k6=1 CPU / k6=512 MiB

`sessions-8406f999`, revisión `8170458`, diff de ejecución vacío; PG efectivo
2 CPU/512 MiB, API 2 CPU/1 GiB, k6 1 CPU/512 MiB, pool10. K6 1020,420 s,
ventana externa 1027,010 s, exit99 por referencias; API exit0, perfil completo,
sin parada ni OOM. 1000 VU, 94 950 HTTP/93 982 válidas, 93,050 solicitudes/s.

| Métrica | Resultado |
| --- | --- |
| Login p50/p95/p99 | 147,487 / 2711,367 / 3297,090 ms |
| /me p50/p95/p99 | 308,035 / **1940,833 / 2641,435 ms**; incumple ambas referencias |
| Errores inesperados / 503 / cruces / duplicados / aceptación revocada | 0 observados |
| HTTP simultáneas / espera pool máxima / conexiones PG máximas | 552 / 412 / 11 |
| Bloqueados por lock máximos muestreados | 0; no prueba ausencia entre muestras |
| Argon2 espera / trabajo máximo / cola / rechazos | 1,104 / 310,314 ms / 0 / 0; 1001 hashes incluido dummy |
| CPU pico API / PG / k6 | 159,45 / 101,86 / 105,29 %; 100 % equivale a una CPU |
| RAM pico API / PG / k6 | 212,8 / 82,8 / 460,3 MiB |
| Cierre | 968 logouts 204 + 968 rechazos 401; 32 revocaciones residuales, 0 cuentas eliminadas |

579/580 muestras SQL de meseta completas, 978 muestras de servidor, 209 externas,
separación máxima de servidor 7035 ms. Auditoría: **9 sesiones creadas después de
300 s**, última 302,679 s; última respuesta login 303,197 s, primera actividad de
los 1000 completa a 304,332 s; primera revocación 900,025 s. Creación no equivale a
commit/visibilidad ni a respuesta: **no cumple diez minutos íntegros**. Se preservan
muestras incompletas y fechas, sin trasladar el inicio ni restar tiempos de reloj.

Ventana cgroup muestreada de meseta 590,158 s (no cubre sus extremos exactos):

| Componente | CPU usada media | Períodos estrangulados | Tiempo estrangulado acumulado | memory.max eventos al cierre de ventana |
| --- | ---: | ---: | ---: | ---: |
| API, límite2 | 1,111 CPU | 394/5904 | 12,443 s | 0 |
| PG, límite2 | 0,765 CPU | 9/5907 | 0,213 s | 0 |
| k6, límite1 | 0,481 CPU | 312/5909 | 135,915 s | 1175 |

Tiempo estrangulado acumulado no es porcentaje de latencia ni de saturación del
host. Sin OOM/oom_kill/high. PG deja de sufrir el estrangulamiento relevante de
una CPU; no hay evidencia para aumentar su RAM. En k6 sí hay intentos de asignación
por encima de memory.max y pausas de CPU: memoria y CPU requieren experimentos separados.

Host, 42 muestras CPU: mediana51,5 %, p95=93,9 %, máximo100 %; RAM libre mínima
2 129 108 992 bytes. Ocho muestras CPU≥80 % incluyen rampa, meseta y descenso:
no se presenta como host libre de saturación. A las 08:59:46, después de la carga,
CPU37 % y 3 053 396 KiB libres; Memory Compression=156 % y vmmemWSL=75 % en
contadores de proceso sin normalizar por ocho hilos. Esa captura posterior **no
identifica retrospectivamente** qué proceso produjo cada pico. Energía no se cambia.

Trazado /me incluye 92 014 respuestas válidas y 968 rechazos de cookie anterior:
wall acumulado 26 058 946,785 ms, pool 20 155 848,410 ms (**77,347 %**), SQL
5 632 685,132 ms. P95 wall/pool/SQL=973,074/867,821/140,286 ms; no se suman ni
restan percentiles. Frente al día17, wall/pool del servidor disminuyen, pero p95
cliente no mejora; no se atribuye toda la diferencia al generador sin aislarlo.
Las sentencias individuales tienen p95≈18–22 ms; COMMIT p99=51,173 ms. La evidencia
señala esperas acumuladas al adquirir conexiones, no un bloqueo SQL único demostrado.

## ID-LOAD-01, PG=2 / k6=2 CPU / k6=512 MiB

Único cambio de límite frente al perfil anterior: k6 1→2 CPU. Calentamiento
`sessions-warmup-05d1311e`:20 VU,67,483 s k6,231 HTTP/211 válidas,0 errores;
login p95=1711,691 ms, /me p95/p99=156,591/213,851 ms; limpieza0.

`sessions-2d658f62`, revisión `8170458`:1020,848 s k6/1025,406 s externos,
exit99/API0, completo sin paradas/OOM. 1000 VU,94 085 HTTP/93 116 válidas,
92,164 HTTP/s. Login p95=1823,044 ms; /me **p95=2002,655, p99=5063,915 ms**:
no mejora el cumplimiento. Cero errores inesperados,503,cruces,duplicados o
aceptaciones revocadas observados. 969 logouts/rechazos401 +31 revocaciones residuales.

573/576 muestras SQL de meseta completas; **5 creaciones después de300 s**, última
301,130 s; último login recibido301,453 s, primera actividad de todos301,902 s;
primera revocación900,020 s. 980 muestras servidor/205 externas, gap máximo6815 ms.
Las dos muestras iniciales tienen996/999 sesiones; la tercera, en865,007 s, tiene
1000 válidas/distintas pero **998 recientes**, con102 esperas de pool. No es solo
un fallo de arranque ni revocación/pérdida de cuentas. El crudo muestra213 intervalos
entre /me completados del cliente>15 s, máximo17 180 ms. No se retiene el mapeo de
las dos sesiones SQL: esos intervalos no prueban qué componente causó cada demora.
Picos HTTP550/pool414/conexiones11/lockWaiters0; Argon2 espera0,228/trabajo373,957 ms,
cola0/rechazos0. Picos CPU API/PG/k6=161,30/96,06/184,28 %; RAM209,2/86,44/461,3 MiB.

Meseta cgroup observada588,146 s: API406/5886 períodos y13,812 s estrangulados;
PG13/5883 y0,603 s; k6 **138/5884 y49,124 s**, frente a135,915 s con una CPU.
CPU media API/PG/k6=1,121/0,767/0,502. K6 `memory.max` delta1450 en esa ventana,
sin OOM/high; aumentar CPU no elimina el límite de memoria. Host41 muestras CPU:
mediana55 %,p95=95 %,máximo100 %, RAM libre mínima3 594 371 072 bytes. El mayor
margen RAM y los picos CPU del host se conservan como diferencias observadas;
no se atribuyen a la cuota k6 ni se afirma un experimento físico perfectamente controlado.

Servidor /me:92 116 respuestas (91 147 válidas+969 cookies revocadas), p95
wall/pool/SQL=886,643/794,789/143,912 ms; acumulados26 436 018,545/20 493 977,802/
5 671 488,346 ms. La discrepancia cliente/servidor requiere separar generador y
host; no se obtiene tiempo de interferencia restando sus percentiles.

## Retención de conexión identificada

Sonda optativa [ConnectionLeases](../../../load-tests/identity/connection-leases.ts),
commit `1cdc15c`, solo benchmark; ningún perfil HTTP la activa. Eventos acquire/release
y primera clase de sentencia, sin SQL/datos ni sustitución de release. Dos pruebas
PostgreSQL verifican reuso, duración, callbacks/release delegado, error y privacidad;
dos pruebas existentes de Diagnostics también pasan.

`resource-pg2-leases-20261018`, árbol posterior a `8170458` cuya fuente queda en
`1cdc15c` y en el paquete privado; mismas 50+2000 operaciones/100 concurrentes,
PG2/512 MiB, driver2/1 GiB, pool10, trazado/motor activos. 2000 concurrentes7590,411 ms;
2050 por clase,0 retenciones abiertas,0 errores de release.

| Préstamo | Sentencias por préstamo | Retención acumulada | Retención p95/p99 |
| --- | ---: | ---: | ---: |
| Snapshot inicial | 1 | 11 337,818 ms | 12,446/18,898 ms |
| Perfil | 1 | 11 446,155 ms | 12,743/19,038 ms |
| Aceptación transaccional | **6** | **53 259,135 ms (70,038 %)** | **54,482/85,037 ms** |

Destino concreto para optimización posterior: `PostgresSessionStore.accept`,
BEGIN→lock User→lock Session→snapshot fresco→UPDATE lastAcceptedAt→COMMIT, que retiene
la conexión entre sus seis consultas. No hay una sentencia aislada de segundos
demostrada ni bloqueos muestreados que expliquen toda la cola. El tiempo del préstamo
incluye red, backend y planificación de JavaScript; este control no atribuye los
incumplimientos HTTP íntegramente al código. No se aumenta pool ni se debilitan
locks, snapshot posterior a locks, renovación de actividad, seguridad o durabilidad.
Los candidatos anteriores retirados siguen conservados, sin reaplicarlos a ciegas.

## ID-LOAD-01, PG=2 / k6=2 CPU / k6=1 GiB

Solo k6 RAM512→1024 MiB respecto al perfil anterior, justificado por eventos
memory.max persistentes. Calentamiento `sessions-warmup-44e861e7`:20 VU,69,258 s k6,
229 HTTP/209 válidas,0 errores; login p95=1624,577 ms, /me145,675/218,686 ms; limpieza0.
Tras el benchmark opcional del motor se restablece el comando PostgreSQL base y se
reinicia su contenedor, conservando volumen/datos. No se fijan caches ni procesos
competidores; las comparaciones completas no prueban causalidad física exclusiva.

`sessions-9e047e55`, revisión `1cdc15c`, diff vacío:1020,345 s k6/1025,048 s externos,
exit99/API0, completo sin paradas/OOM. 1000 VU,93 930 HTTP/92 950 válidas,92,057 HTTP/s.
Login p95=2169,868 ms; /me **p95=2132,398,p99=3483,611 ms**, ambas referencias
incumplidas. Cero errores inesperados,503,cruces,duplicados o aceptaciones revocadas
observados. 980 logouts/rechazos401+20 revocaciones dirigidas,0 cuentas eliminadas.

**565/565 muestras SQL completas no acreditan continuidad**:13 sesiones se crean
después de300 s, última302,475 s; último login recibido303,416 s y primera actividad
completa305,177 s. Primera revocación900,144 s. Hay966 muestras servidor/209 externas,
gap máximo6474 ms. Picos HTTP545/pool459/conexiones11/lockWaiters0; Argon2 espera0,242/
trabajo246,351 ms,cola0/rechazos0. CPU pico API/PG/k6=161,80/113,87/161,07 %;
RAM211,8/81,81/501,3 MiB. No se interpreta 1000 VU como 1000 HTTP simultáneas.

Meseta cgroup observada592,996 s: API432/5931 períodos y14,536 s estrangulados;
PG12/5931 y0,368 s; k6 **130/5934 y46,850 s**. CPU media1,126/0,771/0,498.
K6 memory.max/high/OOM/oom_kill=0 en todas las muestras; elimina los eventos del
límite, **no el incumplimiento de latencias**. Host42 muestras CPU:mediana50 %,p95=95,85 %,
máximo100 %, RAM libre mínima3 427 340 288 bytes. Persisten picos del host compartido.

Lectura puntual k6 a09:38:50 -05:00 (391,322 ms de observación):anon450 371 584 bytes,
file85 491 712, presión some/full total0. `memory.max` con512 no prueba heap agotado:
incluye cargos/reclamación de caché del crudo. No hay desglose histórico equivalente
en512 MiB; no se atribuye su latencia a GC/reclaim sin medirlo. Servidor /me incluye
90 970 válidas+980 rechazos: wall/pool/SQL acumulado30 079 684,433/23 950 131,188/
5 851 887,030 ms; pool79,622 %; p95=994,449/898,463/144,255 ms.

## Comparación y conclusión de capacidad

API siempre2 CPU/1 GiB, PG siempre512 MiB, pool10, mismo protocolo y seguridad.
La referencia del17 es histórica, no un control pareado del18:

| Configuración PG CPU / k6 CPU / k6 RAM | /me p95/p99 ms | Login p95 ms | Creaciones después de300 s | Conclusión del escenario |
| --- | ---: | ---: | ---: | --- |
| Original1 /1 /512 MiB, día17 | 1879,178/3442,807 | 1712,688 | 6 | Incumple |
| 2 /1 /512 MiB | 1940,833/2641,435 | 2711,367 | 9 | Incumple |
| 2 /2 /512 MiB | 2002,655/5063,915 | 1823,044 | 5 | Incumple |
| 2 /2 /1 GiB | 2132,398/3483,611 | 2169,868 | 13 | Incumple |

Login p95, errores y controles funcionales observados satisfacen sus valores en
los tres perfiles nuevos; /me y continuidad íntegra incumplen. Se alcanzan1000
sesiones distintas, **no se demuestran1000 usuarios cumpliendo todo el escenario**.
Todos los resultados desfavorables se conservan; no se repite hasta conseguir aprobación.

Confirmado: cuota PG1 limita el control y PG2 mejora ~19 % su duración; en perfiles
completos PG2 casi elimina ese estrangulamiento, sin resolver capacidad. K6 CPU2
reduce pausas por cuota y RAM1 GiB elimina eventos memory.max, sin resolver latencias.
La transacción accept concentra70,038 % del tiempo de préstamo en el control real.
Incierto: contribución individual de Windows/VM/observador/generador al HTTP;
picos CPU100 % y equipo compartido impiden deducir un máximo físico de la aplicación.
No hay evidencia para aumentar RAM PG ni pool; no se añade caché, balanceador o servicios.

En los tres crudos:600 muestras VU de meseta, todas1000; todos los logins se
despachan antes de300 s (últimos299,934/299,967/299,966), pero12/5/16 respuestas
llegan después. No se confirma activación tardía del generador como causa directa.
Son marcas del script antes/después de HTTP, no de envío de bytes ni commit.
GET /me espera primer byte p95=1940,153/2002,101/2131,818 ms; recepción del cuerpo
p99=0,773/0,759/0,788 ms y bloqueo cliente p95≈1,7 ms. No respalda una demora
dominante descargando cuerpos; tampoco atribuye toda espera al SQL. Sin variables
HTTP/HTTPS/ALL_PROXY en los tres generadores; red efectiva bridge interna.
Máximos por ventana de event loop161,481/750,780/161,481 ms, resolución20 ms, no
p99 global. Publicación tras lectura SQL hasta4268/5079/4690 ms. CPU PowerShell
padre54,813/53,672/53,938 s, RAM pico≈112 MiB, ciclo p95=5798/6122/5775 ms;
excluye docker.exe/CIM/daemon y no cuantifica todo el sobrecosto del observador.

ID-LOAD-02 no se repite en esta tanda: conserva sus incumplimientos del
[día17](load-environment.md), sin extrapolarle los cambios de recursos de ID-LOAD-01.
**D10** debe confirmar actividad/muestra, umbrales, recursos objetivo y preparación
de sesiones respecto al inicio exacto de meseta. Cualquier cambio será prospectivo;
estos intervalos no se recortan/reinterpretan. Siguiente ensayo: separar k6 en otro
equipo disponible usando la [alternativa preparada](../../../load-tests/identity/separate-generator.md),
validar red/recursos/paradas remotas y luego contrastar la retención transaccional.
Falta ese equipo/acceso y validación; no se presenta como ejecutada ni se contratan servicios.

## Reproducción y verificaciones

En contexto Docker aislado vigente, [measure.ps1](../../../load-tests/identity/measure.ps1)
con `-Diagnostics`, cada variante precedida por `-Scenario sessions-warmup` y luego
`-Scenario sessions`, siempre nombres nuevos; sin EngineDiagnostics/V8:

| Comparación | Parámetros |
| --- | --- |
| PG1→2, k6 original | `-ResourceExperiment pg2` |
| k6 CPU1→2, PG2 fijo | `-ResourceExperiment pg2-k6-2` |
| k6 RAM512→1024, PG2/k6 CPU2 fijos | `-ResourceExperiment pg2-k6-2 -GeneratorMemoryMiB 1024` |

La opción RAM, commit `d602fa4`, exige override explícito, por defecto512 MiB y
assert de inspect; no cambia el Compose base. La sonda de préstamos `1cdc15c` se
activa únicamente con `LOAD_BENCH_LEASES=1` en el benchmark independiente. Las fuentes
de producto y los perfiles/umbrales originales permanecen intactos.

Docker: lint y build de ambos workspaces, lint de load-tests, dos tsconfig,
**14/14 controles Node** (12 runner+2 engine-report), **4/4 pruebas PostgreSQL**
(2 leases+2 Diagnostics), sin omitidos; benchmark2050 validado. Sintaxis PS5.1 pasa.
La primera comprobación de tipos en otro runner sin recompilar falló TS2305
(`credentialMetrics`, dist antiguo de la imagen); se conserva su log y se corrige
el orden de verificación **build→tsc en el mismo contenedor**. No se cambia el import
de fixtures, no se edita dist ni se ocultan tipos. No es la regresión integral T106.

## Recuperación y conservación

`smoke-sessions-b9be8f58`, recursos originales y observación base:2 VU,15,328 s k6/
20,022 s externos,10 HTTP/8 válidas,2 logouts204 y2 rechazos401. Cero errores/cruces/
503/aceptaciones revocadas; login p95=169,519 ms, /me33,849/33,872 ms.
Retorno funcional **tras reinicio de API por el runner**, no recuperación automática
ni SLA. Snapshot final:1120 User y SystemState sin cambios,0 sesiones válidas en
las tres cohortes; MailDelivery/Mailpit0. Limpieza repetida0 revocaciones/0 borrados.
Huellas de15 cuentas manuales,12 originales, credenciales/singleton idénticas;
cuatro servicios manuales running healthy. Ninguna restauración/purga manual.

PG efectivo vuelve a1 CPU/512 MiB; API conserva2 CPU/1 GiB. Smoke k6 usa1 CPU/
512 MiB. Servicios aislados detenidos, volúmenes conservados; contenedores históricos
de generador/control quedan detenidos como evidencia. Windows y Compose base intactos.
09:54:32 -05:00: corriente,CPU2 %,3 925 396 KiB libres,lectura2300 MHz, antes del
procesamiento de crudos. No se interpreta como telemetría continua de la carga.

Paquete privado `load-test-results/identity/t103-resources-20261018/`:209 archivos,
1 033 580 071 bytes, más manifiesto SHA-256 verificado; ACL exclusiva y archivos
solo lectura, sin fixtures.json/private.env copiados. SHA del manifiesto:
`3c162efe5fd5207754b069ceb71d95d1472854cc3cf86b33f082594524053a96`.
Incluye crudos/metadatos/diagnósticos/snapshots de8 ejecuciones, controles A/B/A y
retención, análisis/scripts reproducibles, huellas y capturas del host.
Los cinco paquetes históricos verifican68/152/102/95/7 archivos sin cambios.
818 enlaces locales y40 anclas correctos; git diff --check sin errores.

**Estado:** T103 [x] por ejecución/informe, capacidad sin aprobar,103/108 tareas
completadas; T104 en pausa. Bootstrap intermitente abierto para T106; T095 sigue CLI
sin programación activada; D13 sin SLA aprobado. No se cierra el spec.
