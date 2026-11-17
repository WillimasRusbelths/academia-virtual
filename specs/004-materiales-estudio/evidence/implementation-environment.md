# Entorno de implementación — T002

Fecha: 2026-11-16, America/Lima. Alcance ejecutado: preparación T001–T004.

Se reutiliza [el harness](../../../ops/docker/test-harness.md): PostgreSQL real,
base `academia_v00_test`, owner `academia_v00_owner`, runtime
`academia_v00_runtime` sin CREATE y esquema aleatorio `t_<suite>_<random>`.
`identityDatabase()` migra el esquema de la suite y elimina únicamente ese esquema.
No ejecutar reset, db push, bootstrap, TRUNCATE fuera de fixtures ni down -v.
No se modifica `.env`, el override manual, cuentas, puertos o datos existentes.

## Estado observado

- Node host v22.23.1 y npm.cmd 10.9.8, dependencias existentes del lockfile.
- Rama real `feat/003-reservas-ordenes-matricula`; puntero Spec Kit 004.
- Docker Linux no accesible: falta la tubería `dockerDesktopLinuxEngine`.
  No se inició Docker ni se aplicaron migraciones. PostgreSQL/E2E quedan sin probar.
- PowerShell restringe scripts `.ps1`: usar `npm.cmd` y, para el chequeo de
  prerrequisitos, `powershell -NoProfile -ExecutionPolicy Bypass -File
  .specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`.
  Bypass afecta solo ese proceso; no cambia la política del equipo.
- Vitest necesitó ejecución fuera del sandbox por `spawn EPERM`; la ejecución
  autorizada terminó con 6/6 pruebas del corpus. No usó red, BD o cuentas.

## Comprobaciones sin servicios

Desde la raíz, sin instalar paquetes o generar secretos:

```powershell
npm.cmd exec --workspace @academia/api -- vitest run tests/integration/materials-files.spec.ts
npm.cmd exec --workspace @academia/api -- eslint tests/support/materials-files.ts tests/integration/materials-files.spec.ts
```

`materials-files.spec.ts` está en integración para acompañar al corpus de futuras
pruebas PostgreSQL; esta suite por sí sola no abre conexiones. No demuestra rutas,
permisos, carga ni descarga del producto. Corpus generado en memoria bajo demanda;
no subir binarios de 20 MB al repositorio.

## Comandos preparados para integración futura

Cuando Docker Linux esté disponible, usar un proyecto **nuevo**, configuración
privada nueva y sin puertos publicados. Nunca conectar el runner al entorno manual.
Crear el archivo privado con escritura exclusiva, sin copiar secretos existentes:

```powershell
New-Item -ItemType Directory -Force .cache/materials | Out-Null
@'
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');
let text = fs.readFileSync('.env.example', 'utf8').replaceAll('\r\n', '\n');
for (const key of ['POSTGRES_PASSWORD', 'ACADEMIA_OWNER_PASSWORD',
  'ACADEMIA_RUNTIME_PASSWORD', 'PROBE_OWNER_PASSWORD', 'PROBE_RUNTIME_PASSWORD']) {
  text = text.replace(new RegExp('^' + key + '=$', 'm'), key + '=' + randomBytes(32).toString('hex'));
}
for (const key of ['MAIL_PAYLOAD_KEY', 'RATE_HMAC_KEY', 'TEST_MAIL_PAYLOAD_KEY', 'TEST_RATE_HMAC_KEY']) {
  text = text.replace(new RegExp('^' + key + '=$', 'm'), key + '=' + randomBytes(32).toString('base64'));
}
fs.writeFileSync('.cache/materials/trial.env', text, {flag: 'wx', mode: 0o600});
'@ | node
if ($LASTEXITCODE -ne 0) { throw 'No se creó configuración nueva; conservar el archivo previo.' }
$materialsProject = 'materials-trial-' + [guid]::NewGuid().ToString('N').Substring(0,12)
$materialsCompose = @('compose', '--project-name', $materialsProject,
  '--env-file', '.cache/materials/trial.env', '-f', 'compose.yml',
  '-f', 'ops/docker/compose.regression.yml', '-f', 'ops/docker/compose.identity-tests.yml')
docker @materialsCompose config --quiet
docker @materialsCompose --profile tests build api web browser-tests
docker @materialsCompose up -d --no-build --wait db mailpit api web
docker @materialsCompose exec -T api npm run lint
docker @materialsCompose exec -T api npm run build
docker @materialsCompose exec -T api npm run test:unit
docker @materialsCompose exec -T api npm run test:integration
# Detener solo este proyecto, conservando su volumen:
docker @materialsCompose down
```

Detener la secuencia si un comando falla. Conservar el nombre del proyecto para
reanudar con el mismo archivo privado; nunca reutilizar `academia-local` ni ejecutar
el generador otra vez sobre una BD persistente. El override CA manual no se añade
automáticamente: si el build necesita CA, revisar el procedimiento existente y
usar únicamente el secret público de CA en el proyecto de ensayo.

La configuración de navegador específica de materiales se creará en T030. No
ejecutar una configuración inexistente ni afirmar aceptación por construir imágenes.
Los fixtures usarán únicamente `@example.test` y Mailpit; sin proveedor de pagos.
Sin demo persistente, publicación, prueba de capacidad D10 o cierre operativo D13.

## Ejecución posterior T005–T008

El 2026-11-16 se inició Docker Desktop existente y se creó el proyecto
`materials-trial-92aba908-04a`, independiente de los proyectos anteriores. Solo se
levantó PostgreSQL 16.14, sin puerto publicado. Credenciales nuevas en
`.cache/materials/trial.env` (ignorado); no se leyó ni reutilizó el entorno privado manual.
Motor Linux 29.8.1, Compose 5.5.1. Cada suite creó y eliminó sus propios esquemas.

Se reutilizó la imagen local `academic-offering-fa3d46bddbb8-api:latest`, ID
`sha256:c13d8310193527418bb97f706420959e5ba9dc33815f6e99a46d179ed8fc68a8`,
para sus dependencias Linux. Un servicio efímero `materials-runner`, en
`.cache/materials/compose.runner.yml`, monta `apps/api/{src,tests,prisma}` del
checkout como solo lectura en `/workspace/apps/api/`. Generación/build escriben
solo en la capa efímera del runner, sin reemplazar dependencias o builds del host.
No se descargaron dependencias ni se reconstruyeron imágenes.

