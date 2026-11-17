# Uso local y validación — materiales 004

**Cierre T064/T067 — 2026-11-17, America/Lima.** El responsable confirmó «ahora si funciona todos los recorridos», después de repetir el ensayo tras la corrección del PDF. T064 queda completada para el recorrido global de gestor y alumno en laptop, con consentimiento previamente comunicado. Es un resultado comunicado por el responsable, sin observación directa del agente ni desglose de cada paso, formato, ayuda o duración. Móvil no observado; SO, navegador y uso específico de puntero/teclado no informados. H-PDF-01 queda resuelta tras esta repetición humana. T067 completa la sincronización documental; D13/T065, D10/T066 y el cierre integral T068 permanecen pendientes. Avance **65/68**, tres pendientes. [Registro de cierre](evidence/t064-t067-report.md).

Fecha: 2026-11-17, America/Lima. US1 permite preparar y publicar con ADMIN o
TEACHER autorizado. El [checkpoint US1](evidence/us1-checkpoint.md) registra las
ejecuciones observadas. T041/T042 añaden consulta y descarga HTTP de US2;
T043/T044 implementan el cliente y la pantalla alumno. T045–T047 conectan las
matrículas y verifican US2 con E2E real: [checkpoint](evidence/us2-checkpoint.md).
T048–T050 registran las pruebas previas de US3: [ejecución](evidence/t048-t050.md).
T051–T053 implementan edición/retiro/republicación en el backend, con las pruebas
de dominio/PG/HTTP aprobadas: [evidencia](evidence/t051-t053.md). T054–T056 añaden
interfaz de corrección/retiro, carreras con barreras y E2E US3:
[evidencia](evidence/t054-t056.md). Las 16 pruebas previas de interfaz pasan.
T057–T059 comprueban auditoría segura, registran el
[checkpoint US3](evidence/us3-checkpoint.md) e incorporan materiales al CI.
Aceptación humana en laptop comunicada; ejecución remota de CI y puertas operativas pendientes.

T060 completa la [verificación transversal automática](evidence/automated.md):
3961 casos API aprobados entre ampliada y focal final, web 614/614 y E2E 42/42.
Corrige el rechazo de nombres incompatibles con el cliente y actualiza únicamente
inventarios aditivos de migraciones en pruebas previas. No renombra archivos o
cambia contenido existente. T061–T062 completan el [ensayo de recuperación](evidence/recovery.md):
upgrade 0007, reinicio y restore cifrado en otra BD, bytes completos y sesiones
invalidadas. T063 completa la [medición local de recursos](evidence/local-resources.md).
Estado 65/68; T064 completada en laptop según el responsable: [registro humano](evidence/human-acceptance.md). Laboratorio temporal detenido, datos conservados.
T065–T066 cuentan con [procedimiento operativo](operation.md) y
[escenario de capacidad](capacity.md) preparados. El responsable confirmó que
los acuerdos D13 y la rúbrica/infraestructura D10 aún no están disponibles:
[informe](evidence/t065-t066-report.md). Siguen pendientes T065, T066 y T068. T067 completada; T068 conserva la [revisión preliminar de aceptación](evidence/final-acceptance.md), con dependencias operativas pendientes.

## Preparación y comandos

Preservar archivos/configuración/cuentas y evidencia previa. Usar Node/npm fijados
y lockfile; PostgreSQL real mediante el [harness aislado](../../ops/docker/test-harness.md).
La [configuración efectiva](evidence/implementation-environment.md) describe roles,
variables y ejecución local. Las fixtures crean un esquema por ensayo y aplican la
cadena normal, incluidas 0008 y 0009; solo el owner migra/limpia y runtime recibe
DML. No ejecutar reset, db:migrate:dev o bootstrap sobre la BD manual ni eliminar
volúmenes. Este checkpoint no desplegó las migraciones al entorno manual.

Las fixtures US1 usan actores y archivos ficticios, grupos asignados/ajenos y
cancelados, y PostgreSQL real. Las matrículas y descargas de alumno de la matriz
posterior corresponden a US2. No se necesitan cobros, sandbox o VPS para US1.

Desde la raíz, con las dependencias existentes:

