# Checkpoint US1 — T033/T034

Fecha: 2026-11-16, America/Lima. Alcance: preparar/publicar materiales y repetir
regresiones afectadas. La guía de uso y arquitectura se actualizan en T034;
este checkpoint no modifica código de producto, migraciones o dependencias.

## Entorno y comandos

Rama conservada: `feat/003-reservas-ordenes-matricula`. Mismo proyecto aislado
`materials-trial-92aba908-04a`, PostgreSQL real sin puertos publicados. Docker
Desktop estaba detenido y se inició en segundo plano. Se reutilizaron imágenes,
dependencias y configuración privada de [implementation-environment](implementation-environment.md),
sin imprimir URLs, claves o cookies. Las fixtures crean/limpian esquemas sintéticos
y aplican 0001–0009; no despliegan en la BD manual.

Versiones observadas: Node v22.23.1 (host y runner), npm 10.9.8 (host), Docker
Engine 29.8.1 y PostgreSQL 16.14 (Debian 16.14-1.pgdg12+1). Exclusiones Git,
Docker y ESLint verificadas; configuración privada, reportes y builds siguen ignorados.

Comandos host desde la raíz (todos deben terminar con exit 0):

```powershell
npm.cmd run lint --workspace @academia/api
npm.cmd run lint --workspace @academia/web
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.materials.json
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.materials.json
npm.cmd run build --workspace @academia/web
Set-Location apps/web
node ../../node_modules/vitest/vitest.mjs run src --maxWorkers=2 --reporter=json --outputFile=../../.cache/materials/reports/t033-web.json
```

Compose, desde la raíz y usando el archivo privado ya existente:

```powershell
$materialsProject = Get-Content .cache/materials/trial-project.txt
if ($materialsProject -notmatch '^materials-trial-[a-f0-9-]+$') { throw 'Invalid project' }
docker compose --project-name $materialsProject --env-file .cache/materials/trial.env -f compose.yml -f ops/docker/compose.regression.yml -f .cache/materials/compose.runner.yml up -d --no-build --wait db
```

En `run --rm --no-deps --entrypoint sh materials-runner -c '…'`, generar y compilar
antes de Vitest. Selección API exacta, desde la raíz del runner Linux:

```sh
node apps/api/scripts/database.mjs generate && npm run build --workspace @academia/api && cd apps/api && node ../../node_modules/vitest/vitest.mjs run \
  tests/architecture src/modules \
  tests/integration/materials-publish.spec.ts \
  tests/integration/materials-receiver.spec.ts \
  tests/integration/materials-complete.spec.ts \
  tests/integration/materials-upload-intents.spec.ts \
  tests/integration/materials-format.spec.ts \
  tests/integration/materials-schema.spec.ts \
  tests/integration/materials-fixture.spec.ts \
  tests/integration/materials-files.spec.ts \
  tests/integration/materials-authority.spec.ts \
  tests/integration/materials-admission.spec.ts \
  tests/integration/materials-errors.spec.ts \
  tests/integration/materials-queries.spec.ts \
  tests/integration/materials-upload.spec.ts \
  tests/integration/materials-management-http.spec.ts \
  tests/integration/materials-upload-races.spec.ts \
  tests/integration/materials-upload-security.spec.ts \
  tests/integration/http-security.spec.ts \
  tests/integration/session-store.spec.ts \
  tests/integration/session-lifecycle.spec.ts \
  tests/integration/academic-offering-authorization.spec.ts \
  tests/integration/academic-offering-http.spec.ts \
  tests/integration/academic-offering-teaching-http.spec.ts \
  tests/integration/academic-offering-maintenance-http.spec.ts \
  tests/integration/academic-offering-publication-races.spec.ts \
  tests/integration/academic-offering-eligibility.spec.ts \
  tests/integration/academic-http-errors.spec.ts \
  --maxWorkers=2 --reporter=json --outputFile=/evidence/t033-api.json
```

Para navegador, misma base Compose y además
`-f .cache/materials/compose.browser.yml`, con este cuerpo de comando:

```sh
node apps/api/scripts/database.mjs generate && npm run build --workspace @academia/api && cd apps/web && PLAYWRIGHT_JSON_OUTPUT_FILE=/evidence/t033-e2e.json node ../../node_modules/@playwright/test/cli.js test --config playwright.materials.config.ts --reporter=json
```

Escritorio/móvil, un worker, cero reintentos y sin trace/screenshots/video. Las
respuestas de negocio y la persistencia son reales; solo la pérdida deliberada
de respuesta PUT usa intercepción después de recibir el 201 real. No se ejecutó
la suite de aceptación humana ni la totalidad de integración de 001–003.

## Resultados observados

| Comprobación | Resultado |
| --- | --- |
| API: arquitectura, unitarias, materiales, transporte, sesión y oferta seleccionada | 1629/1629, 63 archivos, exit 0 |
| Web: suite src completa | 526/526, 32 archivos, exit 0 |
| Playwright gestión real | 10/10, desktop/mobile, sin omitidos/flaky/reintentos, exit 0 |
| Lint API/web y tipos materiales API/web | Todos exit 0 |
| Prisma generate y builds API/web | Todos exit 0 |

No hubo fallos funcionales ni cambios de producto para este checkpoint. La
primera invocación de Compose encontró Docker detenido; tras iniciarlo, DB estuvo
healthy y las ejecuciones de pruebas terminaron a la primera. El build web produjo
72 módulos, JS 397.99 kB (gzip 111.59 kB) y CSS 4.47 kB (gzip 1.27 kB).

Las nueve suites añadidas respecto de la regresión T030–T032 reúnen 635 casos:
sesiones 35; autorización de oferta 434; elegibilidad 18; HTTP oferta 24;
mantenimiento HTTP 51; carreras de publicación 16; HTTP docente 31; errores
académicos 26. Se conservan los 994 casos anteriores, incluido transporte HTTP.

Después de los resultados se ejecutó la misma base Compose con `down` sin `-v`:
exit 0, contenedores/redes de ensayo detenidos y volumen PostgreSQL conservado.

## Preservación y alcance

La auditoría SHA-256 fusiona cronológicamente el baseline y los diez checkpoints
posteriores hasta T030–T032: 1054 archivos comparados. Solo se permiten diferencias
en tasks, verification, quickstart, architecture e implementation-environment.
Los informes/evidencias históricos y pruebas anteriores permanecen intactos; el
texto histórico T070 se conserva en architecture. No se cambia rama ni se hace commit.
Los reportes crudos quedan ignorados en `.cache/materials/reports/t033-{api,web,e2e}.json`;
[resultado estructurado](t033-t034-results.json) conserva conteos, casos por suite y hashes.

US1 acredita localmente gestión autorizada, preparación/publicación explícita,
integridad y recuperación de incertidumbre. Los tests de sesión y oferta repiten
sus expectativas existentes junto a la seguridad del transporte. US2 aún debe
implementar derecho temporal del alumno, listado, descarga y HEAD. US3 debe
implementar edición/retiro/republicación; persistir estados no acredita sus flujos.

No se declara aceptación humana, capacidad D10, backup/restore cifrado D13,
recuperación ante corte físico, CI remoto, Izipay, 24 h reales, VPS o cierre de los
pendientes 001–003. Los errores de recursos siguen siendo inyectados; no se llenó
disco ni se provocó OOM. Los límites técnicos no equivalen a capacidad medida.
