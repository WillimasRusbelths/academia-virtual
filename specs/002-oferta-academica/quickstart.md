# Guía de verificación local — oferta académica

**Estado**: receta futura para después de implementar. En esta etapa solo se revisó
documentación: no se arrancaron servicios, generaron clientes, migraron datos ni
ejecutaron suites. No confundir estos comandos con resultados aprobados.

Seguir [plan](plan.md), [modelo](data-model.md), [HTTP](contracts/api.md),
[interfaz](contracts/ui.md) e [integración](contracts/integration.md).
El estado heredado está en [aceptación de identidad](../001-identidad-acceso-roles/evidence/acceptance.md).

## Prerrequisitos

- Implementación y futura migración revisadas, scripts npm actuales y nuevos tests
  disponibles. El plan por sí solo no hace que las rutas funcionen.
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

## Generación y migración futuras, solo en ese proyecto

La nueva migración será aditiva posterior a las cuatro de identidad. No ejecutar esto
hasta que exista SQL revisado. Las imágenes construidas ya deben incorporar los clientes
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

No usar db:migrate:dev en test. Su modo create-only requiere desarrollo y BD sombra
cuyos permisos aún deben validarse al preparar la migración; eso no bloquea redactar
tareas. No conceder CREATEDB al runtime ni usar la base manual como sombra.

En integración, reutilizar `identityDatabase` y el entorno
`t_<suite>_<random>` del harness existente: propietario aplica migraciones y runtime
opera sin DDL. Cada suite limpia únicamente su esquema identificado; no borrar schemas
o datos originales buscando coincidencias amplias de nombre.

## Pruebas unitarias, arquitectura y PostgreSQL

Comandos existentes; después de implementar deberán incluir los archivos nuevos.

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

## E2E de oferta — configuración futura

Archivo previsto `apps/web/playwright.academic-offering.config.ts`, aún inexistente
al escribir el plan. Debe reutilizar fixtures de composición real, esquemas aislados,
origen loopback, credenciales ficticias y proyectos móvil/escritorio como identidad.

La fixture deberá arrancar API/Nest y web dentro del runner para sus esquemas; no
autenticar contra la API manual. La base externa PLAYWRIGHT_BASE_URL del Compose no
debe sustituir el origen/servidor de esa fixture, igual que en las suites de identidad.

```powershell
docker @trial --profile tests run --rm --no-deps --entrypoint sh browser-tests -c 'npm run test:e2e --workspace apps/web -- --config playwright.academic-offering.config.ts'
if ($LASTEXITCODE -ne 0) { throw 'E2E de oferta no aprobado.' }
```

Esperado: recorridos A–E de [ui.md](contracts/ui.md), V-A10, validación por campo,
vacío/fallo, datos persistentes tras recargar, teclado/móvil, accesos directos denegados,
grupo no disponible y privacidad. Capturas y trazas solo ficticias, privadas e ignoradas.

## Regresión de identidad

Repetir las configuraciones originales completas, no todos los archivos desde una
configuración base que omita sus fixtures/orígenes/tamaños. Patrón existente en
[T106](../001-identidad-acceso-roles/evidence/regression.md); los conteos anteriores
son históricos, no resultados esperados rígidos del incremento nuevo.

```powershell
$identityRegression = @'
npm run test:e2e --workspace apps/web -- --config playwright.config.ts harness.spec.ts foundations.spec.ts || exit 1
for suite in identity registration first-admin admin-users password-reset security profile accessibility login-timing; do
  npm run test:e2e --workspace apps/web -- --config playwright.$suite.config.ts || exit 1
done
'@
docker @trial --profile tests run --rm --no-deps --entrypoint sh browser-tests -c $identityRegression
if ($LASTEXITCODE -ne 0) { throw 'Regresión de identidad no aprobada.' }
```

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

Ensayo incremental V-A11:
1. En otro esquema/proyecto ficticio, aplicar solo 0001–0004 de la revisión previa.
2. Crear fixtures de identidad por sus mecanismos de test y registrar huellas privadas
   de cuentas, sesiones, tokens, auditoría y SystemState; sin imprimir secretos.
3. Aplicar únicamente la futura migración nueva y verificar invariantes/privilegios.
4. Comprobar iguales las huellas de identidad salvo la nueva columna técnica default0;
   después probar las secuencias de generación docente.
5. Ensayar rollback transaccional de fallos y recuperación a BD nueva según
   [operación recuperable](../../ops/recovery/README.md). Antes de un destino persistente,
   backup cifrado/restore comprobado y resolución operativa D13 siguen siendo condiciones.

No ejecutar este ensayo sobre los datos manuales ni editar migraciones aplicadas.
La restauración no reconstruye cambios administrativos posteriores al backup: revisar
acceso y oferta antes de reabrir, además de invalidar credenciales restauradas.

## Registro y detención

Registrar revisión/fuente exacta incluida su parte no versionada, lockfile, imágenes,
configuración sin secretos, comandos/códigos de salida, suites y casos realmente
ejecutados, fallos/omisiones, tiempos observados y límites. Futuras evidencias del spec
pueden vivir bajo evidence/; no crearlas con resultados ficticios ahora.

```powershell
docker @trial stop
if ($LASTEXITCODE -ne 0) { throw 'Revisar detención del proyecto de prueba.' }
```

Detener únicamente ese proyecto; conservar volumen, configuración privada y reportes.
No down -v ni purgas. T104/T108, D04, D06/matrícula, D10/D13, SMTP real, video y capacidad
sin aprobar mantienen sus estados. Esta guía no mide ni acredita 1000 concurrentes.