```powershell
npm.cmd run lint --workspace @academia/api
npm.cmd run lint --workspace @academia/web
npm.cmd run build --workspace @academia/web
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.materials.json
npm.cmd run typecheck:materials --workspace @academia/web
```

En el runner aislado configurado (APP_ENV=test, URLs owner/runtime y claves de
ensayo inyectadas, sin imprimirlas), generar Prisma y compilar API antes de las
suites HTTP. El [checkpoint](evidence/us1-checkpoint.md) conserva la selección exacta
de regresiones; esta selección sirve para repetir la gestión US1:

```powershell
node apps/api/scripts/database.mjs generate
npm.cmd run build --workspace @academia/api
Set-Location apps/api
node ../../node_modules/vitest/vitest.mjs run tests/architecture src/modules tests/integration/materials-management-http.spec.ts tests/integration/materials-upload-races.spec.ts tests/integration/materials-upload-security.spec.ts tests/integration/http-security.spec.ts --maxWorkers=2
Set-Location ../..
npm.cmd run test:e2e:materials --workspace @academia/web
```

En Linux usar npm en lugar de npm.cmd. La selección completa está en el checkpoint.
Chromium debe estar instalado
en el runner de navegador. La fixture de materiales inicia su propia API y Vite
en loopback: 5173 debe estar libre dentro del runner; no reutiliza un servidor manual
ni requiere publicar puertos. Ejecuta desktop/mobile, un worker, cero reintentos,
sin trace, screenshots o video. Los overlays privados bajo .cache/materials son
configuración local ignorada y no un paquete portable del repositorio.

Para la regresión web completa, desde apps/web ejecutar
`node ../../node_modules/vitest/vitest.mjs run src --maxWorkers=2`.
Verificar resultados; conservar contratos y expectativas de 001–003.

El workflow `v00-linux.yml` conserva las suites anteriores y añade tipos API/web
de materiales y `npm run test:e2e:materials --workspace @academia/web` dentro del
servicio `browser-tests` del harness existente. El script hace build y fija un
worker y cero reintentos. La ejecución local del comando está registrada en el
checkpoint US3; no acredita un pase remoto de GitHub Actions.

## Preparar y publicar

Con una sesión autorizada, abrir `/materiales` y elegir un grupo, o entrar desde
la gestión/detalle docente del grupo mediante «Gestionar materiales del grupo».
La ruta directa es `/materiales/grupos/:groupId`. El backend comprueba acceso;
conocer la URL no lo concede. El docente necesita asignación y habilitación actuales.

1. Escribir título (1–200 caracteres Unicode tras trim), descripción opcional
   (hasta 2000) y elegir PDF, JPG/JPEG o PNG de 1 a 20 000 000 bytes (20 MB decimal).
   El navegador comprueba preliminarmente y calcula SHA-256; el servidor valida
   longitud, digest y estructura. Esto no constituye análisis antivirus.
2. Pulsar «Preparar material». El registro de intención y el envío son pasos
   distintos; la pantalla no inventa porcentajes. Solo la respuesta durable
   acredita PREPARED. El archivo y grupo quedan inmutables.
3. Revisar el preparado, pulsar «Publicar» y confirmar el diálogo. Cancelar conserva
   el preparado. PUBLISHED acredita publicación de gestión. La descarga HTTP exige
   matrícula vigente al alumno; su acceso se realiza desde «Mis matrículas».
   Preparar por sí solo nunca publica.

File y textos viven en memoria. Un error recuperable los conserva mientras siga
vigente esa sesión/vista; recargar exige reseleccionar el archivo. Si el resultado
es incierto, consultar la intención antes de reintentar manualmente: PENDING permite
reanudar el envío; COMPLETED recupera el material sin reenviarlo. Si se perdió la
respuesta del registro, repetir su identidad resuelve el uploadId antes de los bytes.
Cambiar texto/archivo crea otra intención. La publicación incierta conserva commandId;
un conflicto exige comparar/adoptar la revisión explícitamente. No hay replay
automático al recargar/login. Logout, cambio de cuenta/ruta o pérdida de sesión
aborta solicitudes y descarta respuestas/estado anterior.

## Límites efectivos y alcance