El runner recibe APP_ENV=test, variables TEST_/PROBE_ con base
`academia_v00_test` en `db:5432`, roles de ensayo y claves nuevas. `MAIL_MODE=capture`
y `MAIL_FROM=academia@example.test`; Mailpit no se levantó porque estas suites no
envían correo. No hay gateway de pagos ni puerto HTTP de aplicación.

Reanudar este proyecto existente con su misma configuración privada:

```powershell
$materialsProject = Get-Content .cache/materials/trial-project.txt
if ($materialsProject -notmatch '^materials-trial-[a-f0-9-]+$') { throw 'Proyecto de ensayo inválido.' }
$materialsCompose = @('compose', '--project-name', $materialsProject,
  '--env-file', '.cache/materials/trial.env', '-f', 'compose.yml',
  '-f', 'ops/docker/compose.regression.yml', '-f', '.cache/materials/compose.runner.yml')
docker @materialsCompose up -d --no-build --wait db
docker @materialsCompose run --rm --no-deps materials-runner node_modules/vitest/vitest.mjs run --root apps/api tests/integration/materials-schema.spec.ts tests/integration/materials-fixture.spec.ts
# Conservar el volumen al terminar:
docker @materialsCompose down
```

El bloque anterior requiere los archivos locales ignorados conservados. Para otra
máquina, usar el procedimiento general de proyecto/configuración nuevos descrito
arriba y construir las imágenes del checkout; no asumir que existe esta imagen local.
Resultados, comandos y limitaciones en [T005–T008](t005-t008.md).

## Ejecución T009–T016

Se reanudó el mismo proyecto de ensayo con las mismas credenciales y volumen.
El runner conservó las dependencias Linux y montajes de código solo lectura; se
añadió únicamente `.cache/materials/reports` como `/evidence` para reportes locales
ignorados. No se inició el entorno manual ni se aplicaron nuevas migraciones.
Vitest con pruebas dependientes del cwd se ejecutó desde `/workspace/apps/api`.

Parámetros técnicos nuevos, validados por loadEnvironment, sin editar `.env` real:

| Variable | Defecto | Rango permitido |
| --- | --- | --- |
| MATERIALS_TRANSFER_LIMIT | 2 | Entero 1–2 por proceso |
| MATERIALS_ACTOR_TRANSFER_LIMIT | 1 | Solo 1 por actor |
| MATERIALS_UPLOAD_TIMEOUT_MS | 60000 | Entero 1000–300000 ms |

Las plazas se comparten entre composiciones del proceso. 429 por actor y 503 por
límite global, sin espera; liberación idempotente y limpieza de listeners incluso
ante aborto anterior a admisión o fallo de binding. El timeout queda preparado
para el receptor de T024, todavía no implementado; no se acredita recepción HTTP.
Resultados y límites en [T009–T016](t009-t016.md).

## Ejecución T017–T019

Se reanudó el mismo proyecto y volumen de ensayo. Se añadió al runner únicamente
el montaje de `apps/web/src` en `/workspace/apps/web/src`, solo lectura, para
ejecutar Vitest/React con las dependencias existentes de la imagen. Sin descargas,
puertos publicados o servicios manuales. API se generó/compiló en la capa efímera
antes de probar HTTP; se usó AppModule real, sin controladores de prueba.

Los reportes JSON crudos quedaron en `.cache/materials/reports/`, ignorados. La
evidencia versionable conserva resultados resumidos y sus hashes en
[T017–T019](t017-t019.md). Las suites nuevas devuelven salida 1 de forma esperada:
se escribieron antes de T020–T028 y comprueban comportamiento todavía ausente.
La regresión anterior devuelve salida 0. Al terminar se detuvo solo el proyecto
de ensayo mediante `down` sin eliminar volúmenes.

## Ejecución T020

Mismo proyecto, imagen, volumen y montajes de solo lectura de T017–T019. Prisma
generate y build API en runner efímero antes de ejecutar Vitest desde
`/workspace/apps/api`. Solo se inició PostgreSQL de ensayo, sin puertos publicados;
cada suite creó/eliminó sus esquemas propios. No nuevas dependencias, migraciones,
cuentas o cambios de configuración manual. Se detuvo mediante `down`, sin `-v`.

Reportes ignorados `t020-first.json`, `t020-validation.json` y `t020-final.json`
en `.cache/materials/reports/`; resumen y hashes versionables en
[T020](t020.md). Primera ejecución focalizada aprobada; la siguiente detectó un
ciclo de imports, corregido antes de la ejecución final aprobada. Lint/tipos
iniciales también detectaron compatibilidad de lib ES2023 y una expresión regular
con whitespace PDF; se corrigieron sin ampliar configuración ni relajar reglas.

## Ejecución T021

Mismo proyecto y volumen de ensayo; sin nuevos montajes, dependencias, migraciones
o servicios. PostgreSQL sin puertos publicados, esquemas propios eliminados por
el harness. Prisma generate/build escribieron solo en runner efímero; código y
tests del checkout se mantuvieron en montajes de solo lectura. Host para lint/tipos.

Rojo inicial 18/18 por capacidad ausente, después 18/18 y finalmente 21/21 T021
aprobadas. La primera compilación falló por tipado contextual de Object.freeze;
se corrigió sin alterar reglas. Primera regresión 885/886 por timeout de 15 s del
chequeo ESLint de arquitectura; repetición completa con `--maxWorkers=2`, mismo
umbral/código: 886/886. Reportes ignorados `t021-red.json`, `t021-first.json`,
`t021-final.json`, `t021-final-retry.json` en `.cache/materials/reports/`.
Resumen y hashes versionables en [T021](t021.md). Proyecto detenido con `down`,
sin eliminar el volumen. No se tocó el entorno manual ni se habilitaron handlers.

## Ejecución T022

Se reanudó el mismo PostgreSQL de ensayo, imagen, volumen y montajes de solo
lectura. Sin puertos publicados, nuevas dependencias o migraciones. Prisma
generate/build dentro del runner; lint/tipos en host. Vitest desde workspace API
con `--maxWorkers=2`, conservando los timeouts de pruebas existentes.

Reportes ignorados: `t022-red.json` (15 fallos por capacidad ausente),
`t022-first.json` (13/15; limpieza de fixture intentó deshacer cancelación terminal),
`t022-focused.json` (17/17 tras aislar la cancelación y ampliar casos),
`t022-final.json` (905/905, incluido archivo de 20 000 000 bytes). No se relajó la
regla terminal: el grupo ficticio cancelado permanece así hasta eliminar su esquema.
El chequeo de tipos inicial señaló uso de parámetros con ownerQuery, que solo
acepta SQL; se usó un cliente runtime separado para las barreras con parámetros.

