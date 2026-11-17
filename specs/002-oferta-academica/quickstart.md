# Guía de verificación local — oferta académica

**Estado al 2026-10-29**: cuatro historias con checkpoints automáticos aprobados:
[US1](evidence/us1.md), [US2](evidence/us2.md), [US3](evidence/us3.md),
[US4](evidence/us4.md). [T068](evidence/automated.md) conserva la puerta local completa
y [T069](evidence/recovery.md) la actualización/recuperación aisladas. No son nuevas
ejecuciones al revisar esta guía. CI remoto, [observación humana](evidence/human-acceptance.md)
T073 y aceptación integral T074 pendientes. T070–T072 preparan documentación/protocolo.
La receta de instalación nueva no se ejecuta sobre datos manuales ni sustituye la
evidencia; [H-CAP-01 corregido y verificado](evidence/h-cap-01.md) para el aviso del catálogo inicial.

Constitución vigente 1.2.0. El plan/contratos conservan el registro de diseño y sus
formulaciones futuras: no son el informe de estado actual. PA-01–PA-05/E1 se
mantienen; reservas de 24 h, órdenes y matrícula pertenecen al futuro spec.

Seguir [plan](plan.md), [modelo](data-model.md), [HTTP](contracts/api.md),
[interfaz](contracts/ui.md) e [integración](contracts/integration.md).
El estado heredado está en [aceptación de identidad](../001-identidad-acceso-roles/evidence/acceptance.md).

## Prerrequisitos

- Fuente implementada y migraciones revisadas, scripts npm y pruebas de la revisión
  elegida disponibles. El plan por sí solo no hace que las rutas funcionen.
- Docker Desktop Linux/Compose compatible con `!reset`, Node/npm de imágenes y red
  de construcción disponible. No actualizar stack para acomodar un fallo de prueba.
- **Copia nueva** de la fuente implementada con lockfile, documentación 002 pendiente
  y archivos compartibles, sin .env/.env.test, .secrets, backups, datos ni node_modules
  de la instalación manual. Si 002 sigue sin commit, un checkout/git archive de HEAD
  no basta: incluir expresamente los archivos pendientes revisados.
- Preparar esa copia sin ejecutar comandos de copia/limpieza sobre la raíz original.
  El ejemplo supone una copia ya existente en la ruta indicada; no la crea.
- Si se necesita el override local de CA de BuildKit, incluir solo la CA pública
  referenciada, nunca claves privadas. Con -f explícitos no se autocarga compose.override.yml.
- Conservar configuración, claves, quince cuentas y credenciales manuales, puertos,
  volúmenes, .cache y evidencia originales. No usar su proyecto `academia-local`.
- No ejecutar bootstrap en un entorno ya inicializado ni purgas, db push, reset o
  `down -v`. El mantenimiento existente sigue siendo explícito.

## Ciclo editorial — T054

Usar únicamente cuentas ficticias del entorno aislado. Para reanudar una instalación
de pruebas existente, seguir su [inventario y guardas](evidence/environment.md):
conservar configuración y volumen; no ejecutar la receta de configuración nueva
que aparece después sobre una copia ya configurada. Los wrappers privados del
[checkpoint T053](evidence/us3.md) comprueban el destino antes de arrancar servicios.
No iniciar ni autenticar pruebas contra `academia-local`.

### Retirar, corregir y republicar

1. Como ADMIN, desde Inicio abrir **Gestionar oferta**, elegir curso y, si corresponde,
   su grupo. Contrastar estado guardado con «Visible/No visible para alumnos»; son
   conceptos diferentes. Horarios semanales en America/Lima; capacidad máxima no
   representa ocupación, disponibilidad ni una reserva.
2. Antes de modificar un recurso Publicado, elegir **Retirar curso** o **Retirar
   grupo** y revisar su confirmación. Cancelar la confirmación no escribe y devuelve
   el foco al control. Las acciones de transición requieren guardar o descartar
   ediciones previas; no publican datos de un formulario sin guardar.
