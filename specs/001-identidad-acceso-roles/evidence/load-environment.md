# T103 — capacidad del entorno y separación de límites

2026-10-17, ejecución automatizada; sin aceptación humana atribuida. Base `f86cc8c`,
árbol inicial limpio, sin AGENTS.md aplicable ni hooks; checklist documental 16/16.
[Protocolo](../verification.md#escenario-de-carga-id-load-01-1000-sesiones-activas),
[preparación](load-preparation.md), [informe original](load.md),
[primera investigación](load-investigation.md) y [seguimiento](load-followup.md)
conservados. No se modifica código de producto ni se adelanta T104.

## Condiciones que se contrastan

| Perfil | Actividad, muestra y duración originales |
| --- | --- |
| Calentamiento | Otras 20 cuentas, 20 VU durante 1 min; hasta 15 s de gracia. |
| ID-LOAD-01 | 1000 cuentas STUDENT activas/verificadas, una por VU; login real único al activarse, cookie propia persistente y /me cada 5–10 s. Rampa 0→100/1 min→500/2 min→1000/2 min; 1000 durante 10 min; descenso 2 min. Total 17 min más gracia. |
| ID-LOAD-02 | Otras 100 cuentas; login→/me→logout→pausa 5 s; escalones constantes 10/25/50/100 VU, 2 min cada uno, total 8 min más gracia. No exige 1000 logins simultáneos. |

La meseta sigue siendo **[300,900)**; no se retrasa para ocultar activaciones tardías.
Se requieren sesiones válidas, usuarios/secretos distintos y actividad reciente;
VU configurados, VU observados y solicitudes HTTP en vuelo son magnitudes diferentes.
Muestras completas posteriores no acreditan la frontera ni todo el intervalo.

Los escenarios de carga y referencias /me p95<500 ms, p99<1000 ms, login p95<3000 ms
y errores inesperados<1 % siguen **provisionales, pendientes de D10/rúbrica**. No se
promueven a capacidad aprobada. Cero cruces de identidad y aceptación tras revocación
también corresponden a requisitos funcionales aprobados (FR-018/019, SC-002/003/004);
los conteos sin duplicados de carga no sustituyen las pruebas de concurrencia SC-006.
SC-008 (19/20 accesos UI<3 s) pertenece a T105 y no se evalúa con percentiles HTTP.

Paradas originales: espera Argon2>5000 ms, margen API<128 MiB, RAM Windows<256 MiB,
OOM o monitor no disponible. Se conservan abortos por login/me fallido y timeout HTTP
10 s. No se cambia carga, duración, pool, cuotas, seguridad ni umbrales.

## Equipo, energía y observación

Inicio 07:05 -05:00: cargador conectado, batería 86 %, PowerOnline=true/Charging=true,
plan clásico Power Saver, lectura 1400 MHz. Docker apagado. Se inicia Docker Desktop
sin cambiar Windows/WSL ni recursos y se reanudan los cuatro servicios manuales
existentes, sin build/restauración/purga. Quedan saludables.

07:08:23: PowerOnline=true, plan informado por `powercfg /getactivescheme`
**Alto rendimiento**, lectura 2300 MHz/PercentProcessorPerformance 120. El operador
confirma cargador, selección de Equilibrado y suspensión con corriente desactivada
temporalmente; se conserva esa declaración separada de las lecturas del plan clásico.
Las capturas 07:15:31 y 07:18:56 siguen informando Alto rendimiento/2300 MHz y corriente.
El agente no cambia planes, suspensión ni procesos de Windows.
Capturas 07:38:15 y 07:51:01 conservan corriente/plan clásico Alto rendimiento/2300 MHz.
Son muestras antes/después, no una serie continua de frecuencia durante carga.

Ryzen 7 3750 H/8 hilos, RAM de Windows: 14 966 218 752 bytes; Docker 29.8.1, 8 CPU y
7 236 882 432 bytes. Antes del perfil completo: 2 695 507 968 bytes libres Windows.
Lectura puntual de competidores: vmmemWSL≈3.30 GB, Code≈103 MB y sqlservr≈732 MB;
contadores de CPU no normalizados por los ocho hilos. No prueban contención sostenida
ni ausencia de ella. Frecuencia nominal puntual no mide temperatura, potencia ni
rendimiento sostenido. No hay telemetría histórica de energía de los perfiles del 16.

Mismo proyecto aislado `identity-load-80c2b6fa22ce`, BD marcada, schema t_load_identity,
red interna sin puertos y volúmenes propios. API 2 CPU/1 GiB, PostgreSQL 1 CPU/512 MiB,
k6 1 CPU/512 MiB, pool 10. 1120 fixtures reales conservados: 1000+20+100; cero sesiones
válidas antes del control. Node 22.23.1/PostgreSQL 16.14, lock e imágenes registrados
por ejecución. Argon2id `m=19456/t=2/p=1/hash=32`, concurrencia 2/cola 50/espera 5000 ms intactos.

Instrumentación `ced8494`: [preflight de solo lectura](../../../load-tests/identity/host-preflight.ps1)
con JSON nuevo privado; observador externo registra CPU/RAM del PowerShell padre y
duración de ciclo. Excluye docker.exe, CIM y motor Docker: no se presenta como costo
total del observador. La API conserva observación base cada segundo; diagnóstico
dirigido y perfil usan trazado pg/HTTP y cgroups existentes, **sin V8 ni motor SQL
opcional**. No se hacen builds, regresiones o análisis de crudos durante la medición.
Lecturas de progreso reutilizan los archivos externos ya capturados.
Lock SHA-256 `6f2c05e1f0f7fa2e0f084ac7977f4360e9260814728e0590db82bced925a6292`;
digests API/PG/k6 coinciden con el [informe original](load.md). k6 informa 1.6.0+dirty,
`d97957fc61-dirty`/Go 1.25.6, no una compilación limpia supuesta.

## Controles y decisión de continuar

| Control, ambos 20 VU/1 min | Observación base `sessions-warmup-2079217e` | Diagnóstico `sessions-warmup-bbc21cf1` |
| --- | ---: | ---: |
| Duración generador / externa, s |68.251 /75.610|68.054 /70.606|
| Login p95/p99, ms |**5081.585** /5096.694|1762.820 /1772.177|
| /me p95/p99, ms |218.198 /297.273|194.716 /370.104|
| HTTP total / tráfico válido |218 /198|224 /204|
| Errores /503/cruces/revocación aceptada |0 /0/0/0|0 /0/0/0|
| Logouts 204 /cookie anterior 401 |20 /20|20 /20|
| Hash espera máxima /trabajo máximo, ms |2811.137 /599.626|982.400 /212.193|
| Cola máxima /rechazos hash |17 /0|13 /0|
| k6 CPU pico /RAM, MiB |4.72 % /21.97|7.84 % /22.57|
| Exit k6/API; limpieza revocadas/borradas |99 /0;0/0|0 /0;0/0|

El primer control **incumple login** y se conserva. Se investiga con el mismo
calentamiento, añadiendo diagnóstico y reiniciando API según el runner; no se cambia
código ni se repite silenciosamente hasta aprobar. En el segundo, 20 logins tienen
28 sentencias cada uno: wall total 25779.937 ms, espera pool 3792.241 ms y SQL cliente
10405.412 ms acumulados. p95 de esas magnitudes 1617.772/305.033/733.508 ms, **no sumables**.
Los picos instantáneos del monitor (pool waiting 0) no prueban espera temporal nula.
El trabajo hash total pasa de 7046.194 a 2856.912 ms (21 operaciones, incluido dummy).
Confirma variación de servicio/cola; no identifica su causa única ni demuestra una
corrección de aplicación o que el diagnóstico acelere la API. El primer control no
tenía tiempos pg por solicitud; no se reconstruyen retrospectivamente.

El control dirigido actual satisface las referencias, no hay parada de seguridad ni
presión de RAM/k6 observada a 20 VU. Se habilita un intento íntegro ID-LOAD-01 con la
misma observación diagnóstica. No se extrapola el margen del generador a 1000.

## Perfiles completos y auditoría

**ID-LOAD-01 `sessions-809fcfb3`, `ced8494`, diff vacío:** completo,1020.659 s k6 /
1026.962 s externos; k6 exit 99 por referencias de latencia, API 0, sin parada/OOM.
Mismos recursos y código funcional; no se presenta como una corrección de capacidad.

| Resultado | Medición actual |
| --- | ---: |
| VU pico /muestras nativas de meseta |1000 /600, todas con 1000 VU|
| Sesiones/usuarios/secretos/actividad recientes máximos |1000/1000/1000/1000|
| Muestras SQL de meseta completas |**510/511**; primera incompleta 995|
| HTTP en vuelo pico /pool esperando pico |500 /394|
| HTTP total /tráfico válido /RPS total |94918 /93951 /92.997|
| Login 200 /me 200 /logout 204 /cookie anterior 401 |1000 /91984 /967 /967|
| Login p50/p95/p99, ms |119.227 /1712.688 /2628.730|
| /me p50/p95/p99, ms |329.454 /**1879.178 /3442.807**|
| Logout p95/p99, ms, sin umbral propio |2091.660 /2196.751|
| Errores inesperados /503/cruces/revocación aceptada/duplicados observados |0 /0/0/0/0|
| Espera hash /trabajo máximo, ms; cola /rechazos |0.303 /245.210;0 /0|
| Conexiones PostgreSQL /waiters de locks pico |11 /0|
| API CPU pico /RAM, MiB |156.36 % /217.5|
| PostgreSQL CPU pico /RAM, MiB |88.37 % /80.21|
| k6 CPU pico /RAM, MiB |102.67 % /469.1|
| Cierre logout /limpieza adicional /borradas |967 /33 /0|
| Muestras servidor /externas; hueco servidor máximo |915 /220;6124 ms|

Los 1000 logins fueron despachados **antes** de 300 s, último 299.927. No se confirma
activación posterior a la frontera como causa de este incumplimiento. Ocho respuestas
de login llegan después de 300 s, última 301.326; seis filas se crean después,
última 300.972. Primera revocación 900.203; el último VU completa su primer /me a 302.136. Ejemplos:
slot 1000 despacho 299.684/respuesta 301.188/creación 300.826; slot 999
299.927/301.326/300.972. No equiparar creación con commit/visibilidad/respuesta.
La primera muestra observa 995 aunque a su publicación el historial de createdAt
ya cuenta 1000: no reconstruye el snapshot MVCC anterior.

Las 600 muestras de VU=1000 y los 1000 slots con /me en meseta **no aprueban** las 1000
sesiones durante diez minutos íntegros. Se conservan inicio, muestras desfavorables
y todo el descenso. Reloj civil menos duración k6: −93.293..0.852 ms en 91984 puntos;
calibración posterior SQL offset 0 ms/RTT 2 ms. No es un reloj independiente ni autoriza
tolerancias o correcciones retrospectivas de la frontera.

La ruta servidor /me tiene 92951 mediciones, incluidas 967 comprobaciones 401:
wall total 44515613.206 ms; pool 38502351.889 ms, **86.49 % acumulado**; SQL cliente
5747865.760 ms. Wall p95/p99=1623.449/2817.667 ms, pool 1530.212/2729.412 ms y SQL
140.751/192.053 ms. No se suman ni restan percentiles ni se comparan denominadores
distintos como pares. El retraso también existe dentro de la API; no puede atribuirse
exclusivamente al transporte/generador. Hay 736839 sentencias:91984×8 +967×1.
Login wall/pool/SQL p95=1610.110/1275.619/375.151 ms. Esperar una conexión es el
componente inmediato predominante; esto no identifica por sí solo el origen último
ni justifica ampliar el pool. No hubo presión de cola Argon2 en este perfil.

| ID-LOAD-01 comparable como historial, no experimento causal | /me p95/p99 ms | Continuidad |
| --- | ---: | --- |
| Original `sessions-a99bc32c` |1551.978/2794.672|518/520 muestras completas; cuatro creaciones tardías|
| Control anterior sin trazado `sessions-985379d4` |805.894/1379.327|589/589 muestras, pero seis creaciones tardías, última 300.935|
| Nuevo diagnóstico `sessions-809fcfb3` |1879.178/3442.807|510/511 muestras; seis tardías, última 300.972|

Energía histórica no registrada, condiciones de host y observación diferentes:
no atribuir el cambio de percentiles solo a código, plan de energía o trazado.
Los dos candidatos de rendimiento retirados en la investigación anterior siguen
retirados. No hay una corrección funcional nueva justificada por estas mediciones.

**ID-LOAD-02 `authentication-67c9a6cf`, `ced8494`, diff vacío:** completo,
486.669 s k6 /491.858 s externos,100 VU;3749 ciclos completos/11247 solicitudes,
23.110 RPS. Las 3749 sesiones tienen 100 usuarios y secretos distintos por sesión;
el máximo muestreado de sesiones válidas es 35 y HTTP en vuelo 70, no 1000.

| Operación /control | Resultado |
| --- | --- |
| Login p50/p95/p99, ms |354.151 /2345.105 /3092.906|
| /me p50/p95/p99, ms |73.765 /**922.552 /1340.189**|
| Logout p95/p99, ms, sin umbral propio |366.480 /526.154|
| HTTP 200 login/me,204 logout |3749 /3749 /3749|
| Errores inesperados/503/cruces/duplicados observados |0 /0/0/0|
| Hash espera/trabajo máximo, ms; cola/rechazos |2075.467 /385.224;40 /0|
| Hash completados /trabajo acumulado, ms |3750 incluido dummy /342718.753|
| Pool esperando /conexiones /locks pico |32 /11 /0|
| API CPU pico/RAM MiB; PostgreSQL; k6 |200.36 %/177.3;73.55 %/86.12;24.62 %/62.5|
| Muestras servidor/externas; hueco máximo |480 /107;2425 ms|
| Exit k6/API; limpieza revocadas/borradas |0 /0;0/0|

El runner nativo solo fija login y controles comunes en ID-LOAD-02; su exit 0 y
thresholdsPassed=true **no aprueban /me**. Se contrastan explícitamente las dos
referencias y ambas fallan en esta ejecución. El control anterior sin trazado
`authentication-86e0dd66` conserva sus resultados favorables: login 1819.693 ms y
/me 387.734/663.772 ms. Cambian observación y condiciones de equipo; no hay una
regresión funcional/cambio de producto nuevo demostrado ni una comparación causal
que atribuya esa diferencia solo al trazado.

Login por escalón, usando el timestamp final de cada solicitud (un ciclo puede
cruzar frontera): 10/25/50/100 VU →236/577/1138/1764 logins, p95
394.917/475.449/801.308/2749.390 ms. Gracia:34 logins, p95**3034.678 ms**.
Se incluyen períodos desfavorables en el percentil global; el protocolo no define
un umbral independiente por escalón/gracia. Estados inesperados por operación 0.

## Separación de límites medidos

Ventanas cgroup: ID-LOAD-01 12:20:15.441–12:37:16.227 UTC (k6 hasta 12:37:12.233);
ID-LOAD-02 12:39:42.873–12:47:48.978 (k6 hasta 12:47:44.893).

| Perfil/componente | CPU usada, µs | Períodos limitados/total | throttled_usec |
| --- | ---: | ---: | ---: |
| ID-LOAD-01 API |977873992|628/9951|22920339|
| PostgreSQL |606821557|1832/9627|222451239|
| k6 |370796785|393/10165|176099064|
| ID-LOAD-02 API |484188908|1483/4603|134248531|
| PostgreSQL |169609750|434/4182|34114904|
| k6 |39860709|6/4711|393883|

Son deltas de cuota/CPU, no porcentajes causales de latencia ni prueba de saturación
continua. Los porcentajes Docker anteriores usan 100 % por CPU lógica; API tiene dos.

| Componente | Confirmado /lo que falta para separar causas |
| --- | --- |
| Equipo |Corriente y plan/frecuencia puntuales registrados, sin OOM ni parada RAM. Faltan temperatura/potencia y serie continua de frecuencia/CPU de competidores; no se prueba incapacidad física de la laptop ni que energía explique los fallos anteriores.|
| Aplicación/pool |10 conexiones ocupadas, hasta 394 en cola; espera 86.49 % del wall acumulado de /me en ID-LOAD-01. En ID-LOAD-02, wall /me p95=901.846 ms, pool 745.326 y SQL 194.146. La demora existe dentro del servidor; no hay bug nuevo ni aumento de conexiones justificado.|
| PostgreSQL |Cuota 1 CPU y períodos limitados medidos, locks observados 0. Esta corrida no captura tiempos internos de planificación/I/O/WAL: SQL cliente no separa motor, red, durabilidad o planificación del host. La evidencia interna anterior corresponde a sus propias ventanas.|
| Argon2 |ID-LOAD-01: cola 0/espera 0.303 ms, no explica la espera larga de pool de esa fase. ID-LOAD-02: espera 2075 ms/cola 40, sin superar límites ni rechazos. Criptografía conservada.|
| Generador |1000 VU y despachos antes 300 s, sin OOM; cuota 1 CPU limita períodos y RAM pico 469.1/512 MiB. /me http_req_blocked p95/p99=1.549/4.866 ms; no mide todo GC/scheduling de Go. Falta generador externo/reloj independiente para excluir interferencia compartida.|
| Observación |Sin V8 ni motor SQL opcional. PowerShell padre 54.641 s CPU/pico 109.44 MiB en ID-LOAD-01;24.531 s/108.61 MiB en ID-LOAD-02. Ciclo p95=5419.534/5654.220 ms, incluye esperas Docker y no representa CPU. Excluye hijos/CIM/daemon; no es costo total ni prueba de ausencia de interferencia.|

En la vida instrumentada de API, su cgroup usa 980.195 s CPU y Node 812.064 s en
ID-LOAD-01; diferencia 168.131 s de otros procesos/actividad del cgroup, incluidos
healthchecks/watchdog, sin desglose causal. ID-LOAD-02:487.680/406.504 s, diferencia
81.176 s. Incluyen arranque/cierre, ventanas distintas de k6; no se resta ese tiempo
a percentiles ni se atribuye todo al lector SQL. Falta un control que aísle salud,
watchdog y trazado manteniendo la seguridad.

Event loop máximo por ventana 105.578/166.724 ms, resolución 20 ms, no p99 global.
Publicación tras lectura SQL hasta 4313/1247 ms. API civil−monotónico al cierre
−216.748/−63.664 ms en su vida; k6 −93.293..0.852 y−17.910..0.192 ms durante tráfico.
Sin referencia independiente; no autoriza alterar umbrales/fronteras.
Inventario posterior de 49 contenedores conservados: no identifica otro nombre de
proyecto activo solapado con ID-LOAD-01; runner-1 nunca iniciado. No reconstruye
procesos efímeros ya eliminados ni sustituye medición completa del host.

## Recuperación, conservación y reproducibilidad

`smoke-sessions-781108a5`, observación base:2 VU,17.527 s k6/19.847 s externos,
10 HTTP/8 válidas, dos logouts 204 y dos rechazos 401 de cookie anterior. Cero errores,
cruces/503/aceptaciones revocadas; login p95=177.617 ms, /me 33.115/33.822 ms.
Retorno funcional **tras el reinicio de API que hace el runner**, no recuperación
automática, perfil completo ni SLA.

Auditorías: ID-LOAD-01 crea 1000 sesiones/usuarios/secretos,967 logouts+33 revocaciones
dirigidas; ID-LOAD-02,3749 sesiones/secretos para 100 usuarios, todas cerradas.
MailDelivery vacía/Mailpit 0. Snapshots conservan 1120 User y SystemState; final con
cero sesiones válidas en las tres cohortes. Repetición de limpieza 0/0, cuentas
borradas 0. Huellas de las 15 manuales,12 originales/credenciales y singleton idénticas.
Cuatro servicios manuales saludables; ensayo detenido sin borrar volúmenes.

Reproducción: [measure.ps1](../../../load-tests/identity/measure.ps1), contexto
aislado vigente, secuencialmente `sessions-warmup` sin flags, `sessions-warmup
-Diagnostics` por diagnóstico del fallo, `sessions -Diagnostics`, `authentication
-Diagnostics`, `smoke-sessions` sin flags. Revisión
`ced8494d1b70538e3de29cd20f7a50d6e5c97378`, diff de código vacío en cinco metadatos;
este informe se redacta aparte. Guardas, cohortes y limpieza existentes reutilizadas.

Build API real en preparación/arranque/cierre,12/12 controles del runner sin omitidos
y sintaxis PS5.1 aprobados. Tipos, lint/build y regresiones de producto reutilizados
del [seguimiento anterior](load-followup.md): no cambian fuentes de aplicación,
SQL, dependencias ni frontend. No es la regresión integral T106.

Paquete privado `load-test-results/identity/t103-environment-20261017/`:
95 archivos/386274223 bytes más manifiesto SHA-256 verificado, ACL privada, sin
fixtures.json/private.env. Análisis final en `t103-environment-analysis-20261017/`:
7 archivos/39290 bytes verificados, campos de continuidad/login único solo para
ID-LOAD-01, omitidos en otros perfiles. Los derivados previos quedan conservados.
El postprocesador inicial confundía logins repetidos de ID-LOAD-02 con login único;
se corrigió offline sin repetir ni modificar perfiles/crudos/umbrales. Datos crudos
y percentiles contrastados con resumen nativo por details.mjs en los cinco ensayos.
Los tres paquetes anteriores verifican 68/152/102 archivos sin cambios.
526 enlaces locales comprobados; git diff --check sin errores.

## Límites y siguiente decisión

Servidor, generador y observación comparten laptop/VM: falta un control independiente
para separar interferencias del host, k6, Docker y la observación. Se prepara una
[alternativa con otro equipo disponible y SSH](../../../load-tests/identity/separate-generator.md),
sin contratar servicios ni tocar Windows automáticamente. Falta disponer de ese
equipo/acceso y validar conectividad, cuotas/digests, captura y propagación de parada
remota en smoke; el runner actual solo orquesta k6 local. No se presenta como ejecutada.

D10 debe acordar distribución/actividad de los 1000 usuarios, duración, latencias,
errores y evidencia; además precisar la preparación/autenticación previa frente al
comienzo exacto de la meseta. Mantener [300,900) conserva los incumplimientos previos;
cualquier protocolo distinto debe aprobarse y ejecutarse prospectivamente, sin
recortar diez minutos, excluir períodos desfavorables ni reinterpretar estos datos.
Identidad no acredita matrícula, clases, video, chat ni producción.

**No se demostraron 1000 usuarios cumpliendo todo el escenario original.** Se
alcanzaron 1000 sesiones y ambos perfiles terminaron; fallan continuidad íntegra y
p95/p99 de /me. Login p95, errores y controles funcionales observados satisfacen
sus valores en los perfiles completos. No se prueba incapacidad física del equipo:
falta separar generador/observador y resolver D10 para una aceptación de capacidad.

T103 conserva [x] por ejecución/informe, **no por capacidad aprobada**. T104 en pausa,
bootstrap intermitente abierto para T106, T095 CLI sin programación activada y D13
sin SLA aprobado. La aceptación final del spec permanece abierta.