Las fallas de almacenamiento y respuesta de COMMIT se inyectan solo en clientes
pg de prueba. COMMIT real previo a perder su respuesta permite verificar estado
durable y recuperación; no se llenó disco ni se cortó red real. Resumen/hashes en
[T022](t022.md). Proyecto detenido con `down`, sin eliminar el volumen.

## Ejecución T023–T024

Mismo proyecto, imagen, volumen y montajes de código/test solo lectura. Sin nuevas
dependencias o migraciones. Prisma generate/build en runner efímero y Vitest desde
API con dos workers. PostgreSQL sin puertos publicados; solo el servidor HTTP de
ensayo escucha un puerto aleatorio interno del runner. Timers de reservas pausados
como en el harness previo; guard/sesiones/transporte/servicios de materiales reales.

Un controlador definido únicamente en materials-receiver.spec.ts conecta el receptor
con Nest para la prueba; no se registró ningún handler de materiales en producción.
El reloj de recepción del ensayo es 1000 ms; el defecto de producto sigue 60000 ms.
Incluye envíos chunked de 20 000 000 y 20 000 001 bytes sin Content-Length,
revocación después del primer chunk, timeout, desconexión y admisión 429/503.

Reportes ignorados: t023-red, t023-green-t024-red (ensamblado del probe inválido),
t024-red (capacidad ausente confirmada), t023-t024-focused, t023-t024-final y
t023-t024-late-errors, todos JSON en `.cache/materials/reports/`. Se corrigió el
ensamblado de decoradores del test y sus tipos, sin relajar lint/TypeScript.
Resultados/hashes en [T023–T024](t023-t024.md). Proyecto detenido mediante `down`
sin borrar volumen ni afectar datos del entorno manual.

## Ejecución T025–T026

Mismo proyecto aislado `materials-trial-92aba908-04a`, volumen e imagen del bloque
anterior. Docker Desktop estaba detenido; se inició la instalación por usuario y
se arrancó únicamente PostgreSQL con `up -d --no-build --wait db`. Sin puertos
publicados, cambios de dependencias, migraciones o credenciales. Las rutas HTTP
escuchan un puerto aleatorio interno del runner; no se inició el entorno manual.

Prisma generate/build antes de las suites HTTP. El módulo real registra los ocho
handlers de gestión; se eliminó ReceiverProbe del test y los 13 casos ejercen ahora
el controlador de producción con la misma admisión, timeout de ensayo 1000 ms y
servicios reales. El defecto de producto permanece 60000 ms. Los workers de
reservas se pausan solo en el harness para evitar procesos ajenos a estas pruebas.

Reportes ignorados: `t025-t026-initial.json` (48/48),
`t025-t026-management-initial.json` (10/12, dos expectativas incorrectas del fixture)
y `t025-t026-final.json` (972/972 en 52 archivos), con dos workers. Los fallos del
test nuevo eran DRAFT frente a PREPARING y sesión no verificada 401 frente a 403;
se corrigieron expectativas, sin cambiar reglas de producto. El primer chequeo
de tipos/lint detectó un campo de error dinámico y un import type; corregidos.
Lint API, tipos de materiales y build API finales aprobados. Evidencia y hashes en
[T025–T026](t025-t026.md). Proyecto detenido con `down`, sin borrar su volumen.

## Ejecución T027–T029

Web ejecutada en host Windows con dependencias existentes: Vitest con dos workers,
TypeScript, ESLint y build Vite. Vite inicialmente falló por `spawn EPERM` dentro
del sandbox; se repitió con ejecución autorizada para procesos hijos, sin cambiar
configuración. Correcciones estáticas: retorno never del validador, comprobación
de NUL sin regex de control y capacidad binaria requerida en el tipo de la fábrica.

T019 se ejecutó antes de implementar: 0/7 por capacidad ausente, después 7/7 sin
editar sus pruebas. Bloque focal 40/40; suite web completa 526/526 en 32 archivos.
API: mismo runner/imagen y proyecto aislado, generate/build y 793/793 unidades y
arquitectura en 37 archivos. No se inició PostgreSQL ni se repitieron pruebas BD;
la evidencia HTTP/BD del checkpoint anterior permanece intacta. Red del runner
retirada con `down`, sin borrar volumen.

Build servido temporalmente en `127.0.0.1:4179`; Chromium headless con rutas API
simuladas verificó siete aspectos: preparación separada, cancelación/foco,
confirmación desde listado, reload sin replay, índice de grupos, rechazo de alumno
y teclado/móvil a 375 px sin desborde. No utiliza identidad/BD real ni sustituye
T030 o aceptación humana. Preview y navegador cerrados al finalizar.
Reportes ignorados `t027-t029-{red,t019,focused,web-final,api-architecture,browser}.json`
en `.cache/materials/reports/`. Resultado y hashes en [T027–T029](t027-t029.md).

## Ejecución T030–T032

Mismo proyecto aislado `materials-trial-92aba908-04a`; PostgreSQL sin puertos
publicados. API runner existente e imagen navegador existente
`academic-offering-fa3d46bddbb8-expiration-browser:t083-t084`, ID
`sha256:8db1fd767edda05e36b9403af64ef09c36f8a30deb18e0ab1bfcec725448aca5`.
Sin instalar dependencias. Montajes de código, tests, Prisma y nueva configuración
Playwright solo lectura; `/evidence` escribe únicamente reportes ignorados.

Fixture nueva de navegador: esquema por caso, composición API real, Vite 5173
loopback libre, cookie ficticia, workers de reservas/expiración pausados solo en
pruebas, cleanup de procesos y esquema. Diez casos (5 por proyecto desktop/mobile)
sin mocks de negocio. Solo el caso de pérdida de respuesta aborta el HTTP después
de `route.fetch()` real/201; PG acredita commit y recuperación sin otro PUT.
Trace/screenshot/video desactivados, un worker y cero reintentos.