3. Retirar un curso oculta el curso y todos sus grupos al alumno, pero conserva
   estados, snapshots y programación de los hijos. Un hijo todavía Publicado exige
   su **propio retiro** antes de editarlo y sigue bloqueando agenda docente.
4. Editar curso/grupo retirado y guardar. El grupo permite configurar periodo,
   capacidad entera 1–50, docente y horario. Franjas del mismo día, sin cruzar
   medianoche, con ocurrencia efectiva en el periodo incluido; contiguas permitidas.
   Guardar no republica ni renueva la captura de habilitación docente.
5. Elegir **Publicar curso/grupo** como acción separada y confirmar el resumen.
   Publicar el curso revalida sus hijos Publicados sin cambiar sus snapshots ni
   publicar los borradores. Publicar el grupo requiere padre publicado, integridad,
   docente habilitado y ausencia de conflicto efectivo con otro grupo Publicado
   del mismo docente; grupos ocultos por padre retirado o revisión también bloquean.
6. Como STUDENT, desde Inicio abrir **Consultar oferta** y comprobar curso y grupos
   publicados visibles. Un enlace previo a oferta retirada/cancelada responde
   «Oferta no disponible», sin mostrar motivos administrativos. No se calcula
   disponibilidad: se informa capacidad máxima y ocupación/disponibilidad no calculadas.

Si publicar el curso informa grupos bloqueados, abrir las referencias administrativas
seguras y retirar los afectados. Publicar primero el curso válido, revisar/sustituir
asignaciones y publicar cada grupo explícitamente. Recuperar rol o activar la cuenta
del docente no republica; publicar el curso tampoco confirma esa revisión. Un grupo
Cancelado conserva su condición terminal. No crear cuentas ni cambiar roles desde
el selector docente. La consulta docente «Mis grupos» está implementada y verificada
automáticamente en US4; la observación humana SC-002 sigue pendiente.

### Cancelar un grupo

Elegir **Cancelar grupo**, escribir el motivo obligatorio y confirmar. El servidor
registra el instante; el navegador no lo decide. Se conserva la consulta administrativa
del motivo y los datos, pero no se permite editar, retirar, recuperar o republicar
el grupo. No hay cancelación de curso ni DELETE. La cancelación no implica reembolso,
traslado, matrícula, reserva o cancelación de clases en este incremento.

### Resolver conflicto o respuesta incierta

| Situación | Recuperación explícita |
| --- | --- |
| 409 de revisión | Conservar entradas. **Consultar datos guardados** permite comparar sin adoptar esa revisión ni sobrescribir. Solo **Descartar edición y cargar datos guardados** reemplaza conscientemente la edición; revisar y preparar otra intención con ID nuevo si corresponde. |
| 409 de estado | Comprobar el estado guardado y respetar retiro previo o cancelación terminal. No cambiar expectedRevision a ciegas ni convertir transición inválida en NO_CHANGE. |
| 503 o respuesta perdida | El resultado es incierto: puede haber commit. Comprobar estado o repetir **manualmente** la misma intención conservada en memoria, con idénticos ID/payload. Corregir una intención prepara ID nuevo. No atribuir rollback solo por un error de transporte. |
| Salir después de 503 | El aviso recuerda que salir no deshace un comando que pueda haberse aplicado. Cerrar/reabrir la confirmación conserva la intención incierta en esa vista; cambiar de ruta o recargar pierde la intención en memoria. Antes de crear otra, consultar el estado persistido. |
| Sesión perdida | Se descarta la intención privada y se vuelve a acceso. Tras login, consultar datos; no se reenvía un comando automáticamente. |

No hay autosave, replay automático, almacenamiento de intenciones en localStorage
ni reemplazo silencioso de revisión. Durante un envío, no confirmar otro comando
ni interpretar cancelar navegación como garantía de rollback. Conservar el mismo
commandId solo para repetir exactamente la intención, no para corregirla.

