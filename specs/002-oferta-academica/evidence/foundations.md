# Checkpoint de fundamentos — T018

Fecha: 2026-10-20 (America/Lima). Rama: `feat/002-oferta-academica`.
Base: `461bba9`, árbol inicial limpio. Los bloques anteriores ya estaban confirmados;
no había archivos pendientes que incluir en un commit previo.

## Alcance y puertas

Speckit-implement limitado a T018. Se ejecutó prerequisites de 002 con -Json
-RequireTasks -IncludeTasks y se revisaron tarea/dependencias, constitución 1.1.0,
plan, investigación/modelo/contratos pertinentes, guía local y evidencias previas.
Checklist requirements.md: 16/16 aprobado, solo lectura. Sin AGENTS.md aplicable o
extensions.yml/hooks. Los ignores existentes cubren configuración, secretos y reportes privados.

Este checkpoint exige T005/T006/T012/T017 verdes, migración vacía/incremental y
regresión de acceso, sesiones, reset y bootstrap. La ejecución completa de integración
añade cobertura de todos los demás archivos existentes de API; no se seleccionan solo
los académicos para ocultar una regresión. Las cinco aclaraciones y E1 se conservan;
no se modifican sus criterios, el negocio o las implementaciones de identidad/oferta.
T019 y tareas posteriores quedan sin ejecutar.

## Incidencia de fixtures encontrada y corrección mínima

Antes de modificar pruebas se ejecutó bootstrap-cli-diagnostic.spec.ts tal como estaba:
ocho fallos SQL **0A000**, «cannot truncate a table referenced in a foreign key constraint».
La limpieza anterior truncaba User sin las tablas académicas que lo referencian desde 0005.
Esos fallos ocurrieron antes del diálogo PTY: **no** constituyen evidencia de que las
aserciones de bootstrap hubieran sido ejecutadas ni reproducen su intermitencia histórica.
Se conserva el informe privado bootstrap-before.json y su resumen sanitizado.

Se corrigió exclusivamente la lista explícita de TRUNCATE en cinco suites:

- `apps/api/tests/integration/bootstrap-cli-diagnostic.spec.ts`.
- `apps/api/tests/integration/bootstrap-cli.spec.ts`.
- `apps/api/tests/integration/bootstrap-store.spec.ts`.
- `apps/api/tests/integration/us6-bootstrap-guards.spec.ts`.
- `apps/api/tests/integration/fixture-safety.spec.ts`.

Se incluyen AcademicSlot/Group/Course/Command/AuditEvent junto a las ocho tablas de
identidad ya limpiadas. Se usa el ownerQuery y esquema t_* exclusivo ya creado por cada
suite. No se añade TRUNCATE CASCADE ni se limpia public, datos manuales u otros esquemas.
Las operaciones anteriores de preparación/limpieza de cada prueba se conservan.

La comparación de cada archivo con HEAD, deshaciendo únicamente esa sustitución de
texto y normalizando saltos de línea, da igualdad en los cinco: **aserciones, cantidad de
casos, timeouts, parser PTY y entradas de la CLI intactos**. No se altera código de
producto, migraciones históricas o configuración para obtener aprobación. Es soporte
mínimo para ejecutar la regresión sobre el esquema aditivo vigente.

La primera ejecución completa tras esa corrección dio **895/896 aprobadas** (52 archivos),
con un único fallo de entorno en mail-delivery.spec.ts: ECONNREFUSED al consultar
127.0.0.1:3000/health/ready. Sus aserciones de entrega ya habían pasado, pero no se
alcanzó la aserción de readiness: el runner efímero no había iniciado el servidor que
presupone el comando completo. Se conserva integration-no-api.json/log; no se presenta
como fallo funcional esperado, ni como checkpoint aprobado o defecto de bootstrap.

Se corrigió únicamente la orquestación privada: tras compilar, iniciar el **main.js real**
en el mismo contenedor con API_HOST=127.0.0.1, comprobar ready/live 200 antes de ejecutar
tests y cerrar ese proceso en finally. No se añadió un health ficticio ni se cambió esa
prueba. Se repite la integración completa; api-preflight.json conserva la comprobación
y el cierre. El preflight operativo no cambia los límites de los tests.

## Procedimiento ejecutado

Proyecto `academic-offering-fa3d46bddbb8`, copia existente en
`.cache/academic-offering-validation/source`, mismo volumen creado el
2026-10-19T10:45:57Z. Se valida Compose (APP_ENV=test, sin puertos publicados, volumen
propio) y se reanudan solo DB/Mailpit. Compose recreó el contenedor DB **aislado** al
reanudar; se conserva su volumen. No se regenera .env ni se ejecuta configure.mjs.