T031 usa locks PG observados, fallos en clientes reales y procesos Node separados;
T032 observa primer chunk y barrera antes del bloqueo final del coordinador.
Dos fallos del harness se corrigieron sin relajar producto: connect(callback)
frente a connect() y selección accidental del bloqueo interno de sesión ya retenido.
Se retuvo el reporte inválido del segundo intento como `t031-t032-harness.json`;
el primero se interrumpió sin reporte completo. Tres esquemas sintéticos de esos
runners se identificaron por prefijo, ocho migraciones y fechas comprendidas
entre el comienzo de T030 y el rojo válido; se auditó y limpió solo ese conjunto.
Reporte ignorado `t030-t032-interrupted-schemas.json`; sin esquema manual afectado.

Rojo válido: 18 aprobados/3 fallos por cuota ausente. Focal inicial con cuota:
21/21. Regresión inicial ampliada: 993/994; una prueba T021 previamente existente
detectó rechazo global por fecha futura. Se documentó ajuste antes de corregir:
fechas futuras cuentan conservadoramente, sin bloquear por sí solas otra intención.
Prueba T021 intacta. Regresión final: 994/994, 54 archivos, dos workers.
E2E finales: 10/10, sin omitidos/flaky/reintentos. Detalle en [T030–T032](t030-t032.md).

Migración aditiva 0009 solo añade índice actorId/createdAt; aplicada en esquemas
de pruebas mediante cadena normal. Sin deploy al entorno manual, purga o cambio
de dependencias. Política de 30 intenciones/actor/60 s registrada previamente en
[upload-limits](upload-limits.md), con ajuste de regresión explícito. Errores
53100/53200 inyectados, sin llenar disco o agotar RAM reales. Tipos y lint API/web
aprobados, generate/build API aprobado. Proyecto detenido con `down` conservando
volumen; ningún cierre de D10/D13/aceptación humana implícito.

## Ejecución T033–T034

2026-11-16, America/Lima. Se reutilizó `materials-trial-92aba908-04a` y los dos
runners anteriores, sin instalar dependencias ni publicar puertos. Docker Desktop
estaba detenido: la primera invocación Compose no alcanzó el daemon; se inició
oculto y DB alcanzó healthy. Node v22.23.1 host/runner, npm host 10.9.8,
Docker Engine 29.8.1, PostgreSQL 16.14 (Debian 16.14-1.pgdg12+1).

Host: lint API/web, tipos materiales API/web, build web y Vitest web completo
aprobados. Runner: generate/build API y regresión de arquitectura/unitarias,
materiales, transporte, sesión y oferta: 1629/1629 en 63 archivos, dos workers.
Web: 526/526 en 32 archivos. Navegador real: 10/10, desktop/mobile, un worker,
cero reintentos, sin omitidos/flaky. Ningún cambio de código requerido.

Comandos exactos y alcance en [checkpoint US1](us1-checkpoint.md); hashes/reportes
por suite en [resultado T033–T034](t033-t034-results.json). Las fixtures conservaron
su limpieza de esquemas. Al finalizar, Compose down sin -v terminó con exit 0 y
conservó volumen; no se aplicó migración al entorno manual. Auditoría de 1054
archivos frente al último hash registrado: solo documentación prevista modificada.
Guía local y arquitectura reflejan US1 actual y separan US2/US3 y puertas D10/D13.
No se cierran aceptación humana, CI remoto o pendientes 001–003.

## Ejecución T035–T036

Mismo proyecto `materials-trial-92aba908-04a`, imágenes y dependencias anteriores,
sin puertos publicados. Dos suites nuevas con PostgreSQL/composición reales y
soporte `materials-temporal.ts`: reloj SQL exclusivo de esquema, instantes como
texto/bigint y matrícula nueva ficticia, sin Date o modificación de historial.
Cada caso compara fingerprint financiero antes/después, aun al fallar una aserción.

Primer informe `t035-t036-harness.json`: Session_expiry_check en fixture; corregida
duración absoluta a ocho horas. Segundo `t035-t036-transition-harness.json`:
transición DRAFT→WITHDRAWN inválida; corregida a publicación y retiro válidos.
Se conservaron ambos informes ignorados, sin usar esos errores como rojo funcional.

Rojo final: 51 casos en dos archivos, 5 aprobados/46 fallidos, cero omitidos;
17 temporales y 34 HTTP/transporte. Fallos restantes por queries de alumno aún
prohibidas y rutas content ausentes. Control de filtro tras headers ya aprobado;
no prueba descarga funcional. Controles existentes: 837/837 en 42 archivos.
Tipos/lint API y generate/build API terminaron con exit 0; dos workers como máximo.

Comandos y detalle en [T035–T036](t035-t036.md), conteos/hashes/casos en
[resultado](t035-t036-results.json). Preservación auditada de 1055 archivos;
solo documentación prevista cambia entre los existentes. Código, migraciones,
pruebas anteriores, dependencias y datos manuales intactos. Compose down sin -v
terminó con exit 0 y conservó volumen. No se acredita US2 funcional o aceptación.

## Ejecución T037–T038

Mismo proyecto aislado `materials-trial-92aba908-04a`, sin puertos publicados,
imágenes/dependencias anteriores y dos workers como máximo. Sin cambios de
credenciales, migraciones o datos manuales. T037 se ejecutó en host: 45 casos
focales, 17 controles existentes aprobados y 28 nuevos en rojo esperado, sin omitidos.
El resto web aprobó 509/509 en 31 archivos: 526 casos anteriores aprobados entre
ambas invocaciones. Build web, tipos completos web/materiales API y lint API/web
terminaron con exit 0.

En runner Linux: generate/build API y diez pruebas reales del participante T038.
Rojo inicial 0/10; la capacidad ausente en callback se normalizó a error seguro
del coordinador. Después de agregar puerto/adaptador, verde 10/10 sin cambiar
tests. Se observaron token/cliente reales, límites ±1 µs, SQL solo sobre Enrollment
y ausencia de conexión/transacción/bloqueos financieros adicionales. Controles API
finales 847/847 en 43 archivos. T035/T036 se repitieron intactas: 5 aprobados/46
fallos esperados, cero omitidos; autorización y handlers alumno siguen pendientes.

Comandos/reportes en [T037–T038](t037-t038.md), hashes y casos en
[resultado](t037-t038-results.json). Auditoría de 1059 archivos y del prefijo
original de tests cliente: solo adiciones previstas de tests/documentación entre
los existentes; producto previo, migraciones y finanzas preservados. Compose down
sin -v terminó con exit 0 y conservó volumen. Sin E2E nuevo o CI remoto observado;
no se acredita descarga/pantalla de alumno, aceptación humana o D10/D13.

## Ejecución T039–T040

