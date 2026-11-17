# Checkpoint US3 — corrección, retiro y republicación

Fecha: 2026-11-16, America/Lima. T057–T059 del spec 004. Este checkpoint reúne
la verificación automática de MV05/MV06/MV08 y la incorporación de materiales
al CI existente. Conserva como historia los resultados de
[T048–T050](t048-t050.md), [T051–T053](t051-t053.md) y
[T054–T056](t054-t056.md). No constituye aceptación humana ni cierre integral.

## T057: auditoría persistida y preservación

`apps/api/tests/integration/materials-audit.spec.ts` añade 15 casos sobre PostgreSQL
real, con actores y archivos ficticios en un esquema aislado. No cambia código de
producto, migraciones, fixtures compartidas ni expectativas anteriores.

- Carga real, corrección, publicación, retiro y NO_CHANGE producen únicamente
  las columnas cerradas de ledger/auditoría. El digest ocupa 32 bytes; recibo y
  evento coinciden en revisión, resultado e instante con seis decimales.
  UPLOAD_COMPLETE conserva la referencia de intención sin inventar commandId.
- Los registros no contienen títulos, descripciones, nombres de archivo, hash
  completo del archivo, sesiones, rutas privadas o causas SQL. La lista cerrada
  excluye también bytes. HTTP real comprueba 409/503/403 y registros de seguridad
  seguros, incluso al fallar la escritura de auditoría.
- Replay devuelve el recibo original y el recurso actual retirado, sin otra fila.
  Runtime no puede modificar ni borrar el historial. Revisión obsoleta, payload
  distinto, docente ajeno, alumno y grupo cancelado no crean eventos de negocio.
- Fallos inyectados al insertar ledger o auditoría para EDIT/PUBLISH/WITHDRAW
  revierten material, contenido e historial juntos. Las filas previas permanecen.
- Retirar deniega una nueva descarga del alumno y conserva exactamente su
  matrícula y la incidencia sin resolver. Otro archivo recibe material/intención
  separados; retirar el anterior conserva sus bytes, grupo y autor original.

Antes y después de cada caso se comparan fingerprints de todas las filas
financieras y de AcademicCourse/Group/Slot/Command/AuditEvent. No se cancelan
matrículas, resuelven incidencias ni alteran precios, reservas, pagos u oferta.

## T058: matriz US3 y resultado automático

| Familia | Comprobación observada |
| --- | --- |
| MV05 | Transiciones, revisión y digest; NO_CHANGE/replay; 14 carreras con locks PostgreSQL observados; rollback material/ledger/auditoría y 15 casos nuevos de auditoría segura |
| MV06 | Permisos vigentes en operación y replay; cambio de docente/cancelación y revocación durante upload; reasignación observada y expiración después de auditoría/antes de commit para los tres comandos |
| MV08 | Corregir no publica; retirar bloquea nuevas lecturas; republicación explícita autorizada; histórico y binario originales preservados; interfaz y E2E real de escritorio/móvil |

Los seis escenarios US3 tienen evidencia automática: US3.1 corrección/conflicto;
US3.2 retiro y descarga nueva denegada; US3.3 republicación explícita; US3.4 sucesor
sin transferencia de autoría; US3.5 material nuevo separado; US3.6 permiso perdido
antes de commit. Las pruebas de T055 usan barreras observadas, no solo demoras.
Una descarga ya autorizada conserva los bytes originales tras el retiro.

Resultados finales de este bloque, sin ejecución concurrente de API y navegador:

| Ejecución | Resultado |
| --- | --- |
| Auditoría nueva focal | 15/15, un archivo |
| Materiales + arquitectura | 404/404, 31 archivos, máximo dos workers |
| Web completa | 614/614, 38 archivos |
| Receptor tras corregir import de tipo Linux | 13/13, mismas aserciones |
| E2E real mediante el script de CI | 42/42: 12 US3 y 30 previos de US1/US2 |

E2E usa desktop/mobile, un worker, cero reintentos, omitidos o inestables; compara
fingerprints financieros por caso. T035 original 17/17 y T036 original 34/34 se
ejecutan nuevamente sin modificar sus archivos. Las 16 pruebas originales de
interfaz de acciones permanecen intactas y pasan dentro de la suite web.

Prisma generate, build API/web, tipos API/materiales y web/materiales, lint API/web
y validación Compose del harness portable terminan con código 0. Esta regresión
de 404 casos no reemplaza la verificación transversal T060. La cobertura API
histórica ampliada de 1865 casos de T051–T053 no se repite en este bloque.