JSON conserva 16 KiB. Solo el PUT binario de ruta exacta admite octet-stream,
sin compresión, hasta 20 000 000 bytes reales. Hay dos transferencias globales y
una por actor por proceso, sin cola; timeout por defecto 60 000 ms. Configuración:
MATERIALS_TRANSFER_LIMIT 1–2, MATERIALS_ACTOR_TRANSFER_LIMIT solo 1,
MATERIALS_UPLOAD_TIMEOUT_MS 1000–300000. No mantener una transacción mientras
llegan los bytes; el buffer acotado y copias del driver sí consumen RAM.

La admisión durable limita a 30 intenciones nuevas/actor/60 s entre procesos.
Replay se resuelve antes de cuota; consultar estado, completar y publicar no la
consumen. 429 incluye Retry-After 1–60; las fechas futuras cuentan conservadoramente.
Detalle y casos de indisponibilidad en [política](evidence/upload-limits.md).
No hay cuota agregada de almacenamiento, TTL o purga. Un 503 o pérdida de respuesta
exige resolver el resultado durable y no demuestra rollback.

US1 probado localmente: gestión HTTP, preparación/publicación, autorización,
integridad, carreras, reinicio y recuperación de respuesta perdida; interfaz de
gestor en desktop/mobile y teclado. T041/T042 verifican derecho temporal del alumno,
listado/detalle y descarga binaria HTTP con GET/HEAD. T043/T044 implementan el
cliente y pantalla alumno; T045–T047 conectan rutas/enlaces y verifican E2E real.
US3 backend disponible desde T051–T053: edición/retiro/republicación con revisión,
ledger y auditoría atómicos. T054–T056 añaden sus pantallas, carreras con barreras
y E2E US3. La matriz ampliada de auditoría T057 y el checkpoint US3 T058 siguen
pendientes.

Descarga backend: `GET /api/v1/materials/items/:materialId/content` devuelve el
archivo completo con cookie vigente, attachment, Content-Length, MIME validado,
no-store/nosniff/no-referrer. `HEAD` reautoriza y devuelve solo metadatos, sin leer
bytea ni ocupar plaza binaria. Range y validadores no evitan autorización: GET
entrega 200 completo, sin 206/304, enlaces públicos o redirección. El gestor puede
descargar sus estados autorizados sin matrícula; grupo cancelado solo permite
consulta/descarga histórica al administrador. El alumno ve solo publicaciones de
su matrícula vigente original, con precisión de microsegundos.

Las plazas se comparten entre carga y descarga: 2 globales y 1 por actor, antes de
leer bytes. Se liberan al terminar/cerrar/fallar; no hay transacción o conexión SQL
ocupada mientras se envía el Buffer completo. Esto no promete RAM constante ni
capacidad medida. Evidencia del bloque en [T041/T042](evidence/t041-t042.md).

La pantalla de alumno T044 muestra grupo/curso, publicaciones, formato/tamaño y
fecha, con paginación y reintento manual. «Descargar» recibe y comprueba el archivo;
solo entonces aparece «Guardar archivo». Su URL Blob se revoca tras usarla,
reemplazarla o desmontar el componente. Denegación/sesión vencida descartan grupo,
materiales y enlaces; respuestas tardías no crean URL. No hay bytes/URLs en
almacenamiento persistente. La descarga requiere 200 completo, longitud/tipo/nombre
coherentes y cabeceras privadas; no se admite 206/304 o redirección.

El [bloque T043/T044](evidence/t043-t044.md) conserva 587 pruebas web y ocho
comprobaciones Chromium con API simulada. El [checkpoint US2](evidence/us2-checkpoint.md)
añade navegación y E2E con backend real: API 1813/1813, web 590/590 y navegador
30/30 (20 alumno + 10 gestión), escritorio/móvil, cero reintentos. No equivale a
aceptación humana.

Con sesión de alumno, abrir «Mis matrículas» desde Inicio y elegir «Ver materiales
del grupo» en una matrícula vigente, desde la lista o su detalle. Las históricas
no muestran ese enlace. `/materiales` lista grupos accesibles; la URL directa
`/materiales/grupos/:groupId` consulta el mismo backend autorizado. El catálogo
retirado no impide entrar mediante la matrícula vigente original. Gestores
conservan sus vistas en esas mismas rutas según la audiencia de su sesión.