Mismo proyecto `materials-trial-92aba908-04a`, imágenes, roles y dependencias
anteriores; sin puertos publicados o cambios de configuración manual. Consultas
internas reales y probe de transporte exclusivo de tests, con SessionStore y
PostgreSQL reales. El controlador binario de prueba no se agrega a producción.

Primer ensayo conservado como t039-t040-harness.json: probe con decoradores no
transformado y conexión prestada sin cleanup en rechazo anterior al checkout.
Se corrigió el soporte. Un esquema sintético se identificó por prefijo, nueve
migraciones, ventana del informe y ausencia de reloj; se auditó antes de limpiar
únicamente ese esquema. Informes t039-schema-audit.json/t039-schema-cleanup.json;
ningún esquema manual afectado. Los errores de fixture no se usan como rojo funcional.

Intermedio válido para transporte: t039-green-t040-red.json, seis rechazos de
binario aún ausente y un fallo de comparación de claves del test, corregido sin
relajar DTO. Focal posterior 44/44; final ampliado con retroceso temporal SQ07:
1670/1670 en 67 archivos, dos workers. T035 original 17/17, consultas alumno 7/7,
transporte binario 7/7. Tipos/lint y generate/build API con exit 0. T036 repetida
aparte: 4 aprobados/30 fallos esperados, cero omitidos, MD12 seguro aprobado;
faltan políticas/handlers T041/T042. No se repite web/E2E o CI remoto.

Comandos, ajustes explícitos de tres tests anteriores y límites en
[T039–T040](t039-t040.md); casos/hashes en [resultado](t039-t040-results.json).
Auditoría de 1064 archivos: solo cambios previstos, migraciones/dependencias y
código financiero previo intactos. Compose down sin -v terminó con exit 0 y
conservó volumen. No se acredita descarga/pantalla real de alumno o aceptación.

## Ejecución T041–T042

Se reutiliza `materials-trial-92aba908-04a`, imagen API y dependencias previas,
roles runtime/owner y base de ensayo, sin puertos publicados. Las pruebas nuevas
usan AppModule/controlador reales, SQL con barreras, respuesta HTTP retenida y
reloj exacto exclusivo del esquema. No se cambia reloj del equipo o reglas 003.

Descarga inicial 34/34. Focal 197/198: el único fallo era el reloj de la fixture
sin configurar en el pool separado HTTP; se conectó clock mediante el harness.
Focal corregido 198/198, incluidos siete casos de recursos y tres de política.
Se corrigieron anotaciones del test y una dependencia de tipo entre capas antes
de pasar tipos/lint. Reportes intermedios preservados, sin relajar expectativas.

Regresión API final **1714/1714 en 69 archivos**, máximo dos workers; T035 original
17/17 y T036 original 34/34 intactas. Generación Prisma, build, tipos focalizados
y lint API con exit 0. No se repite web/E2E: T043/T044 aún deben implementar el
cliente y pantalla del alumno. Comandos y resultados en [T041/T042](t041-t042.md)
y [resultado estructurado](t041-t042-results.json).

Auditoría de 1069 archivos y hashes de checkpoints: solo cambios previstos,
sin migraciones/dependencias nuevas o cambios financieros/frontend/manuales.
Compose down sin -v conserva el volumen. Estado 42/68; no aceptación humana,
D10/D13, CI remoto o cierre de pendientes anteriores por este bloque.

## Ejecución T043–T044

Ensayo frontend en host con Node 22.23.1 y dependencias existentes. No se inicia
PostgreSQL/Compose ni se altera el entorno manual. Vitest/Vite/Chromium requieren
subprocesos locales permitidos fuera del sandbox; un build inicial con spawn
EPERM se repitió con ese permiso y terminó correctamente.

Rojo antes de producto: 17 controles y 28 fallos T037, cero omitidos. Focal 45/45;
regresión 586/586 y final ampliada 587/587 en 35 archivos con cancelación anidada.
Tipos completos/materiales, lint y build web con exit 0. Chromium headless usa
Vite de puerto efímero y una página de ensayo aislada, con API simulada: ocho
comprobaciones de teclado, descarga exacta, recursos, errores y tamaños 1280×900/
375×812, cero errores de página. Se cierra navegador/servidor en finally.
Se corrigieron imports del probe y una anotación del test, sin relajar contratos.

Comandos y límites en [T043/T044](t043-t044.md), casos/hashes en
[resultado](t043-t044-results.json). Auditoría de 1071 archivos: solo cambios
previstos de cliente/pantalla y documentación; backend/finanzas/migraciones/
dependencias/manuales intactos. API previo 1714/1714 conservado, no reejecutado.
Estado 44/68; siguen T045 navegación/ciclo de cuenta y T046 E2E alumno real.

## Ejecución T045–T047 y checkpoint US2

Mismo proyecto `materials-trial-92aba908-04a`, imágenes y overlays runner/browser,
roles owner/runtime y base de ensayo; sin puertos publicados o cambios manuales.
Cada E2E crea su esquema y compone API real con Vite de loopback, un worker,
desktop/mobile, trace/screenshot/video off y cero reintentos. Materiales ya
sembrados permiten probar US2 sin ejecutar cargas US1. Una credencial ficticia
del esquema sirve al login real de la segunda cuenta; no se imprime.

Navegación: tres fallos previos por funcionalidad ausente, después verdes dentro
de web 590/590 en 36 archivos. Focal E2E 4/4. Primera suite completa 28/30: MS04
intentaba DRAFT→WITHDRAWN y el trigger lo rechazó en ambos viewports. Se corrigió
solo el fixture con DRAFT→PUBLISHED→WITHDRAWN y snapshot editorial de docente,
igual a ME05 original. Suite completa repetida **30/30**, 20 alumno y 10 gestión,
cero omitidos/reintentos/inestables; fingerprint financiero igual antes/después
de todos los casos. Se conserva el informe anterior. Un primer comando con grep
pipe perdió sus comillas entre PowerShell/sh; no generó informe válido y se
cambió a MS0[16]. No se cuenta como rojo funcional.

API ampliada con autorización/consultas/persistencia/tiempo/HTTP/mantenimiento
de matrículas y sesiones: **1813/1813 en 75 archivos**, dos workers. T035 17/17 y
T036 34/34 originales intactas. Tipos/lint API/web, generate y builds aprobados.
Comandos, matriz MV01/MV02/MV07/MV10/MV11 y límites en
[checkpoint US2](us2-checkpoint.md); casos/hashes en [resultado](t045-t047-results.json).