Las diez fuentes verificadas de T015–T017 coincidían con su evidencia y se sincronizó
la copia aislada antes de ejecutar. Solo se copiaron después los cinco archivos de
fixtures revisados. Source/tests/ops-lint se montan en lectura sobre la imagen existente.
Cada contenedor compila su fuente antes de consumir dist, también para la CLI y el scanner
de políticas. No se usan los artefactos antiguos de la imagen como evidencia del código final.

Para incluir la comprobación PostgreSQL de compatibilidad del comando estándar de API,
se ejecutaron probe:generate, db:generate, probe:migrate y probe:check en el proyecto
aislado. La migración de compatibilidad **ya existente** se aplica a academia_v00_test;
no se crea SQL o migración nueva. No se aplica en la instalación manual. Las pruebas
de identidad/oferta siguen migrando únicamente sus esquemas t_* mediante el harness.

Runner privado: `.cache/academic-offering-validation/t018/run.ps1` y verify.mjs.
Informes nuevos: `t018-reports/`; los bloques anteriores no se sobrescriben. Comprobaciones
pesadas secuenciales, maxWorkers=1; ningún bucle de repetir tests hasta que pasen.

Comandos dentro de contenedores efímeros de ese proyecto, con los cuatro Compose documentados:

```text
npm run probe:generate
npm run db:generate
npm run build --workspace apps/api
npm run probe:migrate
npm run probe:check
npm exec --workspace apps/api -- vitest run tests/integration/bootstrap-cli-diagnostic.spec.ts <flags>
npm run test:integration --workspace apps/api -- <flags>
npm run test:unit --workspace apps/api -- <flags>
npm run lint --workspace apps/api
```

`<flags>` = `--maxWorkers=1 --reporter=verbose --reporter=json --outputFile.json=/reports/<acción>.json`.
El diagnóstico sin corregir se registra como bootstrap-before; no se suma como aprobación.
test:integration descubre runtime/postgres de compatibilidad y **todo** tests/integration.
No se ejecutan E2E, carga, restauración o CI remota en este checkpoint.
Mailpit permanece en modo capture y disponible; no se activa TEST_MAILPIT_DOWN ni se
repite el ensayo específico de caída SMTP de T106. El nombre de ese caso condicional
no acredita aquí una caída real, y el SMTP externo permanece sin validar.

## Resultados y trazabilidad

| Lote final | Resultado real |
| --- | --- |
| Integración API completa, compatibilidad runtime/PostgreSQL incluida | **896/896**, 52 archivos, cero fallos/omitidos; exit 0 |
| Unitarias y arquitectura API | **106/106**, 16 archivos: 92 unitarias y 14 de arquitectura; exit 0 |
| Clientes Prisma probe/aplicación y compilación tsc API | Exit 0, fuente final de cada contenedor |
| Migración/permisos de compatibilidad existentes | probe:migrate y probe:check exit 0, solo academia_v00_test aislada |
| Lint API completo | Exit 0, src/tests/config |

**1002 casos finales únicos aprobados**; los lotes previos y sus repeticiones no se suman
de nuevo. No se afirma cobertura E2E o validación de todo el monorepo web. Estas cifras
son casos ejecutados, no usuarios concurrentes.

Las filas siguientes son subconjuntos de esos lotes, no ejecuciones adicionales:

| Puerta / regresión exigida | Casos aprobados | Comprobación alcanzada |
| --- | --- | --- |
| T005, academic-offering-migration | 24/24 | Deploy vacío 0001–0005; cinco tablas vacías, default bigint 0, vista SQL mínima, runtime sin DDL; restricciones y repetición del deploy |
| M05 de T005, actualización incremental | Incluido en 24 | Aplicar 0005 a copia ficticia con 0001–0004; fingerprint de identidad idéntico salvo columna nueva default 0, sesiones/tokens/auditoría/correo/bootstrap conservados |
| T006, academic-offering-eligibility | 18/18 | Pérdida incrementa generación; recuperar cuenta/nombre/reset/no-op no renueva publicación; overflow/rollback/inmutabilidad |
| Modelo SQL adicional | 6/6 | Retiro antes de editar, pertenencia y cancelación terminal, snapshot por publicación explícita |
| T012, academic-offering-transaction | 33/33 | 12 protocolo real + 15 escritor/ledger + 6 controles SQL/helper, con barreras y estado persistido |
| Protocolo y escritor adicionales | 8/8 y 7/7 | Acceso vigente, padre, presupuesto compartido, errores seguros, atomicidad y replay reales |
| T017, tres suites de arquitectura | 14/14 | Grafo/núcleo puro y sin ciclos, superficies públicas, políticas explícitas y matriz académica |
| Acceso, access-change y access-guard | 30/30 | Rol/estado/revocación, reautorización y regresión de comandos de identidad |
| Sesiones, store y lifecycle | 35/35 | Caducidad, revocación, actividad y sesión vigente |
| Reset, contract/store/concurrency | 49/49 | Restablecimiento, token/credencial, concurrencia y rollback |
| Bootstrap, store/CLI/guards/diagnostic | 42/42 | 24 store, 6 CLI, 4 guardas y 8 pares de diagnóstico; aserciones completas tras corregir la limpieza |

