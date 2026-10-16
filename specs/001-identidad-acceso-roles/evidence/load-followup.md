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

| Variante / archivo privado | Sentencias por recorrido | 2000 concurrentes, ms | p95 recorrido, ms | p95 espera pool, ms | p95 SQL cliente, ms | WAL sync del intervalo, ms |
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

## Estado

La instrumentación corregida/validada justifica una sola repetición diagnóstica
completa de ID-LOAD-01 con el producto original y calentamiento independiente:
es necesaria para obtener motor/CPU/dispatch bajo 1000 VU, no para aprobar un
candidato rechazado. Pendiente registrar sus resultados finales. **T103 conserva [x] como ejecución
e informe; capacidad y cierre del spec no aprobados.** D10 continúa pendiente,
T104 requiere participantes, bootstrap intermitente sigue abierto para T106,
T095 permanece CLI sin programación y D13 no tiene SLA de recuperación aprobado.