## Consulta docente — US4

Desde Inicio, TEACHER abre **Mis grupos** (/mis-grupos); lista/detalle incluyen
solo asignaciones propias, incluso incompletas/retiradas/canceladas, con contexto
de curso y «Sin configurar» cuando corresponde. Sin edición ni motivos privados.
Un enlace ajeno no revela datos; ADMIN/STUDENT no acceden a estas rutas. Pérdida de
sesión limpia la vista y el nuevo acceso no repite intenciones. Las respuestas
tardías tras logout se descartan; el timeout histórico del caso E2E D10 conserva
su investigación pendiente pese a los pases posteriores.

## Proyecto aislado con configuración nueva

PowerShell, solo en esa copia futura. Verificar cada código de salida y detenerse ante
fallo; no clasificar un comando fallido o un test omitido como aprobado.

```powershell
$trialRoot = 'D:\Proyectos\academia-virtual\.cache\academic-offering-validation\source'
if (-not (Test-Path -LiteralPath (Join-Path $trialRoot 'package-lock.json'))) {
  throw 'Falta la copia nueva completa de la fuente implementada.'
}
if (Test-Path -LiteralPath (Join-Path $trialRoot '.env')) {
  throw 'Esta receta de instalación nueva no sobrescribe configuración existente.'
}
Set-Location -LiteralPath $trialRoot
node (Join-Path $trialRoot 'ops/docker/configure.mjs')
if ($LASTEXITCODE -ne 0) { throw 'No se creó configuración nueva.' }

$trialProject = 'academic-offering-' + [guid]::NewGuid().ToString('N').Substring(0,12)
$trial = @('compose','--project-name',$trialProject,
  '--project-directory',$trialRoot,'--env-file',(Join-Path $trialRoot '.env'),
  '-f',(Join-Path $trialRoot 'compose.yml'))
if (Test-Path -LiteralPath (Join-Path $trialRoot 'compose.override.yml')) {
  $trial += @('-f',(Join-Path $trialRoot 'compose.override.yml'))
}
$trial += @('-f',(Join-Path $trialRoot 'ops/docker/compose.regression.yml'),
  '-f',(Join-Path $trialRoot 'ops/docker/compose.identity-tests.yml'))

docker @trial config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Compose no válido; no iniciar servicios.' }
docker @trial --profile tests build api web browser-tests
if ($LASTEXITCODE -ne 0) { throw 'Construcción no aprobada.' }
docker @trial up -d --no-build --wait db mailpit
if ($LASTEXITCODE -ne 0) { throw 'BD/correo no disponibles.' }
```

configure.mjs escribe el .env del checkout donde está el script, no acepta un destino
alternativo: por eso no se ejecuta desde el repositorio manual.
El nombre único selecciona volumen nuevo; regression elimina publicaciones de puertos
y usa APP_ENV=test. Mailpit solo recibe destinatarios ficticios @example.test.
No imprimir `docker compose config` completo ni variables/URLs privadas.

## Generación y migración, solo en ese proyecto

La migración existente `0005_academic_offering` es aditiva posterior a las cuatro
de identidad; su revisión y ensayo están en [T007/T008](evidence/t007-t008.md).
Revisar el SQL de la revisión elegida y aplicar esta receta solo al proyecto aislado.
Las imágenes construidas ya deben incorporar los clientes
y compilación actuales; generar en un contenedor efímero valida el proceso, no modifica
la imagen de otro contenedor.

```powershell
foreach ($validationScript in @('probe:generate','probe:migrate','probe:check',
    'db:generate','db:migrate:deploy')) {
  docker @trial run --rm --no-deps api npm run $validationScript
  if ($LASTEXITCODE -ne 0) { throw ('Fallo en ' + $validationScript) }
}
docker @trial up -d --no-build --wait api web
if ($LASTEXITCODE -ne 0) { throw 'API/web no disponibles.' }
docker @trial ps
```

