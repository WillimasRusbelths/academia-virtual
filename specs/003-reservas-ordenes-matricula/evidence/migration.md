# T007–T008 — Modelo y migración aditiva verificados

Fecha: 2026-11-01, America/Lima. Base Git
`533b4b618b7d1ad972741e855d67d3fbb14e5a0f`, con T001–T006 locales preservadas,
sin commit nuevo. Continuación autorizada por el responsable tras el cierre T005/T006.
Checklist 12/16 conservado; no se aprueban sus pendientes ni puertas externas.

## Cambio implementado

`apps/api/prisma/schema.prisma` incorpora las quince entidades de data-model.md,
relaciones e índices, siete enums y la descripción nullable de AcademicGroup.
`apps/api/prisma/migrations/0006_enrollment/migration.sql` contiene la evolución
aditiva, sin modificar 0001–0005 ni sus triggers, tipos, datos o checksums.

Incluye:

- Coordinadoras distintas AdmissionSequence/DispatchState, creadas con id fijo 1;
  contador positivo que no retrocede y protección contra borrar las coordinadoras.
- Integridad referencial RESTRICT hacia identidad/oferta, FK compuesta de intento
  con (orderId,studentId), identidades de intención/comando y pago económico con scope.
- Una orden RESERVED por alumno y una iniciación no resuelta por orden mediante
  índices únicos parciales sin now(). Efecto ORDER_EXPIRED/orderId único.
- Estados, moneda PEN/importe entero/revisión, snapshots coherentes, seis fracciones,
  duración fija de 86 400 segundos y forma de campos según estado.
- Historial append-only, identidad/plazos originales protegidos y terminales que
  no retroceden. Las franjas contiguas son válidas; snapshots vacíos, mal formados
  o solapados y conjuntos UUID no canónicos se rechazan.
- Evidencia económica en DECIMAL sin precisión/escala fija impuesta a las unidades,
  con escala separada. INCIDENT conserva moneda/importe incompatibles reales de
  fixture; APPLIED requiere asociación, PEN, escala 2 e importe no negativo.
- Descripción opcional sin backfill. Su guard nuevo mantiene retiro previo para
  editar texto publicado y la pertenencia al curso sigue inmutable por 0005.

La migración solo inserta las dos coordinadoras. No inventa precios, órdenes,
pagos, reservas ni matrículas previas. Los límites BIGINT de precios/totales son de
almacenamiento, no mínimos comerciales, tarifas ni garantías del proveedor.
No se añade UNIQUE a deliveryKey ni FK provisional de recibo a orden sin D02.

Los CHECK no garantizan suma entre filas, capacidad, coincidencias D06, autorización,
autenticidad de pagos ni el protocolo transaccional. Esas capacidades siguen en las
tareas posteriores. Tampoco se recalculan límites originales usando tzdata nueva:
se almacenan y conservan los snapshots; la conversión autoritativa corresponde a T009.

## Generación y revisión de SQL

Se revalidó que existían exactamente cinco migraciones antes de crear 0006.
La base Prisma 0005 se guardó en caché privada, y `prisma validate` aprobó el nuevo
schema. Se generaron 387 líneas base con `prisma migrate diff --from-schema ...
--to-schema ... --script` dentro de la imagen Linux existente, con ambos archivos
montados ro y `--network none`.

El motor Prisma 7.10.0 requiere metadata datasource incluso para este diff. Sin
config explícita devolvía salida vacía/código 0: no se aceptó como generación válida.
El diagnóstico encontró `--datasource <JSON>` ausente; se proporcionó config de diff
con URL ficticia al puerto 1, sin red ni acceso a bases. No se usaron credenciales
reales. El primer intento Windows también encontró spawn EPERM; las repeticiones
solo tuvieron alcance de generación local.

Al SQL generado se añadieron las restricciones manuales revisadas, BEGIN/COMMIT,
NOT NULL de arrays, funciones de validación, guards y coordinadoras. Revisión estática:
15 CREATE TABLE, siete CREATE TYPE, quince CHECK añadidos y quince triggers;
cero DROP/TRUNCATE o alteración de migraciones históricas. Solo la columna opcional
y su guard/check nuevos amplían AcademicGroup. El SQL base/hash y manifiestos privados
permiten distinguir generación automática de restricciones revisadas.

## Ensayos ejecutados

Destino existente `.cache/academic-offering-validation/source`, proyecto
academic-offering-fa3d46bddbb8, APP_ENV=test y base exclusiva academia_v00_test,
roles runtime/migración separados, cero puertos publicados. Se operaron solo db/mailpit
y runners efímeros; no academia-local, bases/cuentas manuales o configuración real.

Cada caso de T006 crea un schema t_ propio, aplica 0001–0005 y prepara datos ficticios
anteriores. Después aplica realmente 0006: ahora se alcanzan los INSERT/UPDATE/DELETE,
constraints y comparaciones que antes quedaban detrás de EnrollmentMigrationMissing.
Los 102 casos originales se conservaron y pasaron; se añadieron veinte casos para
deploy real y guards/representaciones nuevas.