Los seis controles B01–B06 no se atribuyen como validación suficiente del protocolo;
G02 solo controla el hook temprano. Las garantías académicas corresponden a las pruebas
del adaptador/escritor reales. Las comprobaciones HTTP de C03 usan una entrada exclusiva
del ensayo, sin rutas académicas de producto o aceptación funcional nueva.

[Resumen sanitizado](foundations-results.json): todos los archivos y sus resultados,
detalles de los 266 casos de puertas/regresión exigida, huellas de fuentes/reportes,
preflight real, incidencias iniciales y límites. Los reportes crudos completos quedan
privados en t018-reports, identificados por SHA-256 para su contraste/reproducción.

## Hallazgos heredados y límites

El [hallazgo intermitente original de bootstrap](../../001-identidad-acceso-roles/evidence/us5.md#hallazgo-intermitente-de-bootstrap-cli)
y su [seguimiento T106](../../001-identidad-acceso-roles/evidence/regression.md) siguen
**abiertos**. El lote original dio 151 aprobadas/1 fallo, de causa no confirmada;
las repeticiones posteriores y diagnósticos acotados no establecieron su causa.
La incompatibilidad de TRUNCATE encontrada aquí tiene causa SQL identificada y se
distingue de aquel fallo del diálogo. No se modifica el parser, la CLI o el límite
de 12 s por hipótesis ni se declara resuelta la intermitencia porque este lote pase.

Se conserva también el timeout histórico de arquitectura T013 y su repetición aprobada;
las verificaciones actuales mantienen el límite de 15000 ms y no reescriben esa evidencia.
No reapareció: la comprobación ESLint del código real pasó en aproximadamente 4222 ms.

D04 y la parte de matrícula de D06, T104/T108, SMTP real, D10/D13, video y capacidad no
aprobada permanecen pendientes. Pasar fundamentos no acepta los recorridos funcionales
de oferta ni reemplaza la observación humana. No se implementan matrícula, pagos,
reservas o clases ni se declara capacidad para 1000 concurrentes.

## Conservación y estado final

Catálogo aislado: identidad conserva 0001–0005 y checksum de 0005, más 0001_probe de la
compatibilidad existente. Cinco tablas académicas, cuatro triggers, 21 checks y vista
AcademicTeacherDirectory; cero usuarios en public, runtime sin CREATE y cero esquemas
t_academic_* residuales. El proceso API del preflight cerró; DB/Mailpit aislados detenidos
al acabar con el mismo volumen. Sin purgas, reset, db push, down -v o SQL de negocio nuevo.

Manual: mismo contenedor e804ca17a1d5, exited y mismas fechas de último arranque/detención
2026-10-18T19:19:45.837265111Z / 2026-10-18T21:58:41.760194769Z; solo lectura de metadatos.
Volúmenes de datos/secretos conservados. No se arrancó, consultó o migró esa base, ni se
montó su volumen en otro contenedor. No se atribuye un recuento nuevo a sus cuentas.
**72/72 archivos protegidos y 19/19 fuentes verificadas de T014–T017 idénticos**;
configuración, credenciales, lockfile, primer spec/evidencia y documentos originales de
002 conservados. Git confirma cero cambios en código de producto y Prisma/compatibilidad.

T018 **completa**: sus cuatro puertas y regresión exigida están verdes; incidentes de
fixtures/entorno corregidos y repetidos con evidencia real. Sin una regresión actual
pendiente del incremento, conservando el hallazgo histórico no resuelto de bootstrap.
T019–T074 permanecen pendientes, sin iniciar US1. Siguiente bloque recomendado:
T019–T022, pruebas de reglas, HTTP/PG y recorridos de preparación; empezar por T019/T020.

Constitución I/II/IX/X/XI comprobada: alcance pequeño, autorización backend existente,
entornos separados, migraciones controladas intactas y límites de capacidad explícitos.
Tras revisar el diff se confirma este bloque en un commit local con sus cinco ajustes
de fixtures, tasks.md y dos evidencias; consultar `git log -1 --oneline --
specs/002-oferta-academica/evidence/foundations.md` para su identificador. Sin push.