Seleccionar «Descargar» y, tras recibir el archivo íntegro, «Guardar archivo».
Ambas acciones funcionan con teclado. Un error recuperable ofrece reintento
manual; un vacío autorizado tiene su mensaje propio. Pérdida de acceso/sesión
descarta materiales y enlaces. Cambiar cuenta/grupo o salir de la pantalla
desmonta su ámbito, aborta peticiones y revoca URLs transitorias. El E2E verifica
también un cuerpo tardío obtenido de la API real tras logout y otro login.

## Matriz de cobertura del spec completo

| ID | Comprobación exigida | Requisitos/resultados |
| --- | --- | --- |
| MV01 | Preparar/publicar/descargar PDF/JPG/JPEG/PNG válidos; comparar bytes completos/hash. | FR-001–006; SC-001 |
| MV02 | Matriz de actores/estados y referencias directas: ningún acceso ajeno entrega contenido/datos. | FR-002,007–010; SC-002 |
| MV03 | 0, 20 000 000, 20 000 001 bytes; extensión/MIME falsos, truncados de cada formato, hash/longitud incoherentes. Previo intacto. | FR-004–005; SC-003 |
| MV04 | Pérdida de respuesta/commit ambiguo, duplicados simultáneos, payload distinto con misma identidad, reinicio PENDING/COMPLETED: un efecto. | FR-013–015; SC-004 |
| MV05 | Edición/publicación/retiro concurrentes con barreras, revisión obsoleta y rollback; ledger/auditoría coherentes. | FR-011–014,017; SC-004 |
| MV06 | Reasignar docente/rol, revocar sesión/cancelar grupo durante upload; reautorizar al completar y replay. Autor original sin permiso no accede. | FR-002,008,014; SC-002 |
| MV07 | Antes/en/después de validUntil exacto a microsegundos; reserva/pago pendiente no autorizan. Oferta retirada/docente inhabilitado no revocan matrícula vigente. | FR-007–009,019; SC-005 |
| MV08 | Retiro bloquea nuevas solicitudes; edición no republica; republicación explícita solo da acceso vigente. | FR-006,011–012; SC-005 |
| MV09 | Inyección de fallo BD/espacio/recepción y aborto/exceso de plazas: sin parcialidad, pérdida previa o fuga de recursos. | FR-005,015,018; SC-003,006 |
| MV10 | JSON 16 KiB intacto, excepción binaria exacta, CSRF/Origin y tipo/encoding rechazados; sin JSON.stringify de Buffer ni segundo cuerpo tras headers. | FR-008,010,017,019; SC-002 |
| MV11 | Vacío/error/conflicto/incierto; teclado/móvil/escritorio; logout descarta requests/respuestas/Blob viejos. | FR-015–016; SC-007 |
| MV12 | Upgrade desde 0007 y restore separado; hashes/bytes/estado/autoría/permisos completos. | FR-017–020; SC-006 |
| MV13 | Gestor y alumno reales publican/listan/descargan/retiran; registrar dificultades y dispositivos realmente observados. | FR-016,020; SC-007 |

Estos IDs son familias de casos; su estado parcial está en [verification](verification.md).
No equivalen a tareas cerradas. MV03 usa
archivos estructuralmente válidos del tamaño límite, no padding incompatible.
MV07 usa reloj controlado solo en test, sin cambiar regla de producto o reloj manual.
MV09 no llena el disco del usuario: fallo inyectado o destino aislado. Carreras
verifican estado final persistido, no solo respuestas HTTP.

## Corregir y retirar por API

T051–T053 habilitan estas operaciones para docente actualmente asignado y
habilitado o administrador, con las mismas cookie, Origin y cabecera CSRF:

| Método/ruta | JSON cerrado |
| --- | --- |
| PATCH /api/v1/materials/items/:materialId | commandId, expectedRevision, title, description |
| POST /api/v1/materials/items/:materialId/withdraw | commandId, expectedRevision |
| POST /api/v1/materials/items/:materialId/publish | commandId, expectedRevision |

`commandId` es UUID nuevo por intención; `expectedRevision` es la revisión decimal
positiva como string. Consultar primero el detalle autorizado para obtenerla.
Una respuesta 200 contiene `{data:{resource,command}}`; `resource` es la vista
actual y `command` conserva appliedRevision/result de la intención original.
NO_CHANGE exige revisión vigente y conserva revisión/timestamps. Una revisión
obsoleta de intención nueva devuelve 409 MATERIAL_VERSION_CONFLICT sin escritura.