## T059: CI conservado y ampliado

El workflow `.github/workflows/v00-linux.yml` conserva exactamente todos sus pasos
anteriores, incluidas suites 001–003, migraciones, compatibilidad, build, lint y
limpieza `always()` con `docker compose down` sin eliminar volúmenes. Añade tipos
de materiales API/web y el script E2E de materiales. Las pruebas API de materiales
ya quedan incluidas por los selectores existentes de unitarias/integración.

`apps/web/package.json` añade `typecheck:materials`; `test:e2e:materials` hace
build y ejecuta la configuración de materiales con un worker y cero reintentos
explícitos. No cambia dependencias, lockfile ni scripts anteriores. El límite
del job pasa de 20 a 60 minutos para admitir las suites secuenciales existentes
y los 42 casos adicionales de materiales; no se cambian plazos de pruebas.

La comparación estructural resta solo estos dos pasos y el cambio de límite,
y exige igualdad exacta con el workflow previo. También comprueba scripts y
dependencias. No se ejecutó actionlint ni un parser YAML dedicado. Compose se
validó con `config --quiet`, sin imprimir variables privadas. El script E2E nuevo
se ejecutó realmente en Linux sobre el runner existente con código/configuración
y package.json actuales montados en solo lectura. No se reconstruyeron imágenes
desde cero. **No se observó una ejecución remota de GitHub Actions; sigue pendiente.**

El primer chequeo de tipos Linux falló con TS2352 en la prueba previa
`materials-receiver.spec.ts`: ejecutaba `dist` pero tipaba su factory desde `src`.
Con declaraciones generadas actuales, la marca nominal de MaterialDecision no
coincide entre ambos módulos. Se corrige únicamente ese import de tipo a `dist`,
el módulo realmente ejecutado. No se añade cast `unknown`, se excluyen tests ni
relajan aserciones. El chequeo del host había pasado; el fallo Linux se registra
en el resultado versionado. Se repiten tipos Linux y los 13 casos del receptor.

## Reproducción y evidencia

Usar el [entorno aislado](implementation-environment.md), variables de ensayo
inyectadas y Chromium instalado. Desde la raíz del runner Linux:

```sh
node apps/api/scripts/database.mjs generate
npm run build --workspace @academia/api
npm exec --workspace apps/api -- tsc -p tsconfig.materials.json
npm run typecheck:materials --workspace @academia/web
npm run lint --workspace @academia/api
npm run lint --workspace @academia/web
```

Desde `apps/api`:

```sh
node ../../node_modules/vitest/vitest.mjs run tests/integration/materials-audit.spec.ts --maxWorkers=1 --reporter=json --outputFile=/evidence/t057-audit.json
node ../../node_modules/vitest/vitest.mjs run tests/architecture src/modules/materials tests/integration/materials- --maxWorkers=2 --reporter=json --outputFile=/evidence/t057-t059-api.json
```

Desde `apps/web`, ejecutar Vitest sobre `src` con máximo dos workers; desde raíz,
ejecutar el nuevo script que incluye build:

```sh
PLAYWRIGHT_JSON_OUTPUT_NAME=/evidence/t057-t059-e2e.json npm run test:e2e:materials --workspace @academia/web -- --reporter=json
```

El host Windows usa `npm.cmd`. La suite web escribe
`.cache/materials/reports/t057-t059-web.json`. Informes brutos, incluido
`t059-ci-structure.json`, permanecen bajo `.cache/materials/reports/`.
El [resultado versionado](t057-t059-results.json) conserva casos, estados y hashes
de informes, archivos y checkpoints; no contiene credenciales ni bytes privados.

## Preservación y pendientes

Se comparan 1090 archivos previos. Solo cambian workflow, scripts web, el import
de tipo del receptor y documentos de estado previstos; el nuevo test y este
checkpoint se añaden por separado. Producto API/web, aserciones previas, backend financiero/oferta, migraciones,
dependencias, rama y configuración/datos manuales permanecen intactos.
El proyecto temporal se detiene con Compose down sin `-v`, conservando el volumen.

Estado: T001–T059 completadas, 59/68; quedan T060–T068. Continúa T060, verificación
transversal. Aceptación humana T064/MV13, restore cifrado, medición de recursos,
acuerdos D13, capacidad D10 y CI remoto siguen pendientes. No se cierran Izipay,
24 h reales, VPS/despliegue o aceptación integral de 001–003.