No usar db:migrate:dev en test. Para futuras migraciones, create-only requiere
desarrollo y BD sombra exclusiva con permisos previamente revisados. No conceder
CREATEDB al runtime ni usar la base manual como sombra.

En integración, reutilizar `identityDatabase` y el entorno
`t_<suite>_<random>` del harness existente: propietario aplica migraciones y runtime
opera sin DDL. Cada suite limpia únicamente su esquema identificado; no borrar schemas
o datos originales buscando coincidencias amplias de nombre.

## Pruebas unitarias, arquitectura y PostgreSQL

Comandos existentes con descubrimiento de los archivos actuales. Los subconjuntos
históricos de T053 se conservan en [su evidencia](evidence/us3.md); la puerta local
completa y sus resultados/soporte operativo están en [T068](evidence/automated.md).
Esta receta no acredita otra ejecución ni una nueva revisión funcional.

```powershell
docker @trial exec -T api npm run test:unit --workspace apps/api -- --maxWorkers=1
if ($LASTEXITCODE -ne 0) { throw 'Unitarias/arquitectura API no aprobadas.' }
docker @trial exec -T api npm run test:unit --workspace apps/web -- --maxWorkers=1
if ($LASTEXITCODE -ne 0) { throw 'Unitarias web no aprobadas.' }
docker @trial exec -T api npm run probe:generate
if ($LASTEXITCODE -ne 0) { throw 'Cliente probe no generado.' }
docker @trial exec -T api npm run db:generate
if ($LASTEXITCODE -ne 0) { throw 'Cliente de aplicación no generado.' }
docker @trial exec -T api npm run test:integration --workspace apps/api -- --maxWorkers=1
if ($LASTEXITCODE -ne 0) { throw 'Integración PostgreSQL/API no aprobada.' }
docker @trial exec -T api npm run test:crypto-mail
if ($LASTEXITCODE -ne 0) { throw 'Compatibilidad correo/criptografía no aprobada.' }
docker @trial exec -T api npm run lint
if ($LASTEXITCODE -ne 0) { throw 'Lint no aprobado.' }
docker @trial exec -T api npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build no aprobado.' }
```

Esperado: V-A01–A09/A11/A12 según [plan](plan.md), ninguna omisión ni cambios esperados
que oculten fallos. No sustituir PostgreSQL con mocks para afirmar atomicidad.

Carreras mínimas con dos conexiones y administradores distintos:
- Dos publicaciones del mismo docente: un éxito y un conflicto real, estado final válido.
- Publicación vs desactivación/cambio de rol; pérdida y recuperación sin lectura intermedia.
- Reset de contraseña sin pérdida de publicación académica.
- Curso retirado mantiene conflictos de sus grupos Publicados.
- Republicación de curso con revisión requerida no actualiza snapshots ni publica grupos.
- Cambio de asignación/conjunto durante descubrimiento; revisión obsoleta; rollback de auditoría.
- Replay igual, reutilización diferente, timeout y respuesta incierta sin efectos duplicados.

Comprobar desde conexión observadora independiente las esperas reales; usar el patrón
`apps/api/tests/support/locks.ts`. No hacer la observación con la transacción bloqueada
ni usar sleeps como única barrera. Conservar resultados y aserciones del estado final.

## E2E de oferta — configuración existente

Archivo `apps/web/playwright.academic-offering.config.ts`: fixtures de composición
real, esquemas aislados, origen loopback, credenciales ficticias y proyectos
móvil/escritorio. La configuración completa ejecuta los recorridos implementados;
incluye las cuatro historias y la matriz de autorización implementada de US4.
T068 ejecutó 168 pruebas (84 casos, desktop/mobile); no sustituye SC-002 humano.