| Ejecución final | Casos | Resultado | Duración del runner |
| --- | ---: | --- | ---: |
| enrollment-migration.spec.ts | 122 | 122 verdes, 0 omitidos | 142.02 s |
| Migraciones identidad/oferta y enrollment-harness | 39 | 39 verdes, 0 omitidos | 52.54 s |
| Lint y build de ambos workspaces, tipos selectivos | — | salida 0 | No es medida de producto |

Total final: 161 casos únicos/ejecuciones, todos verdes en este alcance.
Los UNIT T005 no se volvieron a ejecutar ni implementar: sus fuentes siguen idénticas
y su fase roja se conserva hasta T009. No se declara `npm test` completo o CI verde.

Se ensayaron además dos caminos Prisma mediante los scripts existentes:

1. Snapshot real 0005 con cuentas/sesiones/tokens/correo/cuotas, oferta y auditorías.
   Solo dentro de su schema nuevo, migrate resolve adopta esas cinco migraciones
   ya ejecutadas; database.mjs deploy aplica 0006. Se compararon fingerprint de filas
   previas y seis checksums reales de `_prisma_migrations`. No se resuelve historial ajeno.
2. Instalación nueva con identityDatabase/database.mjs deploy de las seis migraciones.
   Cliente generado lee las dos coordinadoras y confirma cero precios/matrículas.

Generación de cliente dentro de la imagen reconstruida y offline en el host mediante
`node apps/api/scripts/database.mjs generate`, salida 0. El runtime conservó DML y
no pudo CREATE TABLE (42501) antes/después del upgrade. No se otorgó DDL ni se
relajaron TLS/hash/CSRF/cuotas. No se aplicó 0006 a public o al entorno manual.

## Regresión y correcciones durante el bloque

Primera pasada: selección auxiliar de dos casos verdes (otros 102 no seleccionados
por filtro), suite completa de 104 verdes y regresión con 36 verdes/3 fallos.
Los tres fallos eran expectativas que aún suponían cinco migraciones: se actualizaron
el inventario global a seis/28 tablas y el soporte de oferta para que 0005 siga siendo
su migración propia, sin atribuir enrollment al spec002. El historial de oferta conserva
la comprobación exacta de su prefijo; la regresión global exige las seis migraciones.

Después se añadieron los guards de coordinadoras/metadata y controles de snapshots,
arrays y monto incompatible grande. Se reconstruyó la API y se repitieron ambas
suites y checks: resultados finales anteriores. JSON iniciales quedan preservados
privadamente; sus 145 ejecuciones auxiliares no aumentan los 161 casos finales únicos.
306 ejecuciones reales en total contando selección e iteración inicial.

No se debilitaron los 102 casos originales de T006, no se añadieron test.skip/fails,
ni se normalizó una anomalía como un resultado de negocio. No hubo fallos en la suite
de migración. Los clientes no se generan ni migran contra cuentas manuales.

## Reproducción y conservación

Auxiliar privado ignorado `.cache/reservas-t007-t008/run.ps1`:
`powershell -NoProfile -ExecutionPolicy Bypass -File .cache/reservas-t007-t008/run.ps1 -Action <acción>`.
Acciones ejecutadas: config, up, sync, build, smoke, pg, regression, checks, inspect, stop.
Las operaciones Compose fijan proyecto, raíz, env-file y cuatro overlays explícitos.
sync verificó 717 archivos de fuente; build reconstruyó solo API con clientes nuevos.
Comandos de pruebas reales: Vitest run enrollment-migration.spec.ts y las tres suites
de regresión, `--maxWorkers=1`, reporters default/json y resultados privados por caso.

Snapshots t_ antes/después: cero. PostgreSQL 16.14, tzdata 2026b-0+deb12u1.
DB/Mailpit quedaron detenidos; volumen existente
academic-offering-fa3d46bddbb8_postgres_data, creado 2026-10-19T10:45:57Z, conservado.
Mount DB comprobado: ese volumen y solo init-databases.sql de la copia aislada ro.
Muestra final DB/Mailpit: 179.4/21.26 MiB y CPU 0.18/0 %, motor 6.74 GiB.
La regresión y checks coincidieron con parte de PG. La muestra no acredita picos,
capacidad, latencia comercial, D10 ni operación de 24 horas/D13.

La base privada contiene 723 archivos locales iniciales y 74 protegidos; se preservan
las cinco migraciones previas, lockfile, env/secretos, spec/quince respuestas,
constitución/checklist y toda evidencia anterior. Cambian el schema, tasks.md, soporte/
prueba de migración enrollment y tres archivos de regresión afectados; se añaden
0006 y este informe/resultados. Sin hooks before/after_implement registrados.

Auditoría final PASS: 716 archivos iniciales fuera del cambio y los 74 protegidos
conservan sus hashes; los 717 archivos de la copia aislada coinciden con el manifiesto.
Quince enlaces locales válidos, 180 comparaciones de valores sensibles sin coincidencias
y `git diff --check` sin errores. HEAD/rama se mantienen; ocho tareas cerradas y 86 pendientes.

Hashes, imágenes, comandos y resultados por caso:
[t007-t008-results.json](t007-t008-results.json). Las casillas T007/T008 se cierran por
este alcance; quedan 86 tareas. Siguiente bloque propuesto: T009–T010, reglas exactas
de tiempo/dinero y contratos públicos. Reservas, pagos e integración Izipay no están
implementados; D02/economía/D10/D13 y pendientes heredados no se cierran aquí.