Auditoría de 1075 archivos y evidencia histórica: cambios previstos de UI/
composición/pruebas/documentación, backend/migraciones/dependencias/manuales
intactos. Compose down sin -v conserva volumen. Estado 47/68; sigue T048,
sin aceptación humana, D10/D13, CI remoto o cierre de pendientes 001–003.


## T048–T050: pruebas previas US3 (2026-11-16)

Se conservaron el proyecto Docker aislado, variables privadas y migraciones
0001–0009. Docker Desktop se inició oculto; up de db sin rebuild. Prisma generate
y build API aprobados. Rojo final: dominio 13/13, integración 24/25 (un control
GET aprobado), interfaz 16/16; 53 fallos esperados por capacidades ausentes.
Regresión: API/materiales/arquitectura 323/323 en 26 archivos y web 590/590 en 36;
dos workers. Tipos API/web y lint aprobados. No se repitieron E2E ni build web.

La primera ejecución API detectó una lectura incorrecta de la envoltura data en
el nuevo control; corregida la prueba y repetida la versión final. Sin cambios
de producto, tests previos, migraciones o dependencias. Comparación de 1078
archivos previos; solo documentos de estado modificados. Compose down sin -v
conserva volumen y no toca el entorno manual. Estado 50/68; continúa T051.
[Evidencia y comandos](t048-t050.md), [casos/hashes](t048-t050-results.json).


## T051–T053: backend de corrección/retiro (2026-11-16)

Proyecto Docker aislado existente, sin rebuild, puertos o cambios de entorno
manual. Generación Prisma y build API aprobados. Focal inicial 84/84. Ampliada
1857/1865 en 78 archivos: los ocho fallos estaban en nuevas aserciones que
esperaban strings en error.fields en lugar de objetos field/message. Se
corrigieron solo esas pruebas y se repitió el focal ampliado: 98/98 en siete
archivos, incluidos los 14 HTTP nuevos. Los 1851 casos externos al archivo
afectado pasaron sin cambios. Cobertura compuesta 1865/1865; no se presenta
como una ejecución completa posterior. Se conservan ambos informes.

E2E existente real 30/30, 20 alumno y 10 gestión, escritorio/móvil, un worker,
cero reintentos/omitidos/inestables; fingerprints financieros iguales. Tipos y
lint API aprobados. No se repiten build web ni unitarias web; producto web y sus
16 pruebas US3 quedan intactos, pendientes T054. Sin nuevo E2E US3 T056.

Se comparan 1082 archivos previos; se conservan pruebas originales de materiales,
migraciones/dependencias/finanzas/datos manuales y rama. Cambian únicamente
comandos/transiciones/composición HTTP, inventario de rutas y documentos previstos.
Se reutilizan audit.ts y materials.module.ts sin cambios. Compose down sin -v
conserva volumen. Estado 53/68; continúa T054.
[Evidencia](t051-t053.md), [casos y hashes](t051-t053-results.json).


## T054–T056: interfaz, carreras y E2E US3 (2026-11-16)

Se reutilizan proyecto/volumen Docker y overlays de runner/navegador, sin puertos
publicados ni cambios de entorno manual. Generate/build API aprobados; tipos API,
web completos y del harness, lint API/web y build web aprobados.

T050 original 16/16 sin cambios. Web final 614/614 en 38 archivos; primer pase
613/614 detectó que un inventario aún rechazaba withdraw. Esa sonda se sustituye
por replace, que sigue prohibido; el resto de pruebas previas permanece intacto.

T055 inicial 13/14 y repetición 13/14: el ensayo de respuesta ya autorizada
retenía response.end y una conexión reusable podía encolar la siguiente solicitud.
Restaurar end no bastó; Connection: close evita la reutilización y la carrera final
pasa con 404 para nuevas solicitudes y bytes originales para la ya autorizada.
Las 14 carreras pasan en la ampliada de materiales/arquitectura: 388/389 en 30
archivos, con un timeout de 15 s únicamente en lint arquitectónico bajo carga
concurrente de navegador. Repetición aislada 7/7, un worker, mismo timeout/reglas.
Cobertura compuesta de 389 casos; informes inicial y final separados. No se
modifica producto backend. Originales T035 17/17 y T036 34/34 intactos.

Focal E2E US3 escritorio 6/6. Suite completa real 42/42: 12 US3 y 30 previos,
escritorio/móvil, un worker, cero reintentos/omitidos/inestables. Fingerprints
financieros por caso en fixture principal de carreras y en todos los E2E.
Las demoras/pérdidas usan comandos realmente ejecutados contra API/PostgreSQL.

Comparación de 1085 archivos previos: solo cambian UI/cliente/inventario web,
configuración de suites y documentos previstos. Backend, finanzas, migraciones,
dependencias, rama y datos manuales conservados. Compose down sin -v conserva
volumen. Estado 56/68; sigue T057, matriz de auditoría, y T058 checkpoint US3.
Sin aceptación humana, D10/D13, restore cifrado, CI remoto o cierre de 001–003.
[Evidencia](t054-t056.md), [casos/hashes](t054-t056-results.json).

## T057–T059: auditoría, checkpoint US3 y CI (2026-11-16)

Se reutilizan proyecto y volumen Docker aislados. Node 22.23.1/npm 10.9.8 en
Linux; sin reconstruir imágenes, publicar puertos o tocar configuración/datos
manuales. Código y pruebas actuales montados en solo lectura. El runner de
navegador monta también package.json y tsconfig.materials.json actuales para
ejecutar el script exacto incorporado al CI, no una copia antigua de la imagen.

Focal de auditoría nueva: 15/15. Materiales y arquitectura: 404/404 en 31 archivos,
máximo dos workers, sin carga concurrente del navegador. No requiere la repetición
aislada del lint arquitectónico del bloque anterior. Originales T035 17/17,
T036 34/34 y carreras T055 14/14 preservados. Web completa 614/614 en 38 archivos.

El chequeo de tipos del host pasó, pero el primer runner Linux falló con TS2352:
materials-receiver.spec.ts importaba el tipo de factory de src mientras ejecutaba
dist. La marca nominal de MaterialDecision difiere en las declaraciones generadas.
Solo se cambia ese import de tipo a dist, sin casts nuevos, exclusiones o cambios
de aserciones. Tipos Linux API/materiales y web/materiales pasan después. Los
13 casos originales del receptor se repiten por separado tras la corrección.

