# Carga de identidad: preparación T099–T102

Herramientas locales para [ID-LOAD-01/02](../../specs/001-identidad-acceso-roles/verification.md#escenario-de-carga-id-load-01-1000-sesiones-activas).
No acreditan capacidad hasta ejecutar y evaluar T103. No miden matrícula, clases,
video o chat ni predicen producción. D10/rúbrica siguen pendientes.

## Entorno aislado y fixtures

### Tipos del editor y artefactos de la API

Los scripts Node 22 con `--experimental-strip-types` importan la API compilada
(`apps/api/dist/src/**/*.js`), no sus fuentes con decoradores o propiedades de
parámetro. TypeScript usa las declaraciones `.d.ts` que emite el mismo build.
No se versiona ni se edita `dist/` o `apps/api/generated/`.

En Windows, desde la raíz y con Node/npm de las versiones indicadas abajo:

```powershell
npm.cmd ci --no-audit --no-fund
npm.cmd run load:identity:typecheck
```

El segundo comando genera el cliente Prisma offline (sin conectar ni migrar una
BD), compila la API y comprueba ambos proyectos de carga. Ejecutarlo tras cambiar
fuentes de API; un build dentro de Docker no publica esos archivos en Windows.
Si VS Code conserva el diagnóstico, seleccionar **TypeScript: Select TypeScript
Version → Use Workspace Version**, y **TypeScript: Restart TS Server**. Debe
desaparecer TS2307 del import `../../apps/api/dist/src/infrastructure/testing/identity-fixtures.js`;
no basta reiniciar el editor si aún falta el build. También deben estar instalados
los tipos de Express del lockfile: una instalación local antigua no equivale a
la imagen Docker.

En un runner aislado usar `npm run load:identity:typecheck` antes de las pruebas;
Compose monta los manifiestos y tsconfig vigentes. Sus artefactos quedan dentro
del contenedor. `npm ci` y la preparación del editor no se ejecutan contra cuentas,
datos ni volúmenes manuales.
Diagnóstico y comprobaciones: [import de fixtures](../../specs/001-identidad-acceso-roles/evidence/load-import.md).

Requiere Docker Desktop, Windows PowerShell 5.1, Node 22.23.1 y la imagen local API
construida según [quickstart](../../specs/001-identidad-acceso-roles/quickstart.md).
k6 está fijado a `grafana/k6:1.6.0`; comprobar `version` y digest en cada entorno.
El binario probado declara `v1.6.0+dirty`, commit `d97957fc61-dirty`, Go 1.25.6;
se registra ese resultado real, no una compilación limpia supuesta.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File load-tests/identity/setup.ps1
```

[setup.ps1](setup.ps1) imprime la ruta de un contexto privado en `.cache/identity-load-*`.
Leerlo como `$ctx`, y construir el prefijo Compose (no imprimir private.env):

```powershell
$ctx = Get-Content -Raw <ruta-context.json> | ConvertFrom-Json
$dc = @('compose','--project-name',$ctx.project,'--env-file',$ctx.envFile,'-f',$ctx.composeFile)
docker @dc run --rm --no-deps runner -c 'npm run build --workspace apps/api && node --experimental-strip-types load-tests/identity/prepare.ts'
docker @dc run --rm --no-deps generator version
```

Crea otro proyecto, red bridge interna sin puertos, BD/volumen y volumen privado
nuevos; no monta datos/secretos manuales. API y generador son contenedores distintos.
API 2 CPU/1 GiB, BD 1 CPU/512 MiB, k6 1 CPU/512 MiB; pool 10. Comparten la laptop
y VM Docker: declarar contención. Guardar capacidad real de host/VM y disco, no
solo los límites. Los originales manuales no participan.

[prepare.ts](prepare.ts) reutiliza guardas T029 y el cargador/criptografía existentes.
Exige test, db:5432, BD *_test, schema t_load_*, marcador de BD aislada, origen local,
Mailpit sin relay y destino efectivo coincidente. Crea **1000** alumnos para sesiones,
**20** de calentamiento y **100** aparte para autenticación: 1120 IDs/correos/contraseñas
distintos. Todos activos/verificados; Argon2id m=19456/t=2/p=1, sal distinta; no reutiliza
un hash ni genera sesiones de carga. Los logins k6 son reales. No se envían correos.
El manifiesto 0600 vive en volumen privado/directorio 0700, fuera de Git; se guarda
antes de insertar para recuperación dirigida. Si se interrumpe, no sobrescribir:
inspeccionar y limpiar explícitamente. No hay limpieza global ni borrado de volúmenes.

## Perfiles completos para T103

### Experimentos locales de recursos

[compose.resources.yml](compose.resources.yml) se aplica solo al proyecto aislado de
carga. `measure.ps1 -ResourceExperiment baseline` conserva la configuración original;
`pg2` cambia solo PostgreSQL de 1 a 2 CPU, `k6-2` solo k6 de 1 a 2 CPU y `pg2-k6-2`
permite un segundo experimento de k6 después de fijar PostgreSQL a 2 CPU. Memoria,
pool, seguridad, código y perfiles siguen iguales. Comparar una sola diferencia por
vez, precedida de control comparable; no usar el override en desarrollo/producción.
Una mejora con más recursos no aprueba la configuración original.

Los metadatos etiquetan la variante y los límites efectivos; las muestras externas
guardan RAM libre del host y CPU/frecuencia/alimentación cada cinco ciclos, con costo
CIM registrado. Si falta margen, se conserva el resultado y no se aumenta otra cuota.

### Condiciones del host antes de repetir

Ejecutar [host-preflight.ps1](host-preflight.ps1) antes y después, fuera de la ventana
medida. Solo consulta alimentación/plan, CPU, RAM, procesos y capacidad de Docker;
guarda un JSON nuevo con ACL privada bajo `.cache/identity-host-*`. No cambia Windows,
no inicia Docker y no considera un fallo de lectura como cero consumo.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File load-tests/identity/host-preflight.ps1
```

Mantener alimentación y plan elegidos por el operador, evitar suspensión y cargas
competidoras durante toda la prueba; registrar cambios, no asumir condiciones pasadas.
Una lectura puntual de frecuencia no demuestra limitación sostenida ni temperatura.
Si Docker está apagado, comprobar sus recursos efectivos tras iniciarlo. Comenzar
por smoke/calentamiento; investigar cualquier incumplimiento antes del perfil completo.
Para separar contención del generador se preparó una
[alternativa con otro equipo](separate-generator.md), todavía no ejecutada.
El muestreo externo registra CPU/RAM del PowerShell padre y duración de sus ciclos;
excluye procesos hijos Docker/CIM y el costo interno de observar la API. No permite
afirmar por sí solo que la observación carece de efecto.
Resultado real de esta comprobación y límites:
[entorno y capacidad, 2026-10-17](../../specs/001-identidad-acceso-roles/evidence/load-environment.md).

[sessions.js](sessions.js): un VU/cuenta por `execution.vu.idInTest`, login único sin
reintento silencioso, cookie propia conservada con noCookiesReset, /me cada 5–10 s y
headers reales Origin/CSRF. Probar revocación con la cookie anterior solo al cerrar,
fuera de meseta. La retirada de un VU puede impedir logout: se cuenta solo el realizado.
La limpieza posterior no acredita revocación durante la meseta.

El calentamiento es **otra ejecución** con 20 cuentas y 20 VU por 1 min. Medición:
0→100/1 min→500/2 min→1000/2 min, meseta 10 min y descenso 2 min: 17 min, más hasta
15 s de gracia para acabar iteraciones. El monitor comprueba sesiones válidas,
usuarios y hashes distintos y actividad en los últimos 15 s; k6 registra slots de
VU realmente validados en meseta. No deducir sesiones de VU configurados ni RPS.

[authentication.js](authentication.js): otras 100 cuentas, login/me/logout/pausa 5 s,
escalones **constantes** de 10/25/50/100 VU por 2 min cada uno (8 min + hasta 15 s de
gracia). Los cambios de escalón duran 0 s; no hay una rampa escondida entre ellos.
No se sustituye por 1000 logins simultáneos. No añade comprobaciones 401 por ciclo;
la revocación se verifica aparte del tráfico válido.

Ejecutar secuencialmente, solo cuando se trabaje T103:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File load-tests/identity/measure.ps1 -ContextFile <ruta-context.json> -Scenario sessions-warmup
powershell -NoProfile -ExecutionPolicy Bypass -File load-tests/identity/measure.ps1 -ContextFile <ruta-context.json> -Scenario sessions
powershell -NoProfile -ExecutionPolicy Bypass -File load-tests/identity/measure.ps1 -ContextFile <ruta-context.json> -Scenario authentication
```

Los perfiles conservan umbrales del spec: /me p95<500 ms, p99<1000 ms; login p95<3 s;
errores inesperados<1%, cero cruces/revocaciones aceptadas/duplicados. Alcanzar 1000
sesiones válidas distintas durante la meseta es requisito independiente; el reporte
no convierte una muestra de 1000 en diez minutos demostrados. Son umbrales provisionales
hasta D10, sin afirmar aprobación de la rúbrica.

## Verificación técnica y métricas

[smoke.js](smoke.js) es un programa independiente de 2 VU × 2 iteraciones, con los
mismos clientes; no cambia los perfiles completos. `measure.ps1` admite
`smoke-sessions` y `smoke-authentication`. Un smoke aprobado no aprueba T103 ni 1000 VU.

[serve.ts](serve.ts) ensambla la API real únicamente en el ensayo. Registra cada segundo
conteos agregados de BD, sesiones/actividad, conexiones/locks visibles al runtime,
pool, HTTP en vuelo y contadores Argon2/cola del mismo proceso. No crea endpoints de
diagnóstico ni guarda URLs, cookies, hashes de sesión, cuentas o contraseñas en telemetría.
El cambio de producto es una lectura de contadores numéricos en infraestructura de
credenciales; conserva concurrencia 2, cola 50, espera 5000 ms y parámetros de hash.

[measure.ps1](measure.ps1) guarda revisión/diff, hashes de scripts/lock, imágenes/digests,
SO/CPU/RAM/disco, red/límites y estadísticas Docker de API/BD/generador (CPU/RAM/IO/red).
IO/red en el resumen son la última observación de contadores Docker, no tasas; pueden
reiniciarse al salir el contenedor. Conservar la serie cruda y bytes enviados/recibidos
de k6. El resumen distingue el tiempo del generador del tiempo externo de orquestación.
El intervalo externo depende de Docker/CIM; los timestamps permiten declarar huecos.
El observador comparte CPU/pool con API: declarar ese costo. k6 registra RPS,
p50/p95/p99 por operación, estados/503 y errores; 401 esperado de revocación va aparte.
Contadores Argon2 informan duración de trabajo, espera, cola y rechazos; no incluyen
identidades ni se usan para alterar la autenticación.

Se detiene ante espera de hash **>5000 ms**, menos de 128 MiB libres en cgroup API,
menos de 256 MiB disponibles en Windows, OOM o fallo de monitor/Docker. Estos márgenes
son de seguridad del ensayo, no umbrales de capacidad. El watchdog cierra la aplicación;
el orquestador detiene k6 y conserva resultado parcial/fallo. No silenciar 503 ni
reducir Argon2 para continuar. Si existe stop.json, investigar antes de otra ejecución.
La prueba negativa usa [watchdog-fixture.ts](watchdog-fixture.ts), con
LOAD_WATCHDOG_TEST=1 y acción inject, dentro del runner aislado mientras corre un smoke;
debe abortar, registrar el motivo y revocar sobrantes. La acción archive solo archiva
una señal con testInjected=true; rechaza retirar paradas reales. Esta prueba no es
una reproducción de falta de RAM ni una medición de saturación.

Crudos/resúmenes en volumen privado `/load-private`; metadatos, diff y recursos externos
en el directorio `.cache` privado del contexto. No copiar fixtures.json ni logs crudos
a evidencia compartida. [summarize.mjs](summarize.mjs) produce solo agregados y conserva
exit code, abortos y huecos. `executionComplete`/`completeProfile` comprueban duración
completa y ausencia de interrupción; `thresholdsPassed` informa los umbrales aparte.
Una salida k6 99 puede significar duración completa con umbrales incumplidos.
[details.mjs](details.mjs) desglosa estados HTTP, latencias por operación/escalón y
duplicados observados, leyendo exclusivamente los crudos después del ensayo:

```powershell
docker @dc run --rm --no-deps runner -c 'node --experimental-strip-types load-tests/identity/details.mjs <nombre-ejecucion>'
docker @dc run --rm --no-deps runner -c 'node --experimental-strip-types load-tests/identity/audit-run.ts <nombre-ejecucion>'
```

Los snapshots incluyen cantidades de MailDelivery por estado (sin destinatarios).
[audit-run.ts](audit-run.ts) contrasta sesiones creadas/usuarios/secretos distintos en
la ventana del ensayo, sin leer credenciales ni modificar datos; cuenta también
MailDelivery y mensajes capturados por Mailpit. El estado revocado consultado después
incluye la limpieza dirigida; no acredita revocación durante meseta.
En T103, copiar solo los archivos de ejecuciones elegidas y telemetría numérica a
`load-test-results/identity/`, con ACL privada y manifiesto SHA-256; conservar también
el volumen original. No copiar fixtures.json ni private.env al paquete de resultados.
Usar la
[plantilla](report-template.md) para T103, sin inventar resultados.

## Limpieza dirigida y comprobaciones

`measure.ps1` detiene API y revoca sesiones sobrantes al acabar, también tras fallo;
informa esa limpieza separada de los logouts. Conserva las 1120 cuentas.
Una terminación forzada del host puede impedir finally; reanudar con limpieza dirigida
antes de repetir. No se promete limpieza automática tras apagar Docker o el equipo.
Para limpieza explícita posterior:

```powershell
docker @dc run --rm --no-deps runner -c 'node --experimental-strip-types load-tests/identity/cleanup.ts sessions'
docker @dc run --rm --no-deps runner -c 'node --experimental-strip-types load-tests/identity/cleanup.ts accounts'
docker @dc stop
```

[cleanup.ts](cleanup.ts) valida destino/manifiesto/asociación ID-correo dentro de una
transacción; solo revoca sesiones de ese lote o borra sus relaciones/cuentas si se
pide accounts. Repetir no añade efectos. FK ajena impide la limpieza y revierte; nunca
resetea SystemState ni modifica cuentas ajenas. Se conserva el manifiesto para auditar.
No usar down -v sobre desarrollo/manual ni hacer purgas generales.

```sh
# En runner aislado: compilar primero para usar la instrumentación actual, no la imagen antigua.
npm run build --workspace apps/api
npx eslint -c load-tests/identity/eslint.config.mjs load-tests/identity
npx tsc -p load-tests/identity/tsconfig.json
npx tsc -p load-tests/identity/tsconfig.strip.json
node --experimental-strip-types --experimental-vm-modules --test load-tests/identity/tooling.test.mjs
npx vitest run --config apps/api/vitest.config.ts load-tests/identity/fixtures.spec.ts --maxWorkers=1
```

La prueba de contador/limpieza usa 1000 sesiones **sintéticas solo en su schema de test**;
no acredita 1000 logins ni carga y nunca alimenta k6. Los controles del runner usan
dobles de HTTP/reloj y se distinguen de los smokes reales. Evidencia:
[preparación de carga](../../specs/001-identidad-acceso-roles/evidence/load-preparation.md).

Referencias oficiales: [opciones y cookies k6](https://grafana.com/docs/k6/latest/using-k6/k6-options/reference/),
[identificador de VU](https://grafana.com/docs/k6/latest/javascript-api/k6-execution/),
[TypeScript Node 22](https://nodejs.org/download/release/v22.23.1/docs/api/typescript.html).
T104 requiere participantes; bootstrap permanece abierto para T106. T095 sigue CLI
sin programación de purga; D13 conserva custodia/objetivos pendientes, sin SLA aprobado.

## Investigación posterior de T103

`measure.ps1 -Diagnostics` conserva perfiles, pausas, cuotas y umbrales originales;
añade cgroup CPU para API/BD/k6 y diagnóstico dentro del proceso API. Guarda
`<ejecucion>-diagnostics.json`: espera de adquisición de conexión, tiempo de sentencias
visto desde pg (incluye red/backend), número de sentencias, tiempo por ruta y event loop.
Solo cantidades/estadísticos; nunca SQL, parámetros, resultados, cookies o identidades.
La instrumentación consume CPU/RAM y sus muestras comparten pool: declarar ese costo.
Los conteos incluyen timestamps de lectura PostgreSQL separados del timestamp publicado;
no se desplaza por ello el inicio de la meseta.

Ensayo dirigido antes/después, **sin afirmar capacidad HTTP**:

```powershell
docker @dc run --rm --no-deps -e LOAD_BENCH_NAME=<nombre-unico> diagnostic-bench -c 'npm run build --workspace apps/api && npx vitest run --config apps/api/vitest.config.ts load-tests/identity/session-benchmark.spec.ts --maxWorkers=1'
docker @dc run --rm --no-deps runner -c 'npm run build --workspace apps/api && node --experimental-strip-types load-tests/identity/continuity-audit.ts <nombre-ejecucion-sesiones>'
docker @dc run --rm --no-deps -e RESULT_NAME=<nombre-unico> generator run --out json=/load-private/<nombre-unico>-raw.jsonl /scripts/clock.js
```

El benchmark usa otro schema de test, 100 pares cuenta/sesión sintéticos del fixture
existente, 50 recorridos secuenciales y 2000 a concurrencia 100; verifica identidad y
renovación con las clases reales. API/driver 2 CPU/1 GiB y pool 10; BD 1 CPU/512 MiB.
No inicia sesión HTTP, no mide Argon2 y no sustituye las cohortes reales de k6.
La calibración de reloj usa 1000 VU/30 s, sleep 5 s, sin HTTP: cuantifica deriva en
esa carga mínima, no la precisión bajo el perfil HTTP completo. La auditoría de
continuidad es solo lectura; no reconstruye actividad reciente a partir de la
última marca de sesión. Usar nombres nuevos y conservar todos los resultados.

`LOAD_BENCH_TRACE=off` omite solo la instrumentación pg del benchmark; mantiene los
mismos recorridos y comprobaciones de acceso. No omite controles de producto.
[diagnostic-report.mjs](diagnostic-report.mjs) lee el directorio archivado y nombre
de ejecución; conserva ventanas de CPU cgroup, última IO con PIDs>0 y ambas bases
temporales de meseta. [query-plan.ts](query-plan.ts), tras el ensayo y sobre un destino
validado, ejecuta EXPLAIN ANALYZE del lookup real y guarda solo nodos/índices/tiempos;
omite condiciones/valores privados. Un plan en reposo no caracteriza consultas bajo carga.
Seguimiento y límites: [investigación T103](../../specs/001-identidad-acceso-roles/evidence/load-investigation.md).

### Observación del motor PostgreSQL y frontera de meseta

[compose.engine.yml](compose.engine.yml) habilita opcionalmente pg_stat_statements,
planificación y tiempos I/O/WAL **solo en el proyecto aislado de carga**. Reinicia
su BD conservando volumen, CPU/RAM, pool y durabilidad. No usar el Compose manual.
Con API/ensayos detenidos y `$dc` definido como arriba:

```powershell
$engineDc=$dc+@('-f','load-tests/identity/compose.engine.yml')
docker @engineDc up -d --wait db
Get-Content -Raw load-tests/identity/prepare-engine.sql | docker @engineDc exec -T db psql -U postgres -d academia_v00_test
docker @engineDc run --rm --no-deps -e LOAD_BENCH_NAME=<nombre-nuevo> diagnostic-bench -c 'npm run build --workspace apps/api && npx vitest run --config apps/api/vitest.config.ts load-tests/identity/session-benchmark.spec.ts --maxWorkers=1'
powershell -NoProfile -ExecutionPolicy Bypass -File load-tests/identity/measure.ps1 -ContextFile <context.json> -Scenario sessions-warmup -EngineDiagnostics
powershell -NoProfile -ExecutionPolicy Bypass -File load-tests/identity/measure.ps1 -ContextFile <context.json> -Scenario sessions -EngineDiagnostics
```

[prepare-engine.sql](prepare-engine.sql) exige marcador/BD aislados antes de crear
la extensión en un schema de observación; no cambia cuentas ni privilegios de
escritura del runtime. [engine.ts](engine.ts) exporta agregados por clase, nunca SQL,
queryid, parámetros, resultados o identidades. El benchmark captura antes/después;
API lo hace cada cinco muestras completas (no exactamente cinco segundos si espera
pool). Añade event loop, CPU y comparación de reloj civil/monotónico sin envolver pg,
salvo que también se pida `-Diagnostics`. Todo el costo de observación se declara.
Añadir `-CpuProfile` junto con `-EngineDiagnostics` para conservar
`<ejecución>-cpu.cpuprofile` privado del proceso Node API,
para identificar funciones que consumen CPU; no perfila los workers nativos Argon2
ni constituye una ejecución sin sobrecosto del perfilador.
Desde esta separación el modo EngineDiagnostics solo no activa V8. Los primeros
ensayos b34b7ee/a110e79 sí lo activaban; se preservan como ensayos perfilados.
[cpu-report.mjs](cpu-report.mjs) resume muestras por función, incluyendo idle/GC y
los huecos del muestreo; sus porcentajes no son milisegundos CPU ni latencias HTTP.

[engine-report.mjs](engine-report.mjs) calcula deltas con ventana explícita; rechaza
reinicios de contadores. Las máximas por sentencia son acumuladas, no percentiles
del intervalo. Estadísticas database/WAL pueden publicarse con retraso; I/O abarca
el clúster aislado, no una operación exclusiva. No deducir espera de disco de bytes.
ENGINE_MONITOR/ENGINE_SETTINGS/ACTIVITY_MONITOR incluyen el costo del propio lector;
su sentencia actual aparece desde la siguiente muestra. Los primeros ensayos no
capturaron ese costo por clase: dato no medido, no cero.
Restaurar configuración base con `docker @dc up -d --wait db` solo tras detener API;
la extensión queda en la BD aislada para reproducir observación, no en manual.

Las métricas `identity_login_dispatch_ms`/`identity_login_received_ms` registran
offsets por slot de VU antes/después de su HTTP login; no incluyen cuentas.
`identity_wall_vs_run_ms` compara reloj civil con la duración de ejecución de
[k6/execution](https://grafana.com/docs/k6/latest/javascript-api/k6-execution/).
No cambian rampas, pausas, cuotas, login único ni el intervalo [300,900) de meseta.
Una activación tardía conserva su fallo aunque todas las muestras posteriores sean 1000.
