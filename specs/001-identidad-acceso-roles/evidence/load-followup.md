# T103 — motor SQL, generador y frontera de meseta

2026-10-16, ejecución automatizada; sin aceptación humana atribuida. Base `05cbbc1`,
árbol inicialmente limpio. Corrección previa del import aislada en `84b7ebe`:
[diagnóstico y verificación](load-import.md). Instrucciones y protocolo revisados;
checklist documental 16/16. No se adelanta T104.

## Reglas y evidencia conservadas

Se mantienen la [clasificación y mediciones anteriores](load-investigation.md),
[ID-LOAD-01/02](../verification.md#escenario-de-carga-id-load-01-1000-sesiones-activas)
y [D10](../../../docs/decisiones-pendientes.md): /me p95<500 ms/p99<1000 ms,
login p95<3000 ms, errores<1 % siguen siendo referencias provisionales, no rúbrica
aprobada. Cero cruces/duplicados/aceptaciones indebidas son exigencias funcionales.
La meseta sigue siendo [300,900), completa: no se descarta una frontera desfavorable.
El control anterior ID-LOAD-01 conserva 805.894/1379.327 ms y seis creaciones tardías.
589/589 muestras completas no prueban diez minutos íntegros. No se alteran muestras,
cuotas, pausas, duraciones, seguridad ni clasificación para aprobar.

Se verificaron SHA-256/tamaño de los 68 archivos originales (364 278 827 bytes) y
los 152 de la primera investigación (706 212 076 bytes); ambos paquetes intactos.
Entorno reutilizado exclusivamente `identity-load-80c2b6fa22ce`, red interna sin
puertos, BD marcada, schema t_load_identity y volumen privado. API/driver 2 CPU/1 GiB,
PostgreSQL 1 CPU/512 MiB, k6 1 CPU/512 MiB, pool 10, misma laptop/VM: no es producción
ni generador independiente. Las huellas de las 15 cuentas manuales, 12 originales,
credenciales y singleton coinciden antes/después de la corrección del import.

## Instrumentación adicional y límites

[Procedimiento reproducible](../../../load-tests/identity/README.md#observación-del-motor-postgresql-y-frontera-de-meseta).
La extensión pg_stat_statements y tiempos de planificación/I/O/WAL son opcionales
del Compose aislado. No se amplían roles del runtime ni conexiones. fsync,
synchronous_commit y full_page_writes permanecen on, shared_buffers=128 MiB.
Se instala solo un schema de observación en esa BD; no se migra ni restaura manual.

El lector exporta agregados por clase sin SQL/queryid/parámetros/filas. Contadores
WAL/I/O son del clúster aislado y pueden publicarse con retraso: no se atribuyen
exclusivamente a una solicitud. Tiempos pg_stat_statements no sustituyen tiempos
de COMMIT vistos desde cliente ni toda su espera de durabilidad. No se suman
percentiles. Las máximas de sentencia son acumuladas, no máximas del intervalo.
El reportero declara su ventana y rechaza reinicios/expulsiones registrados.

API conserva CPU/event loop y reloj civil frente a monotónico sin envolver pg en
modo EngineDiagnostics; el trazado de cliente solo se activa con Diagnostics.
Ese modo también guarda un perfil V8 privado, con su sobrecosto declarado.
El generador conserva cuotas y registra dispatch/recepción de login por slot y
reloj civil frente a duración k6. No es un reloj externo ni un perfil de GC de Go.
La captura externa añade Stopwatch, cgroups de API/BD/k6 y recursos originales.

Se observó una discrepancia de tiempo civil durante las pruebas (lote Vitest
iniciado 20:29:48 UTC, duración 179 s; siguiente lote iniciado 21:20:23 UTC).
No se conoce su causa ni se extrapola a cargas históricas. Una sonda Windows
posterior de 60 s observó diferencias civil/monotónico de 3.65–4.61 ms; no garantiza
estabilidad futura. Las nuevas capturas permiten detectar discontinuidades.

## Ensayos dirigidos: resultados incluidos, también desfavorables

No son perfiles HTTP: cada uno crea otro schema t_*, 100 pares sintéticos, 50
recorridos seriales y 2000 a concurrencia 100, usando repositorios reales y
comprobando identidad/renovación. Sin logins HTTP ni Argon2 durante la ventana
medida. Mismos límites del driver/BD y pool; sin otras pruebas durante ese tramo.

| Variante / archivo privado | Sentencias por recorrido | 2000 operaciones a concurrencia 100, ms | p95 recorrido, ms | p95 espera pool, ms | p95 SQL cliente, ms | WAL sync del intervalo, ms |
| --- | --- | --- | --- | --- | --- | --- |
| Base, engine-baseline-02 | 8 | 19271.456 | 1763.815 | 1599.719 | 190.877 | 6021.285 |
| CTE de bloqueos, engine-locks-01 | 7 | 19328.203 | 1732.603 | 1502.722 | 194.950 | 6682.434 |
| Preparadas, engine-prepared-01 | 8 | 33537.603 | 2643.313 | 2365.970 | 305.750 | 14478.574 |
| Control posterior original, engine-control-01 | 8 | 19871.117 | 1596.713 | 1403.276 | 188.168 | 6844.925 |

Base: 1 692 560 ms acumulados de pool frente a 1 891 047 ms de recorrido, 89.50 %.
Bloqueos separados: 39 790 ms cliente frente a 1123 ms de planificación/ejecución
interna sumadas. No identifica toda la diferencia como red ni convierte espera del
pool en prueba de que aumentar conexiones resuelva la presión.

El primer candidato combinaba User→Session en una CTE materializada, manteniendo
snapshot posterior. 104/104 regresiones aprobaron, incluida la carrera de bloqueos,
pero no mejoró el tiempo total: **retirado**. Parche y métricas preservados;
no se repite hasta favorecerlo ni se presenta como corrección entregada.

La línea base midió 3995.095 ms de planificación y 2133.733 ms de ejecución.
Segundo candidato: seis consultas preparadas por conexión en la lectura y aceptación,
sin cachear filas/permisos ni cambiar orden de locks/snapshot, transacciones o SQL.
Planificación: 135.835 ms (−96.60 %), 424 planes frente a 12 300; ocho sentencias
por recorrido permanecen. Eso demuestra menos trabajo de planificación, **no una
mejora de latencia**: la ejecución total empeoró mientras aumentó WAL sync.
CPU del driver de benchmark: 18.62→34.17 s acumulados; event loop máximo
72.29→124.85 ms en sus ventanas. No se atribuye esa diferencia solo a SQL o disco.
Un único control posterior con los dos archivos de producto de `84b7ebe` montados
de solo lectura regresó a 19.87 s. No demuestra mejora del candidato: **también
retirado**, con parche/resultados conservados. No se atribuye todo su deterioro
a WAL, CPU o generador. El producto queda igual a `84b7ebe`; los planes preparados
no se entregan como corrección de capacidad. El control no revirtió el árbol ni tocó manual.

Corrección del import: además de sus 9/9 fixtures, pasan 120/120 unitarias/arquitectura
y 12/12 controles del runner. Consultas preparadas: 177/177 regresiones reales de
sesiones, guardas, login/logout, cambios de acceso y administración, sin omitidas;
incluye comprobar User bloqueado mientras espera Session y revalidar revocación,
versión, rol y expiración después de la espera. No son aceptación humana ni T106.
Tras retirar ambos candidatos, verificación Docker final: generación/build API y
ambos tsconfig, lint API/web/herramientas, 120/120 unitarias/arquitectura, 12/12
controles del runner, 2/2 del reportero y 22/22 de store/diagnóstico/motor. Build web
anterior válido reutilizado, sin cambios web. Producto original contrastado con Git.

Fallos de preparación conservados: primera lectura reservada de shared_preload_libraries
rechazada antes de medir; se eliminó sin conceder pg_read_all_settings. El primer
postprocesado rechazó un descenso float8 de 2.2737×10⁻¹³ ms en una suma sin nuevas
llamadas. Se registra la corrección de redondeo (8 epsilon de máquina, no tolerancia
de capacidad); un descenso real sigue impidiendo comparar. Sus dos controles pasan.
Intentos de shell sin política de ejecución y salida Compose mezclada con JSON se
conservan como fallos de postprocesado; no se repitió por ello el ensayo físico.

## Smoke de instrumentación

`smoke-sessions-6a33832d`, revisión b34b7ee: 2 VU, 10 solicitudes/8 válidas,
dos logouts y dos rechazos de cookie anterior, cero errores; 1120 cuentas/singleton
intactos y limpieza 0/0. Generador 20.301 s, ventana externa completa 47.732 s;
perfil V8 privado producido con nombre correcto. No acredita carga ni recuperación automática.
API registró salto civil/monotónico de unos 75 s **antes** de startedAt; durante
la ventana completa civil=47732.3 ms/Stopwatch=47736.2 ms, sin ese salto; rango
de diferencia API 75001.8–75017.4 ms. Se conservan muestras anteriores y posteriores.
No se desplaza ni recorta la futura meseta por esa observación.

El modo HTTP/CPU inicial publicaba ceros de SQL/pool sin instalar su traza.
Esos valores del smoke significan **no medidos**. Se corrige antes del perfil:
sqlTracing=false y campos SQL/pool omitidos; se conserva latencia HTTP. Dos pruebas
de diagnóstico Docker y lint, más ambos chequeos TypeScript Windows, aprobados.
No se sobrescriben los archivos del smoke ni se llama cero al dato desconocido.

## Repetición perfilada interrumpida

`sessions-warmup-62fbd809`, revisión a110e79: 20 VU/20 sesiones/1 min completo,
67.423 s de generador, 219 solicitudes/199 válidas; 20 logouts, errores/cruces/503=0.
/me p95/p99=261.816/450.466 ms; **login p95=5077.182 ms**, referencia incumplida,
exit99. Hash espera máxima2043.688 ms/cola16/trabajo máximo617.184 ms; sin parada
de seguridad. Se conserva sin repetir hasta aprobar. El protocolo no impone que
ese percentil sea condición de parada; se continuó solo con propósito diagnóstico.

`sessions-fa658d02`, misma revisión, producto original e instrumentación/V8:
**incompleto**, exit108 a152.174 s, dos timeouts HTTP de login de10 s que activan
el aborto por login único fallido. No se llegó a la meseta; no es ejecución de17 min.
403 VU observados, pico muestreado364 sesiones/usuarios/secretos recientes,
HTTP en vuelo213, espera de pool203, conexiones10, locks0. 3226 solicitudes,
dos errores (0.062 %), cruces/503=0. /me p95/p99 parcial4322.437/6549.859 ms;
login p95 parcial5498.504 ms. **No comparar esos percentiles de rampa incompleta
como si fueran otro perfil completo.** No hubo cierres/revocaciones funcionales
en este intento: sus contadores cero no demuestran rechazo tras logout.

Auditoría de ventana384 sesiones persistidas; limpieza405/0, incluyendo las creadas
al drenar pendientes después de finishedAt. La API cerró con0, sin OOM/stop.json.
1120 cuentas y singleton intactos. Hash espera307.937 ms/cola3/trabajo1600.871 ms,
sin rebasar espera5 s. Picos observados CPU/RAM: API202.85 %/186.5 MiB,
BD100.9 %/100.6 MiB, k6107.4 %/330.2 MiB. No se atribuyen timeouts a memoria agotada.

Handler /me p95=4119.902 ms (marginal, no correlación por solicitud), también alto;
no hay evidencia de que todo el problema esté fuera de API. Perfil V8 completo
del proceso:95097 muestras/187.804 s; idle50.78 %, writev7.62 %, writeBuffer2.69 %,
GC1.60 %. 2065 huecos>10 ms, máximo296.377 ms: no interpretar muestras como msCPU
ni inferir GC del generador. En la ventana SQL hubo22.351 s acumulados de WAL sync;
no son todos los tiempos de COMMIT ni prueban una causa única. Reloj k6 civil/run
varió de−103.692 a6.740 ms; no se observó salto multisegundo como el previo al smoke.

Para separar el sobrecosto del V8 se vuelve opt-in explícito con CpuProfile;
EngineDiagnostics conserva observación SQL/HTTP/cgroups sin ese perfilador.
Cuotas, seguridad y carga no cambian. Se programa **un solo calentamiento de
control sin V8**, sin borrar los resultados desfavorables ni atribuir aún su causa.

## Control sin V8 y condiciones que impiden concluir capacidad

`sessions-warmup-4897754d`, revisión f074ae0, cpuProfile=false: mismo programa20 VU/
20 cuentas/1 min, generador69.328 s; 222 solicitudes/202 válidas,20 logouts y20
rechazos401 de cookie anterior. Errores/cruces/503=0, limpieza0/0, cuentas/singleton
intactos. **Login p95=4256.207 ms, aún incumplido**; /me p95/p99=217.104/288.461 ms.
Hash espera2185.356 ms/cola15/trabajo máximo486.595 ms, sin parada de seguridad.
API CPU/RAM116 %/156 MiB, BD95.41 %/83.75 MiB, k67.8 %/21.79 MiB, sin OOM.
La diferencia con V8 no prueba una causa única; quitarlo no resolvió la referencia.
Ese control demuestra retorno funcional tras reiniciar API después del aborto,
con latencia desfavorable. No demuestra recuperación automática ni un SLA.

Lecturas posteriores del host: inicialmente batería17 %; registro de22:32:04 UTC
batería15 %, PowerOnline=false/Discharging=true, plan **Power Saver**, frecuencia
1400 MHz frente a MaxClockSpeed2300 MHz, PercentProcessorPerformance60. Son
observaciones posteriores, **no telemetría histórica del T103 original**. Confirman
una condición de energía/rendimiento que limita la comparación; no demuestran que
explique por sí sola los fallos originales o actuales. No se cambia el plan de energía.
Inspección posterior de BD sin autovacuum activo; no se atribuye a este los fallos.

| Componente | Conclusión respaldada / límite |
| --- | --- |
| Pool/API | Espera real89.50 % acumulada en benchmark; cola203 y handler p95≈4.12 s en rampa. Presión confirmada, no justifica aumentar conexiones. |
| PostgreSQL | Costos internos de planificación, ejecución y WAL medidos; cuota1 CPU con picos cercanos al límite. Sin aislamiento causal de CPU, disco, red y observador. |
| Argon2 | No se rebasó espera5 s; parámetros, cola y concurrencia conservados. No fue la condición que abortó el perfil. |
| Generador | CPU pico107.4 % y330.2/512 MiB en intento; sin OOM. Falta control en otro host y perfil de Go para separar sus interferencias. |
| Continuidad | Nueva ejecución termina a152 s; no evalúa frontera300 s ni meseta. Las seis creaciones tardías anteriores permanecen abiertas. |
| Observación | V8 separado y SQL no medido omitido. Se agregan ENGINE_MONITOR/ENGINE_SETTINGS/ACTIVITY_MONITOR para cuantificar el lector; prueba dirigida real y privacidad aprobadas. Ese desglose no se capturó en los intentos anteriores. |

No se repite otra carga completa: ambos candidatos carecen de mejora demostrada y
el control continúa desfavorable. Para concluir faltan una ventana documentada de
alimentación/frecuencia estables, un control del generador independiente y del costo
del observador, y una ejecución íntegra con dispatch/recepción bajo1000 VU. D10 debe
confirmar rúbrica y tratamiento de frontera; mientras tanto [300,900), muestras y
umbrales originales se conservan. ID-LOAD-02 anterior se reutiliza como evidencia
histórica válida del código sin cambios; no garantiza el rendimiento del host actual.

## Conservación y cierre del seguimiento

Repetición de limpieza dirigida 0/0. Snapshot final: 1120 cuentas, digest de User y
singleton conservados y cero sesiones válidas en las tres cohortes; no se borran
cuentas ni volúmenes. Las 15 manuales, 12 originales y credenciales conservan ambas
huellas iniciales. Servicios del ensayo detenidos; los cuatro manuales saludables.
Paquete nuevo privado `load-test-results/identity/t103-followup-20261016/`: 102 entradas,
33 694 930 bytes, ACL privada y manifiesto SHA-256 verificado. Incluye crudos,
metadatos, CPU/SQL/recursos, auditorías, derivados y parches de candidatos retirados;
no copia fixtures.json/private.env. Los dos paquetes anteriores vuelven a verificar
sus 68/152 entradas sin cambios. No se reemplazan resultados desfavorables.

Comprobaciones finales adicionales: prueba de costo/privacidad del motor 1/1 Docker,
lint de herramientas y ambos tsconfig Windows aprobados. Se reutilizan build/lint
y regresiones descritos arriba porque el código de producto quedó igual a 84b7ebe.
510 enlaces locales y git diff --check comprobados; no push ni merge.

**T103 conserva [x] como ejecución
e informe; capacidad y cierre del spec no aprobados.** D10 continúa pendiente,
T104 requiere participantes, bootstrap intermitente sigue abierto para T106,
T095 permanece CLI sin programación y D13 no tiene SLA de recuperación aprobado.
