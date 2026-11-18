# T002 — Entorno aislado de implementación

2026-11-17. Se reutilizan el [harness](../../../ops/docker/test-harness.md),
los Dockerfiles y el [override sin puertos](../../../ops/docker/compose.regression.yml).
El [preparador](../../../ops/docker/prepare-classes-harness.mjs) genera un proyecto
`classes-<12 hex>`, configuración nueva en `.cache/` ignorada y volumen propio.
No lee ni modifica `.env`, `.env.test` o `compose.override.yml` manuales.

Node 22.23.1, npm 10.9.8, PostgreSQL 16.14 y Mailpit 1.31.3; `APP_ENV=test`,
origen `http://localhost:5173`, SMTP de captura limitado a `@example.test`.
Owner y runtime tienen credenciales aleatorias independientes. Owner migra;
runtime tiene DML, sin CREATE, SUPERUSER, CREATEDB o CREATEROLE. Las suites de
integración crean esquemas únicos en `academia_v00_test` y limpian solo esos esquemas.
La red de ejecución es interna y los servicios no publican puertos. La compilación
puede descargar paquetes, con TLS; una CA pública ya confiada se monta solo en build.

Desde PowerShell en la raíz:

```powershell
$created = node ops/docker/prepare-classes-harness.mjs | ConvertFrom-Json
$harness = Get-Content -LiteralPath $created.descriptor -Raw | ConvertFrom-Json
$argsClasses = @($harness.composeArgs)

# Windows: limitar la carpeta privada al usuario actual, sin imprimir secretos.
$acl = Get-Acl -LiteralPath $harness.directory
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule(
  [Security.Principal.WindowsIdentity]::GetCurrent().User,
  'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $harness.directory -AclObject $acl

docker @argsClasses config --quiet
docker @argsClasses build api
docker @argsClasses up -d --wait db mailpit
docker @argsClasses run --rm --no-deps api npm run probe:migrate
docker @argsClasses run --rm --no-deps api npm run probe:check
docker @argsClasses run --rm --no-deps api npm run db:migrate:deploy
# Solo después de migraciones, si el bloque necesita la aplicación:
docker @argsClasses up -d --wait api web

# Detener solo el ensayo indicado y conservar su volumen.
docker @argsClasses stop
```

Comprobar `$LASTEXITCODE` después de cada comando y detenerse ante fallos.
No ejecutar el bloque contra el proyecto manual ni usar `down -v`, `db push`,
reset o bootstrap. El preparador siempre crea un proyecto nuevo; para reanudar
usar el descriptor ya generado, no volver a generar credenciales para un volumen.
No imprimir `config` completo, `inspect` completo o el archivo privado.

Si Docker agota sus rangos automáticos, inspeccionar solo nombres/subredes de
`docker network ls`/`inspect --format` y elegir un rango interno libre sin eliminar
redes anteriores. El preparador acepta `--subnet=10.x.y.0/24`; no detecta colisiones
por sí mismo. Este ensayo usa `10.254.5.0/24`, comprobada libre al crearlo. Para
reproducir en otro equipo elegir un rango libre propio o usar el rango automático.

Este primer bloque valida instalación/restricciones y puede migrar solo la BD de
ensayo hasta 0009. No existe todavía 0010, no se inician API/web aquí y no se crean
cuentas reales, emisiones o fixtures de clases. El resultado ejecutado y el
descriptor saneado se registran en `t001-t004-results.json` al terminar el bloque.
