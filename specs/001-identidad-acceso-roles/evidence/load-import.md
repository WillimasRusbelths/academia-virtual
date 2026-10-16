# Import de fixtures y tipos del editor — seguimiento T103

Fecha: 2026-10-16. Base: `05cbbc1`. Repositorio inicialmente limpio; checklist
documental 16/16. No se avanza T104 ni se cambia la clasificación de capacidad.

## Diagnóstico reproducido

En Windows, `node node_modules/typescript/bin/tsc -p load-tests/identity/tsconfig.json --pretty false`
reproduce **TS2307** en `fixtures.ts:6`: no encuentra
`../../apps/api/dist/src/infrastructure/testing/identity-fixtures.js` ni sus tipos.
En ese momento no existían ni el `.js` ni el `.d.ts` en el host. No es una extensión
incorrecta: NodeNext/ESM y Node 22 requieren ese `.js` compilado en ejecución.
El build de Docker está dentro del contenedor; sus montajes de fuentes no exportan
`dist/` hacia Windows. La imagen también puede contener compilaciones antiguas.

El tsconfig de carga ya incluye `*.ts`, resolución NodeNext, strict y allowJs;
checkJs=false permitía inferir desde JS sin conservar todos los contratos originales.
El tsconfig de API compilaba JS pero no declaraciones. Además, la instalación local
estaba incompleta respecto del lockfile: faltaban tipos de Express y Prisma generado.
Reiniciar el servidor TypeScript por sí solo no crea ninguno de esos archivos.

## Corrección

El build API emite `.js` y `.d.ts` desde las mismas fuentes. El nuevo comando raíz
`npm run load:identity:typecheck` genera Prisma offline, compila la API y comprueba
los dos tsconfig de carga en ese orden. Compose monta package.json raíz y tsconfig
API actuales, evitando usar instrucciones antiguas de la imagen. El import conserva
su destino compilado: no se edita dist, no se versionan generados ni se cargan fuentes
con decoradores/propiedades de parámetro mediante Node strip.

Las declaraciones revelaron **TS2345** en `serve.ts`: `INestApplication` no satisface
el contrato `NestExpressApplication` de configureTransport. Se especifica el genérico
real de NestFactory.create, sin casts, any, supresiones ni exclusiones añadidas.

Preparación y pasos de VS Code: [runbook](../../../load-tests/identity/README.md#tipos-del-editor-y-artefactos-de-la-api).
Windows requiere npm ci con el lockfile. El intento offline falló por ENOTCACHED;
el primer intento en red falló por UNABLE_TO_VERIFY_LEAF_SIGNATURE. Se reutilizó la
CA pública local prevista en [Docker](../../../ops/docker/README.md), con TLS activo;
no se modificó el lockfile ni se deshabilitó validación de certificados.

## Verificación

Windows: npm ci (396 paquetes), generación Prisma, build API y ambos chequeos
TypeScript terminados con salida 0. La traza NodeNext confirma resolución exacta
del import a `apps/api/dist/src/infrastructure/testing/identity-fixtures.d.ts`.
No se atribuye una revisión humana de VS Code a esa comprobación automatizada.

Docker: tipos, lint de los dos workspaces y build API/web aprobados. Primer lote
de pruebas: 11/12, falló el contador/limpieza por timeout por defecto de 5000 ms;
se había omitido `--config apps/api/vitest.config.ts` (15000 ms) y maxWorkers=1 del
runbook. Se repite con esa configuración existente, sin cambiar sus valores.

Repetición con `npx vitest run --config apps/api/vitest.config.ts
load-tests/identity/fixtures.spec.ts load-tests/identity/diagnostics.spec.ts
load-tests/identity/metrics.spec.ts --maxWorkers=1`: **12/12**, sin omitidas;
incluye las **9/9 fixtures** (1120 hashes reales, guardas, permisos, limpieza
dirigida/idempotente y conservación de ajenos/singleton). La limpieza duró 6367 ms,
por debajo del límite de 15000 ms vigente. No acredita capacidad de carga.

Las huellas previas de las 15 cuentas manuales, 12 originales y credenciales coinciden
con la evidencia anterior. No se ejecutan migraciones, limpieza ni pruebas de borrado
contra ese entorno. Las pruebas de fixtures usan un schema t_* nuevo en la BD aislada.