Prisma generate, builds API/web y lint API/web aprobados. Nuevo script
test:e2e:materials ejecutado realmente: 42/42 en 4,7 minutos, desktop/mobile,
un worker, cero reintentos/omitidos/inestables; 12 US3 y 30 previos. API y navegador
se ejecutan secuencialmente. La fixture compara fingerprints financieros por caso.
Las 15 pruebas nuevas comparan además todas las filas de oferta académica.

CI conserva exactamente sus pasos anteriores y añade tipos de materiales y E2E.
Timeout del job 20→60 minutos por las suites secuenciales adicionales; plazos de
tests intactos. Validación estructural exige igualdad de todos los pasos previos;
scripts/dependencias conservados, sin actionlint o parser YAML dedicado. El harness
portable Compose pasa config --quiet sin imprimir variables. No se observa ni se
dispara GitHub Actions remoto; T059 acredita configuración y comandos locales.

Comparación de 1090 archivos previos: solo workflow, scripts web, import de tipo
del receptor y documentos previstos. Se añade la suite de auditoría y el checkpoint;
producto, aserciones previas, migraciones, dependencias, finanzas y rama preservados.
Compose down sin -v conserva volumen y no toca otros proyectos. Estado 59/68;
continúa T060. No se ejecuta su matriz transversal ni se cierra aceptación humana,
restore cifrado, recursos/capacidad D10, acuerdos D13 o pendientes de 001–003.
[Checkpoint y comandos](us3-checkpoint.md), [casos/hashes](t057-t059-results.json).

## T060: verificación transversal (2026-11-17)

Proyecto Docker aislado anterior, PostgreSQL y Mailpit sin puertos publicados.
Docker Desktop estaba detenido: se inicia oculto, sin cambiar el entorno manual.
Prerrequisitos con SPECIFY_FEATURE=004-materiales-estudio: política PowerShell
del host impide la primera invocación; se repite en proceso con ExecutionPolicy
Bypass, sin cambiar política global. Checklist 16/16, sin marcadores modificados.

Node 22.23.1/npm 10.9.8/Prisma 7.10.0, imágenes existentes y código/configuración
actual en solo lectura. Probe generate/migrate/check y Prisma generate aprobados.
Build API, tipos Linux API/materiales y matrícula, lint API/web, tipos web/materiales
y matrícula y build web aprobados. Se monta además tsconfig.enrollment.json actual
de ambos workspaces. API y navegador corren secuencialmente, máximo dos workers API,
uno de navegador y cero reintentos.

Primera API ampliada: 3937/3943 en 169 archivos, 23,89 minutos, seis fallos y
cero omitidos. Dos conteos de oferta esperaban siete migraciones; dos listas
cerradas de matrícula/migraciones omitían 0009. Solo se actualizan conteos/listas
y títulos, sin relajar checksums, datos previos, permisos o restricciones.

La revisión descubre nombres que API aceptaba pero cliente rechazaba. Nueva
reproducción pura: 12 fallos esperados y un control Unicode aprobado; caso HTTP
excluido intencionalmente en ese rojo. Se corrigen únicamente normalizador de
metadata y capacidad binaria para rechazar los seis caracteres ya prohibidos
por la web, sin renombrado ni cambios de datos/migraciones.

Repetición focal final: 687/687 en 37 archivos, 4,30 minutos, cero omitidos;
incluye 418 materiales/arquitectura, 265 de los cuatro archivos previos y cuatro
contratos. Nuevo test 14/14, incluido HTTP real sin intenciones o finanzas alteradas.
Los otros 3274 casos/134 archivos pasaron en la ampliada inicial. API acumulada
3961/3961 en 171 archivos: cobertura compuesta, no otra ejecución completa posterior.
Web completa 614/614 en 38 archivos; permanece intacta después del arreglo API.

Navegador final: 42/42 en 5,1 minutos, desktop/mobile, un worker, cero
reintentos/omitidos/inestables y fingerprints financieros preservados.
Comparación de 1092 archivos previos: solo dos validadores, cuatro inventarios
de migraciones y documentos previstos. Reconstruir las cuatro pruebas previas
deshaciendo únicamente esos cambios recupera sus hashes originales. Backend
financiero/oferta, migraciones, dependencias, workflow/scripts, rama y datos
manuales conservados. Pendientes CI remoto, restore cifrado, recursos, personas
y D10/D13; no se cierra integralmente 001–003. Compose down sin -v conserva el
volumen y detiene solo este proyecto. Estado 60/68; continúan T061–T062.
[Comandos y revisión](automated.md), [casos/hashes](t060-results.json).


## T061–T062: recuperación de materiales (2026-11-17)

Ensayo reproducible en proyecto nuevo `materials-recovery-3e77cfc34ca8`, red interna sin
puertos, PostgreSQL 16.14 y Mailpit ficticio. Cinco fases aprobadas: legacy 0007,
upgrade 0008/0009, dos procesos API, dos decisiones posteriores al backup y
restore cifrado a otra BD. Seis materiales, tres formatos/estados y una intención
pendiente; comparación completa de bytea/SHA-256, metadata, ledger/auditoría,
catálogo/ACL y finanzas. Sesiones antiguas invalidadas, login nuevo y permisos
por actor/estado/matrícula; retiro perdido revisado y reaplicado, publicación
perdida sin reejecución automática. Migración inválida solo en copia temporal,
sin downgrade ni tabla parcial. Cifrado 7/7, guardas 5/5, tiempos 2/2; lint,
tipos del ensayo y build API aprobados. El primer ensayo se detuvo al limpiar
SQL temporal copiado por root; corregido el dueño usado para eliminar solo ese
archivo, se repitió todo. Proyectos detenidos y volúmenes conservados.

[Evidencia y límites](recovery.md), [resultado estructurado](t061-t062-results.json).
1094 archivos previos comparados; producto/pruebas previas/migraciones/dependencias
y entorno manual preservados. Estado 62/68; continúa T063. D10/D13, humanos, CI
remoto y cierre integral de 001–003 permanecen pendientes.


## T063 y preparación T064 (2026-11-17)

