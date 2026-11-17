# T060 — verificación automática transversal

Fecha: 2026-11-17, America/Lima. Alcance: lint, tipos, builds, unitarias,
arquitectura, integración/compatibilidad y E2E de materiales; matriz automática
MV01–MV11. Punto de partida: [checkpoint US3](us3-checkpoint.md), T001–T059
completadas. T061–T068 conservan recuperación, recursos, humanos y cierre.

## Entorno y ejecución

Se reutiliza el proyecto Docker aislado de materiales, su volumen y los roles
owner/runtime de ensayo. PostgreSQL y Mailpit sin puertos publicados. Cada fixture
usa esquema aleatorio y datos ficticios; no se modifica la BD manual. API y
navegador se ejecutan secuencialmente, con máximo dos workers Vitest y uno E2E.
Los comandos de navegador fijan cero reintentos y no producen trace/video/capturas.

Node 22.23.1, npm 10.9.8, Prisma 7.10.0; Linux en Docker Desktop del host Windows.
Imágenes de runners existentes, código/pruebas/configuración actuales en montajes
de solo lectura. No se reconstruyen imágenes ni se instala una dependencia.
Los resultados locales no acreditan una ejecución remota de GitHub Actions.

El arranque inicial no encontró el daemon Docker; se inició Docker Desktop en
segundo plano antes de levantar solo db/mailpit del proyecto aislado. El script
de prerrequisitos encontró la política local de ejecución de PowerShell y se
ejecutó en un proceso con `-ExecutionPolicy Bypass`, sin cambiar la política del
equipo. El directorio efectivo siguió siendo `004-materiales-estudio`.
Checklist de requisitos: 16/16, cero pendientes; sin cambios de marcadores.

## Comandos reproducibles

Usar la configuración del [entorno de implementación](implementation-environment.md),
con variables privadas inyectadas y sin imprimirlas. Desde la raíz del runner API:

```sh
node --version
npm --version
npm run probe:generate
npm run probe:migrate
npm run probe:check
node apps/api/scripts/database.mjs generate
npm run build --workspace @academia/api
npm exec --workspace apps/api -- tsc -p tsconfig.materials.json
npm exec --workspace apps/api -- tsc -p tsconfig.enrollment.json
```

Desde `apps/api`, la selección incluye todos los archivos de los cuatro directorios,
sin filtro que excluya identidad, oferta o matrícula:

```sh
node ../../node_modules/vitest/vitest.mjs run tests/architecture src/modules tests/integration tests/compatibility --maxWorkers=2 --reporter=json --outputFile=/evidence/t060-api.json
node ../../node_modules/vitest/vitest.mjs run tests/architecture src/modules/materials tests/integration/materials- tests/integration/academic-offering-preparation.spec.ts tests/integration/academic-offering-publication.spec.ts tests/integration/enrollment-migration.spec.ts tests/integration/migrations.spec.ts tests/contracts --maxWorkers=2 --reporter=json --outputFile=/evidence/t060-api-final.json
```

Desde la raíz del host Windows:

```powershell
npm.cmd run lint --workspace @academia/api
npm.cmd run lint --workspace @academia/web
npm.cmd run typecheck:materials --workspace @academia/web
```

Desde `apps/web`, con las dependencias existentes:

```sh
node ../../node_modules/vitest/vitest.mjs run src --maxWorkers=2 --reporter=json --outputFile=../../.cache/materials/reports/t060-web.json
```

Desde la raíz del runner de navegador, con Chromium instalado y 5173 libre dentro
del contenedor, tras generar Prisma y compilar API:

```sh
npm run typecheck:materials --workspace @academia/web
npm run typecheck:enrollment --workspace @academia/web
PLAYWRIGHT_JSON_OUTPUT_NAME=/evidence/t060-e2e.json npm run test:e2e:materials --workspace @academia/web -- --reporter=json
```

El script incluye build web. No reutiliza un servidor manual: la fixture levanta
API real, PostgreSQL y proxy Vite para cada caso. Windows usa `npm.cmd` donde
corresponda. Informes brutos bajo `.cache/materials/reports/`; el resultado
versionado registra casos y hashes sin credenciales, payloads o bytes de archivo.