La fixture arranca API/Nest y web dentro del runner para sus esquemas; no
autenticar contra la API manual. La base externa PLAYWRIGHT_BASE_URL del Compose no
debe sustituir el origen/servidor de esa fixture, igual que en las suites de identidad.

```powershell
docker @trial --profile tests run --rm --no-deps --entrypoint sh browser-tests -c 'npm run test:e2e --workspace apps/web -- --config playwright.academic-offering.config.ts'
if ($LASTEXITCODE -ne 0) { throw 'E2E de oferta no aprobado.' }
```

Cobertura final requerida: recorridos A–E de [ui.md](contracts/ui.md), V-A10, validación por campo,
vacío/fallo, datos persistentes tras recargar, teclado/móvil, accesos directos denegados,
grupo no disponible y privacidad. Los resultados automáticos de US4 están en
[T066](evidence/us4.md) y T068; T073/SC-002 no se han observado. Capturas y trazas solo ficticias,
privadas e ignoradas.

## Regresión de identidad

Repetir las configuraciones originales completas, no todos los archivos desde una
configuración base que omita sus fixtures/orígenes/tamaños. Patrón existente en
[T106](../001-identidad-acceso-roles/evidence/regression.md); los conteos anteriores
son históricos, no resultados esperados rígidos del incremento nuevo.

```powershell
$identityRegression = @'
env -u PLAYWRIGHT_BASE_URL npm run test:e2e --workspace apps/web -- --config playwright.config.ts '(^|/)harness\.spec\.ts$' '(^|/)foundations\.spec\.ts$' || exit 1
for suite in identity registration first-admin admin-users password-reset security profile accessibility login-timing; do
  npm run test:e2e --workspace apps/web -- --config playwright.$suite.config.ts || exit 1
done
'@
docker @trial --profile tests run --rm --no-deps --entrypoint sh browser-tests -c $identityRegression
if ($LASTEXITCODE -ne 0) { throw 'Regresión de identidad no aprobada.' }
```

El patrón base usa los dos nombres **anclados** de T067 para no capturar
academic-offering-harness.spec.ts con otra configuración. Se retira solo en ese
runner la variable PLAYWRIGHT_BASE_URL: la configuración base inicia su propio
preview loopback y rechaza reutilizar servidor. Las configuraciones de identidad/oferta restantes
conservan sus fixtures/orígenes. Es una receta revisada, no ejecutada en T071;
T068 conserva su ejecución y launcher exactos, sin atribuirles otra invocación.

La suite de correo de integración consulta 127.0.0.1:3000/health/ready. No retirar
la API aislada arrancada en la sección anterior ni apuntarla al entorno manual.
Si se ejecuta integración en un runner efímero con solo DB/Mailpit, ese runner
requiere AppModule/transporte reales en su propio loopback: T068 registra el
globalSetup y su esquema exclusivo, sin mocks ni afirmar que una API externa
responde al localhost del runner. Fallo de readiness es operativo, no una prueba
académica en rojo.

Conservar guardas de sesión/CSRF/CSP, cuenta ADMIN única, revocación, último ADMIN,
registro, verificación, recuperación y privacidad. Un nuevo bootstrap 23/23 tampoco
resuelve por sí solo el hallazgo intermitente histórico. No contar resultados reutilizados
como nuevos ni repetir cargas completas aplazadas hasta matrícula.

## Observación humana y actualización incremental

SC-002 requiere alumno real que identifique datos sin ayuda. Preparar un entorno
exclusivo con cuentas ficticias y exposición loopback en puertos previamente comprobados
libres mediante un overlay de prueba revisado; no modificar el Compose/puertos del
entorno manual. Hasta disponer de ese recorrido, registrar SC-002 humano pendiente.
No inventar observaciones, porcentajes ni un estudio de diez personas para este spec.
El [protocolo T072](evidence/human-acceptance.md) contiene datos previstos, guardas,
instrucción neutral, registro e historial H-CAP-01 corregido automáticamente; sesión/participante/resultados
siguen sin completar. T104 de identidad exige sus propios diez participantes.