Proyecto nuevo `materials-resources-46d285396ecb`, PostgreSQL 16.14, red interna sin puertos,
volumen y credenciales exclusivos. API en proceso distinto del generador; siete
ventanas de medición de memoria/buffers, BD/WAL, disco y respaldo. Carga/descarga
20 MB con hashes completos, dos cargas retenidas y 429/503 sin consumir cuerpos
adicionales, aborto y liberación de plazas, cliente lento sin transacción SQL
retenida y rollback real ante fallos inyectados 53100/53200. Un caso integrado
aprobado, sin omitidos; tipos, lint, build y parser PowerShell aprobados.
Pico API 299.63 MiB RSS; generador 183.63 MiB, separados.
Backup cifrado 278381 bytes en 2.447 s para
40001455 bytes lógicos; corpus PDF artificial compresible.
Primer arranque detenido antes de transferencias por parser de du; corregido
y repetido completo. Ambos proyectos detenidos, volúmenes preservados.

El responsable confirmó participantes aún no disponibles: T064 preparada, sin
sesiones humanas, consentimiento o aceptación inventados.
[Recursos](local-resources.md), [protocolo](human-acceptance.md),
[informe y siguiente bloque](t063-t064-report.md), [resultado](t063-t064-results.json).
1099 archivos previos comparados; producto/pruebas previas/migraciones/dependencias
y entorno manual preservados. Estado 63/68, cinco pendientes. T065–T066 es el
siguiente bloque, sujeto a acuerdos D13 y escenario/infraestructura D10. T067–T068
conservan dependencias humanas y de cierre. No capacidad 2500, CI remoto, compras,
despliegue o cierre de 001–003.

## Preparación T065–T066 (2026-11-17)

Se incorporaron materiales al [procedimiento operativo](../operation.md):
mantenimiento, backup cifrado conjunto, inventario completo, restore en BD nueva,
roles/ACL, invalidación de sesiones y revisión de decisiones posteriores conocidas.
Incluye registro O01–O12 de custodia/destino/retención/RPO/RTO/espacio y respuesta
a incidentes; conserva las guardas de ensayo de las herramientas existentes.
El [escenario de capacidad](../capacity.md) incorpora corpus y tráfico de materiales
al combinado, registro C01–C10, cuentas/activos/VU/en vuelo separados, generador
en otro equipo, mediciones de recursos/costo y criterios por acordar.

El responsable confirmó que D13 aún no está definido y que rúbrica/escenario/
infraestructura D10 aún no están disponibles; pidió conservarlos pendientes.
T065–T066 no se marcan completas. T064 conserva participantes no disponibles.
Estado 63/68, cinco pendientes; T067–T068 mantienen sus dependencias.
[Informe](t065-t066-report.md) y [validación/hashes](t065-t066-results.json).
Se comparan 1105 archivos previos; cambio exclusivamente documental, sin producto,
pruebas, migraciones, dependencias o evidencia histórica alterados. No se inició
Docker, carga externa, respaldo del entorno manual, compra, purga o despliegue.

## Preparación T067–T068 (2026-11-17)

Estado actual añadido a spec/plan y composición vigente US1–US3 añadida a
ops/local/architecture.md; los cuerpos originales quedan íntegros como registros
históricos, verificados por hash. Se revisan 12 combinaciones método/ruta frente
al controlador real, el participante público de matrícula y la composición de
rutas por audiencia. Se corrige el desfase documental de descripciones previas
de «sin implementación» o «solo US1» mediante contexto de estado actual.

[Revisión preliminar](final-acceptance.md): 20 FR, 7 SC y 19 escenarios trazados
a evidencia local histórica, con SC-007/personas y D10/D13 explícitamente pendientes.
No es aceptación final ni una nueva ejecución de T060/T062/T063.
[Informe](t067-t068-report.md), [validación y hashes](t067-t068-results.json).
1108 archivos previos comparados; solo documentación de este bloque modificada.
Producto, pruebas, migraciones, dependencias, rama y entorno manual preservados.
T067 conserva dependencia T064; T068 conserva sus dependencias y aceptación
integral. Estado 63/68, cinco pendientes. No se inició servicio, carga externa,
respaldo manual, compra, purga o despliegue.

## H-PDF-01: corrección durante T064 (2026-11-17)

La muestra indicada por el responsable, de 1 342 144 bytes, permitió reproducir
el rechazo: PDF 1.7 con actualización incremental solo del trailer, subsección
xref vacía 0 0 y Prev válido. El parser exigía entradas nuevas en cada sección.
Se permiten subsecciones vacías si existe un predecesor válido; se conserva la
validación del catálogo/objetos, límites y ciclos y se exige al menos una
subsección real por sección. No se rebaja la integridad, tamaño o autorización.

Regresiones sintéticas previas: 3 fallos/2 aprobadas; tras corrección, 5/5 y
selección ampliada 107/107 en seis archivos, sin omitidos. Lint API, tipos y build
aprobados. El comando aislado de tipos necesitó --types node; no se modificaron
dependencias/configuración por ese ajuste del comando.
Se reanudó solo el runner humano con el mismo schema, verificando conteos de
cuentas/matrículas/materiales/intenciones sin cambios durante el arranque y sin
fixtures o migraciones. El primer arranque de reanudación necesitó resolver
reflect-metadata desde node_modules del runner; corregido en el script privado.

Carga del PDF proporcionado: 201 PREPARED; descarga gestora: 200, bytes completos
y SHA-256 iguales al original. Preparado técnico sin publicar; PDF original no
incorporado al repositorio ni expuesto en informes. Se preservan cuentas, datos
del ensayo y entorno manual. T064 y aceptación humana siguen pendientes.
[Informe](pdf-fix.md), [resultados/hashes](pdf-fix-results.json).

## Cierre humano T064 y sincronización T067 — 2026-11-17

**Cierre T064/T067 — 2026-11-17, America/Lima.** El responsable confirmó «ahora si funciona todos los recorridos», después de repetir el ensayo tras la corrección del PDF. T064 queda completada para el recorrido global de gestor y alumno en laptop, con consentimiento previamente comunicado. Es un resultado comunicado por el responsable, sin observación directa del agente ni desglose de cada paso, formato, ayuda o duración. Móvil no observado; SO, navegador y uso específico de puntero/teclado no informados. H-PDF-01 queda resuelta tras esta repetición humana. T067 completa la sincronización documental; D13/T065, D10/T066 y el cierre integral T068 permanecen pendientes. Avance **65/68**, tres pendientes. [Registro de cierre](t064-t067-report.md).

Laboratorio temporal materials-human-60e9aab3c9b5 detenido mediante su script específico, sin borrar volumen o archivos privados. Verificación documental y hashes, sin nuevas pruebas funcionales ni cambios adicionales de producto, dependencias, migraciones o entorno manual.