## Resultado

Primera ejecución API: 3937/3943 aprobados, 169 archivos, seis fallos y cero
omitidos. Los seis fallos son inventarios anteriores de migraciones: dos pruebas
de oferta esperaban siete entradas, y las listas cerradas de matrícula/migraciones
no incluían 0009. Se actualizan únicamente esos conteos/listas y dos títulos;
checksums, filas previas, restricciones, permisos y reglas financieras permanecen.

La revisión encontró además nombres que API aceptaba pero la pantalla/descarga
rechazaban, por ejemplo `lectura?.pdf`. La reproducción nueva, antes del cambio,
produce 12 fallos esperados y un control Unicode aprobado. Se filtra solo la parte
pura; el caso HTTP queda omitido expresamente en ese informe rojo. No se presenta
como verificación final ni como un fallo previo de la regresión de 3943 casos.

Se alinean dos validadores API con el cliente existente: normalización de metadata
y capacidad binaria interna rechazan `<`, `>`, `"`, `|`, `?` y `*`. No se renombran
archivos o se cambian bytes, datos anteriores, tablas o migraciones. La prueba nueva
también exige 400 HTTP sin persistir intenciones ni modificar finanzas, y liberación
de la plaza si se intenta construir una respuesta binaria inválida. El control
válido conserva Unicode, espacios y paréntesis.

La ejecución final focal repite todos los materiales y arquitectura, los cuatro
archivos afectados por inventarios de migraciones y los cuatro contratos de
matrícula: **687/687 en 37 archivos**, cero fallos u omitidos. Incluye 418 casos
de materiales/arquitectura, 265 de las cuatro suites anteriores y cuatro contratos.
La prueba nueva pasa 14/14, incluido HTTP real con todos los caracteres rechazados.
Los 3274 casos de los otros 134 archivos de la ejecución inicial habían pasado.
Cobertura API resultante: **3961/3961 en 171 archivos**, compuesta entre ambas
ejecuciones, no una segunda ejecución completa de las 169 suites originales.

Web completa: **614/614 en 38 archivos**, cero omitidos. Prisma generate,
compatibilidad de roles/migraciones, build API, tipos API/materiales y matrícula,
y lint API/web aprobados. Tipos Linux web/materiales y matrícula, más build web,
también aprobados. API inicial tarda 23,89 minutos, focal final 4,30 minutos y
web 15,83 segundos; son tiempos de pruebas, no mediciones de capacidad del producto.
E2E final: **42/42**, 5,1 minutos, escritorio y móvil, un worker, cero reintentos,
omitidos o inestables. Incluye 12 US3 y 30 previos; los fingerprints financieros
de cada caso se conservan. Las 16 pruebas originales de interfaz permanecen intactas.
[Resultado con casos y hashes](t060-results.json).

## Matriz MV01–MV11

La revisión cubre los siguientes oráculos; las expectativas previas de negocio se
conservan y se añade la regresión de nombres. El resultado final depende de las
ejecuciones registradas:

| Familia | Suites principales y oráculo |
| --- | --- |
| MV01 | format/upload/complete/publish/download, management/student E2E: PDF/JPEG/PNG, PREPARED privado, publicación explícita, bytes y SHA-256 completos |
| MV02 | authority/enrollment/download/management-http/student-queries: actores, estados, grupo propio/ajeno, referencias directas, DTO mínimo y sin datos ajenos |
| MV03 | files/format/complete/receiver/filename-contract: 0/1/20 000 000/20 000 001, MIME/extensión, truncado, longitud/hash, nombres consumibles y contenido previo intacto |
| MV04 | upload-intents/complete/upload-races: completados concurrentes, rollback, dos reinicios reales PENDING/COMPLETED, respuesta perdida y recuperación manual sin duplicación |
| MV05 | schema/commands/commands-http/command-races/audit: revisión/digest, NO_CHANGE/replay, atomicidad de material/ledger/auditoría, historial seguro e inmutable |
| MV06 | authority/upload-security/command-races: revocación, rol, asignación y cancelación tras primer chunk o antes de locks/commit; replay reautoriza |
| MV07 | enrollment/enrollment-participant/download/download-resources/student E2E: vigencia original a microsegundos, reserva/pago/incidencia no habilitan, oferta retirada no revoca matrícula |
| MV08 | transitions/commands/command-races/actions E2E: edición sin publicación, retiro deniega solicitud nueva, republicación explícita, nuevo archivo separado y autor original |
| MV09 | admission/upload-races/upload-security/download-resources: 2 plazas globales/1 actor antes de bytes, abortos/plazo, cuotas con dos procesos, 53100/53200 inyectados y recuperación de plazas |
| MV10 | upload/receiver/binary-response/download/audit/http-security/session: JSON 16 KiB, excepción PUT exacta, CSRF/Origin, HEAD/Range, sesión antes de bytes y errores posteriores sin segundo cuerpo |
| MV11 | unitarias management/student/material-actions y tres suites E2E: errores/vacío/denegado/conflicto/incierto, borrador e intención estables, cuenta/ruta/logout, respuestas tardías, Blob URLs, teclado y móvil automáticos |

MV09 verifica límites y fallos inyectados, sin medir capacidad física o aceptar
D10; los recursos reales corresponden a T063. MV11 registra recorridos automáticos;
la observación con gestor/alumno reales sigue pendiente en T064/MV13.

## Revisión de carreras y privacidad

Revisión del coordinador, comandos, contenido, receptor binario, consultas, respuesta
binaria interna, cliente HTTP y controladores/rutas web:

- Locks de cuentas UUID, sesión, curso, grupo y material en orden; topología
  revalidada y permiso vigente antes del ledger. La sesión se vuelve a comprobar
  después del callback y antes de commit. Las pruebas de carreras observan bloqueo
  PostgreSQL; no sustituyen concurrencia por una espera arbitraria.
- Comandos y auditoría usan la misma transacción e instante exacto. Replay lee
  permiso actual, conserva el recibo y proyecta el recurso actual. Binario, grupo
  y autor original no se sustituyen mediante corrección.
- La plaza se adquiere antes del buffer/SELECT bytea y se libera al terminar o
  abortar. No se mantiene conexión o transacción SQL durante el envío por red.
  HEAD no selecciona bytes. No se promete memoria constante ni retirar bytes
  previamente autorizados o descargados legítimamente.
- Proyecciones explícitas de alumno, sin ledger, digest, emails, pagos o bytea.
  Auditoría/logs y errores usan campos cerrados; los fallos SQL quedan privados.
  La respuesta binaria opaca no pasa por JSON y los headers impiden caché/visor.
- Cliente same-origin/no-store, sin replay automático; comprueba status, headers,
  tamaño y generación de sesión. Logout/cambio de cuenta aborta y descarta respuestas
  tardías. URLs Blob transitorias se revocan; sin persistencia de bytes en storage.

## Preservación y límites

La comparación acumulada de 1092 archivos parte de los checkpoints históricos y
del resultado T057–T059. Solo cambian los dos validadores de nombres, los cuatro
inventarios de migraciones y documentos previstos; se añade la suite de regresión.
El verificador reconstruye las cuatro pruebas anteriores deshaciendo exclusivamente
los conteos/listas/títulos indicados y exige sus hashes originales: las aserciones
de negocio no cambian. Workflow/scripts, migraciones, dependencias, backend
financiero/oferta, rama y datos/configuración manuales se conservan. Se comprueban
hashes de cada checkpoint y archivo previo, no solo el diff de Git de tracked.

Al finalizar se detiene únicamente el proyecto efímero con Compose down sin `-v`,
conservando el volumen. Estado: **T001–T060 completadas, 60/68**, ocho pendientes;
continúan T061–T062. Pendientes: MV12/restore cifrado T061–T062, recursos T063,
humanos T064/MV13, acuerdos D13, capacidad D10, CI remoto y cierre integral. No se
cierran Izipay real, 24 h reales, VPS/despliegue ni aceptación pendiente de 001–003.