Resultado ya ejecutado de actualización/restore: [T069](evidence/recovery.md),
comando reproducible y [procedimiento](../../ops/recovery/README.md#ensayo-de-oferta-académica-t069).
Cuatro fases aprobadas, 4 sesiones/2 enlaces/2 correos invalidados y decisiones
posteriores revisadas; D13 no se cierra por sus tiempos locales observados.

Ensayo incremental V-A11:
1. En otro esquema/proyecto ficticio, aplicar solo 0001–0004 de la revisión previa.
2. Crear fixtures de identidad por sus mecanismos de test y registrar huellas privadas
   de cuentas, sesiones, tokens, auditoría y SystemState; sin imprimir secretos.
3. Aplicar únicamente `0005_academic_offering` y verificar invariantes/privilegios.
4. Comprobar iguales las huellas de identidad salvo la nueva columna técnica default0;
   después probar las secuencias de generación docente.
5. Ensayar rollback transaccional de fallos y recuperación a BD nueva según
   [operación recuperable](../../ops/recovery/README.md). Antes de un destino persistente,
   backup cifrado/restore comprobado y resolución operativa D13 siguen siendo condiciones.

No ejecutar este ensayo sobre los datos manuales ni editar migraciones aplicadas.
La restauración no reconstruye cambios administrativos posteriores al backup: revisar
acceso y oferta antes de reabrir, además de invalidar credenciales restauradas.

## Delimitaciones y puertas pendientes

- **D04**: la reserva previa por 24 h exactas está confirmada para el futuro spec.
  Capacidad máxima 1–50 no reserva, consume ni libera cupos. Varios cursos, prioridad,
  pago al límite/tardío, reembolso/cancelación y abuso conservan decisiones abiertas.
- **D06**: America/Lima, medianoche, ocurrencias, adyacencia y publicaciones
  incompatibles del docente están definidos/verificados en 002. Compatibilidad de
  matrícula del alumno y cambios posteriores no están resueltos.
- **D10/rúbrica**: población ≥15 000 y objetivo de 2500 activos sin demostrar.
  T103 es informe/ejecución histórica completa, con capacidad sin aprobar. Mantener
  cargas completas para su etapa y generador k6 externo al VPS; no ejecutarlas aquí.
- **D13**: T069 verifica restore ficticio, no custodia externa, responsable, retención
  operada ni SLA. Antes de demo persistente/publicación revisar destino real.
- **T104/T108**: pendientes de identidad, sin modificarlos. Bootstrap intermitente
  abierto; no hay credenciales predeterminadas para sortearlo ni un pase que lo cierre.
- **SMTP externo**, video/protección/alojamiento y CI remoto pendientes. Mailpit local
  aprobado no demuestra correo externo. No desplegar ni adoptar AWS en este bloque.

[Decisiones vigentes](../../docs/decisiones-pendientes.md) y
[reservas/capacidad](../../docs/planificacion/reservas-capacidad.md).

## Registro y detención

Registrar revisión/fuente exacta incluida su parte no versionada, lockfile, imágenes,
configuración sin secretos, comandos/códigos de salida, suites y casos realmente
ejecutados, fallos/omisiones, tiempos observados y límites. Registrar evidencia bajo
evidence/ con resultados reales; no presentar una receta como una prueba ejecutada.

```powershell
docker @trial stop
if ($LASTEXITCODE -ne 0) { throw 'Revisar detención del proyecto de prueba.' }
```

Detener únicamente ese proyecto; conservar volumen, configuración privada y reportes.
No down -v ni purgas. T104/T108, D04, D06/matrícula, D10/D13, SMTP real, video y capacidad
sin aprobar mantienen sus estados. Esta guía no mide ni acredita 1000 concurrentes.
