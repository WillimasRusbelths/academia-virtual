[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ApiImage)
. (Join-Path $PSScriptRoot 'common.ps1')
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,5173)
try { $probe.Start() } catch { throw 'Puerto 5173 ocupado; no se modifica el servicio existente.' } finally { $probe.Stop() }
$id = [guid]::NewGuid().ToString('N').Substring(0,12)
$project = 'materials-human-' + $id
$directory = Join-Path $repo ('.cache/materials-human-' + $id)
$null = New-Item -ItemType Directory -Path $directory
$acl = Get-Acl -LiteralPath $directory
$acl.SetAccessRuleProtection($true,$false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $directory -AclObject $acl
$secretNames = @('POSTGRES_PASSWORD','PROBE_OWNER_PASSWORD','PROBE_RUNTIME_PASSWORD','TEST_MAIL_PAYLOAD_KEY','TEST_RATE_HMAC_KEY')
$secretLines = foreach ($name in $secretNames) {
  $value = & node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))"
  if ($name -match 'KEY$') { $value = & node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" }
  $name + '=' + $value
}
[IO.File]::WriteAllLines((Join-Path $directory 'private.env'),$secretLines,[Text.UTF8Encoding]::new($false))
$rootYaml = $repo.Replace('\','/')
$privateYaml = $directory.Replace('\','/')
$yaml = @'
services:
  db:
    image: postgres:16.14-bookworm
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      PROBE_OWNER_PASSWORD: ${PROBE_OWNER_PASSWORD}
      PROBE_RUNTIME_PASSWORD: ${PROBE_RUNTIME_PASSWORD}
    volumes:
      - trial_data:/var/lib/postgresql/data
      - '__PRIVATE__/init.sql:/docker-entrypoint-initdb.d/01-recovery.sql:ro'
    healthcheck:
      test: [CMD-SHELL, 'pg_isready -U postgres -d academia_v00_test']
      interval: 1s
      timeout: 3s
      retries: 40
  mailpit:
    image: axllent/mailpit:v1.31.3
    command: [--disable-version-check, --smtp-disable-rdns, '--smtp-allowed-recipients=@example[.]test$$', --quiet]
    healthcheck:
      test: [CMD, /mailpit, readyz]
      interval: 1s
      timeout: 3s
      retries: 40
  runner:
    networks: [default, frontend]
    ports:
      - '127.0.0.1:5173:5173'
    command: ['-c', 'npm run db:generate >/tmp/generate.log 2>&1 && npm run build --workspace apps/api >/tmp/build.log 2>&1 && cd apps/api && npx vitest run tests/recovery/materials-human-session.spec.ts --maxWorkers=1 --reporter=json --outputFile=/recovery-private/session-tests.json >/recovery-private/session.log 2>&1']
    image: __IMAGE__
    working_dir: /workspace
    entrypoint: sh
    environment:
      APP_ENV: test
      APP_ORIGIN: http://localhost:5173
      MAIL_MODE: capture
      SMTP_HOST: mailpit
      SMTP_PORT: '1025'
      MAIL_FROM: academia@example.test
      MAIL_KEY_ID: recovery-v1
      TEST_MAIL_PAYLOAD_KEY: ${TEST_MAIL_PAYLOAD_KEY}
      TEST_RATE_HMAC_KEY: ${TEST_RATE_HMAC_KEY}
      TEST_DATABASE_URL: postgresql://academia_v00_runtime:${PROBE_RUNTIME_PASSWORD}@db:5432/academia_v00_test
      TEST_MIGRATION_DATABASE_URL: postgresql://academia_v00_owner:${PROBE_OWNER_PASSWORD}@db:5432/academia_v00_test
      PROBE_DATABASE_URL: postgresql://academia_v00_runtime:${PROBE_RUNTIME_PASSWORD}@db:5432/academia_v00_test
      PROBE_MIGRATION_URL: postgresql://academia_v00_owner:${PROBE_OWNER_PASSWORD}@db:5432/academia_v00_test
      HUMAN_SESSION_ISOLATED: '1'
      TRUSTED_PROXY: ''
    volumes:
      - '__ROOT__/apps/api/tsconfig.json:/workspace/apps/api/tsconfig.json:ro'
      - '__ROOT__/apps/api/src:/workspace/apps/api/src:ro'
      - '__ROOT__/apps/web/src:/workspace/apps/web/src:ro'
      - '__ROOT__/apps/web/index.html:/workspace/apps/web/index.html:ro'
      - '__ROOT__/apps/web/vite.config.ts:/workspace/apps/web/vite.config.ts:ro'
      - '__ROOT__/apps/api/prisma:/workspace/apps/api/prisma:ro'
      - '__ROOT__/apps/api/tests:/workspace/apps/api/tests:ro'
      - '__ROOT__/apps/api/package.json:/workspace/apps/api/package.json:ro'
      - '__ROOT__/ops/recovery:/workspace/ops/recovery:ro'
      - '__PRIVATE__:/recovery-private'
volumes:
  trial_data:
networks:
  frontend: {}
  default:
    internal: true
'@
if ($ApiImage -notmatch '^[a-zA-Z0-9/_.:@-]+$') { throw 'Imagen inválida.' }
$yaml = $yaml.Replace('__PRIVATE__',$privateYaml).Replace('__ROOT__',$rootYaml).Replace('__IMAGE__',$ApiImage)
[IO.File]::WriteAllText((Join-Path $directory 'compose.yml'),$yaml,[Text.UTF8Encoding]::new($false))
$init = @'
\set ON_ERROR_STOP on
\getenv owner_password PROBE_OWNER_PASSWORD
\getenv runtime_password PROBE_RUNTIME_PASSWORD
CREATE ROLE academia_v00_owner LOGIN PASSWORD :'owner_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE academia_v00_runtime LOGIN PASSWORD :'runtime_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE DATABASE academia_v00_test OWNER academia_v00_owner;
REVOKE ALL ON DATABASE academia_v00_test FROM PUBLIC;
GRANT CONNECT ON DATABASE academia_v00_test TO academia_v00_runtime;
COMMENT ON DATABASE academia_v00_test IS 'materials-human-isolated';
\connect academia_v00_test
REVOKE ALL ON SCHEMA public FROM PUBLIC;
'@
[IO.File]::WriteAllText((Join-Path $directory 'init.sql'),$init,[Text.UTF8Encoding]::new($false))
$compose = @('compose','--project-name',$project,'--env-file',(Join-Path $directory 'private.env'),'-f',(Join-Path $directory 'compose.yml'))

$stop = @'
$ErrorActionPreference='Stop'
$directory=$PSScriptRoot
$project=Split-Path $directory -Leaf
if($project -notmatch '^materials-human-[a-f0-9]{12}$'){throw 'Proyecto no permitido.'}
[IO.File]::WriteAllText((Join-Path $directory 'stop-requested'),'stop')
& docker compose --project-name $project --env-file (Join-Path $directory 'private.env') -f (Join-Path $directory 'compose.yml') stop --timeout 15
if($LASTEXITCODE -ne 0){throw 'No se detuvo el proyecto.'}
Write-Output 'Sesion detenida; volumen y archivos privados conservados.'
'@
[IO.File]::WriteAllText((Join-Path $directory 'detener.ps1'),$stop,[Text.UTF8Encoding]::new($false))
$manifest=@(git -C $repo ls-files --cached --others --exclude-standard -- apps/api apps/web ops/recovery | ForEach-Object {if(Test-Path -LiteralPath (Join-Path $repo $_) -PathType Leaf){[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_) -Algorithm SHA256).Hash.ToLowerInvariant()}}})
[IO.File]::WriteAllText((Join-Path $directory 'source-manifest.json'),($manifest|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
Write-Output ('Proyecto temporal: '+$project)
try {
  $resolved=(Invoke-RecoveryDocker ($compose+@('config','--format','json')))|ConvertFrom-Json
  if(-not $resolved.networks.default.internal){throw 'Red no aislada.'}
  $null=Invoke-RecoveryDocker ($compose+@('up','-d','--wait','db','mailpit'))
  $null=Invoke-RecoveryDocker ($compose+@('up','-d','--no-deps','runner'))
  $ready=Join-Path $directory 'ready.json'
  for($attempt=0;$attempt -lt 180;$attempt++){
    if(Test-Path -LiteralPath $ready){break}
    Start-Sleep -Seconds 1
  }
  if(-not (Test-Path -LiteralPath $ready)){throw 'El acceso temporal no alcanzo readiness; revisar evidencia privada.'}
  $response=Invoke-WebRequest -Uri 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 10
  if($response.StatusCode -ne 200){throw 'Web no disponible.'}
  Write-Output ('Acceso preparado: http://localhost:5173; credenciales privadas: '+(Join-Path $directory 'acceso-privado.txt'))
  Write-Output ('Detener al terminar: powershell -NoProfile -ExecutionPolicy Bypass -File '+(Join-Path $directory 'detener.ps1'))
  Write-Output 'Ventana web maxima: 2 horas. Readiness tecnico no acredita aceptacion humana.'
} catch {
  $null=Invoke-RecoveryDocker ($compose+@('stop','--timeout','10'))
  throw 'No se preparo el acceso; proyecto detenido, evidencia privada conservada.'
}