Editar solo cambia textos, sin publicar. Retirar oculta nuevas consultas y
descargas del alumno; volver a publicar exige el comando explícito. El binario,
grupo y autor original permanecen inmutables. El nuevo docente puede gestionar
sin apropiarse de autoría; el anterior pierde acceso, incluso al replay. En grupo
cancelado solo el administrador puede retirar, consultar y descargar el histórico.

Ante respuesta incierta, consultar el detalle actual con permiso vigente antes
de decidir un reintento manual. Reutilizar commandId y payload exactos recupera
el resultado durable; cambiar revisión/textos/operación con ese ID da 409
IDEMPOTENCY_CONFLICT. No reenviar automáticamente ni asumir que hubo rollback.
Un archivo nuevo debe prepararse como otro material; no hay reemplazo o borrado.

En el listado del grupo, pulsar «Gestionar» en el material correspondiente. El
formulario «Corregir textos» guarda sin publicar. «Retirar material» y
«Republicar material» muestran confirmación; cancelar devuelve el foco y no envía
comandos. En cancelado administrativo se conserva solo retiro/histórico.

Si aparece conflicto, comparar la «Versión actual consultada» con el borrador,
elegir «Usar revisión actual y conservar mi borrador» y guardar manualmente. No se
cambia la revisión ni el texto silenciosamente. Ante incertidumbre, usar «Consultar
estado del material» y, después, «Reintentar misma intención»; no se cambia su ID
ni payload por el resultado de la lectura. Mientras se resuelve, se bloquea la
edición y selección de otro material. El borrador sobrevive a recargas del listado;
logout, cambio de cuenta/ruta y denegación descartan la vista protegida.

«Preparar nuevo material» lleva al formulario de archivo separado; no reemplaza
el contenido de la referencia actual. Ver [T054–T056](evidence/t054-t056.md) para
pruebas de interfaz, carreras y E2E real. No equivalen a aceptación humana.

## Recuperación y puertas

Los [procedimientos de recovery](../../ops/recovery/README.md) incluyen
`ops/recovery/rehearse-materials.ps1 -ApiImage <imagen-local-api>`. El
[ensayo T061–T062](evidence/recovery.md) ejecuta mantenimiento, dump cifrado
conjunto, inventario completo de bytea/metadata/ledger/auditoría, restore a otra
BD e invalidación de sesiones. Compara archivos de todos los estados y permisos;
reiniciar no publica PREPARED ni revive matrícula vencida. Las decisiones
posteriores al backup requieren revisión explícita en cuarentena: se reaplica
solo el retiro conocido, sin publicar automáticamente el preparado. No purga
retirados/intenciones ni abre tráfico público.

Para repetir T063: `ops/recovery/rehearse-materials-resources.ps1 -ApiImage <imagen-local-api>`.
El [resultado local](evidence/local-resources.md) mide procesos API/generador separados,
20 MB, cliente lento, rollback y backup; el corpus compresible no acredita capacidad.
El [protocolo humano](evidence/human-acceptance.md) está preparado, sin sesiones observadas.

Antes de demo persistente/publicación: D13 acuerda custodio, destino cifrado,
retención y recuperación; verificar RAM/disco/backup con volumen acordado. Antes
de afirmar capacidad: D10 incluye materiales, versión/infraestructura, volumen,
mezcla/duración, usuarios activos/solicitudes, errores/latencia/tráfico/RAM/WAL y
consumo separado del generador. Dos plazas son protección técnica, no rendimiento medido.

El [procedimiento de operación T065](operation.md) detalla mantenimiento, respaldo
conjunto, restore en cuarentena, sesiones y revisión de cambios posteriores;
sus acuerdos O01–O12 permanecen pendientes por confirmación del responsable.
El [escenario T066](capacity.md) incorpora materiales al combinado y define el
registro de carga/recursos/costo; C01–C10 y la medición desde otro equipo siguen
pendientes. No se ejecuta un ensayo externo ni se cierran tareas por redactarlos.

Registrar salidas y límites reales en implementación; E2E no cierra observación
humana. No se cierran Izipay, 24 h reales, VPS, D10/D13, T094 o aceptación integral
de 001–003 por esta guía.
