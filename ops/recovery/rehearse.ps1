[CmdletBinding()]
param([string]$ApiImage='academia-local-api:latest')
. (Join-Path $PSScriptRoot 'common.ps1')
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$id = [guid]::NewGuid().ToString('N').Substring(0,12)
$project = 'identity-recovery-' + $id
$directory = Join-Path $repo ('.cache/recovery-' + $id)
$null = New-Item -ItemType Directory -Path $directory
$acl = Get-Acl -LiteralPath $directory
$acl.SetAccessRuleProtection($true,$false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $directory -AclObject $acl
$copies = Join-Path $directory 'backups'
$keys = Join-Path $directory 'keys'
$null = New-Item -ItemType Directory -Path $copies
$null = New-Item -ItemType Directory -Path $keys
# ACL exclusiva del usuario actual; no se imprimen claves ni credenciales.
$key = Join-Path $keys 'archive.key'
& node -e "require('node:fs').writeFileSync(process.argv[1],require('node:crypto').randomBytes(32),{flag:'wx',mode:0o600})" $key
if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar la clave.' }
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
      RECOVERY_ISOLATED: '1'
      TRUSTED_PROXY: ''
    volumes:
      - '__ROOT__/apps/api/src:/workspace/apps/api/src:ro'
      - '__ROOT__/apps/api/tests:/workspace/apps/api/tests:ro'
      - '__ROOT__/apps/api/package.json:/workspace/apps/api/package.json:ro'
      - '__ROOT__/ops/recovery:/workspace/ops/recovery:ro'
      - '__PRIVATE__:/recovery-private'
volumes:
  trial_data:
networks:
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
COMMENT ON DATABASE academia_v00_test IS 'identity-recovery-isolated';
\connect academia_v00_test
REVOKE ALL ON SCHEMA public FROM PUBLIC;
'@
[IO.File]::WriteAllText((Join-Path $directory 'init.sql'),$init,[Text.UTF8Encoding]::new($false))
$compose = @('compose','--project-name',$project,'--env-file',(Join-Path $directory 'private.env'),'-f',(Join-Path $directory 'compose.yml'))
function Run-Phase([string]$Phase,[string]$Target='') {
  $extra = @()
  if ($Target) {
    $envLines = Get-Content -LiteralPath (Join-Path $directory 'private.env')
    $runtimePassword = ($envLines | Where-Object { $_.StartsWith('PROBE_RUNTIME_PASSWORD=') }).Substring('PROBE_RUNTIME_PASSWORD='.Length)
    $ownerPassword = ($envLines | Where-Object { $_.StartsWith('PROBE_OWNER_PASSWORD=') }).Substring('PROBE_OWNER_PASSWORD='.Length)
    # Secrets go into a private env file; never into docker arguments or command output.
    $targetFile = Join-Path $directory 'target.env'
    [IO.File]::WriteAllLines($targetFile,@("TEST_DATABASE_URL=postgresql://academia_v00_runtime:${runtimePassword}@db:5432/$Target","TEST_MIGRATION_DATABASE_URL=postgresql://academia_v00_owner:${ownerPassword}@db:5432/$Target"),[Text.UTF8Encoding]::new($false))
    $extra = @('--env-from-file',$targetFile)
  }
  $command = 'npm run build --workspace apps/api >/tmp/build.txt 2>&1 && cd apps/api && { npx vitest run tests/recovery/rehearsal.spec.ts --maxWorkers=1 --reporter=json --outputFile=/recovery-private/' + $Phase + '-tests.json >/tmp/phase.txt 2>&1; node /workspace/ops/recovery/report.mjs /recovery-private/' + $Phase + '-tests.json; }'
  $result = Invoke-RecoveryDocker ($compose + @('run','--rm','--no-deps') + $extra + @('-e',('RECOVERY_PHASE='+$Phase),'runner','-c',$command))
  Write-Output ($Phase + ': pruebas aprobadas (resultado privado en ' + $directory + ').')
}
$oldRevision = (& git -C $repo rev-parse HEAD).Trim()
$newDatabase = 'recovery_' + $id + '_test'
$archive = Join-Path $copies 'preupdate.enc'
Write-Output ('Proyecto aislado: ' + $project)
try {
  & (Join-Path $PSScriptRoot 'check-time.ps1')
  $null = Invoke-RecoveryDocker ($compose + @('up','-d','--wait','db','mailpit'))
  $container = (Invoke-RecoveryDocker ($compose + @('ps','-q','db'))).Trim()
  $null = Invoke-RecoveryDocker ($compose + @('run','--rm','--no-deps','runner','-c','node --test ops/recovery/archive.test.mjs'))
  Run-Phase 'prepare'
  $backup = & (Join-Path $PSScriptRoot 'backup.ps1') -Container $container -Database academia_v00_test -ArchiveFile $archive -KeyFile $key -Revision $oldRevision -MaintenanceConfirmed
  $guards = & (Join-Path $PSScriptRoot 'check-guards.ps1') -Container $container -ArchiveFile $archive -KeyFile $key -Revision $oldRevision
  [IO.File]::WriteAllText((Join-Path $directory 'guards-summary.json'),($guards | ConvertTo-Json),[Text.UTF8Encoding]::new($false))
  Run-Phase 'postbackup'
  # Solo la copia privada de migraciones del contenedor recibe SQL deliberadamente fallido.
  $handoff = Get-Content -LiteralPath (Join-Path $directory 'handoff.json') -Raw | ConvertFrom-Json
  $schema = $handoff.schema
  if ($schema -notmatch '^t_[a-z0-9_]+$') { throw 'Schema de ensayo inválido.' }
  $migration = "BEGIN; CREATE TABLE `"RecoveryInterrupted`" (id int PRIMARY KEY); SELECT recovery_deliberate_missing_function(); COMMIT;"
  [IO.File]::WriteAllText((Join-Path $directory 'failed.sql'),$migration,[Text.UTF8Encoding]::new($false))
  $candidateConfig = "import {defineConfig} from 'prisma/config'; import {loadEnvironment} from './src/infrastructure/config/environment.ts'; export default defineConfig({schema:'/tmp/recovery-prisma/schema.prisma',migrations:{path:'/tmp/recovery-prisma/migrations'},datasource:{url:loadEnvironment().migrationUrl}});"
  [IO.File]::WriteAllText((Join-Path $directory 'candidate.config.ts'),$candidateConfig,[Text.UTF8Encoding]::new($false))
  $failureCommand = 'cp -R apps/api/prisma /tmp/recovery-prisma && mkdir /tmp/recovery-prisma/migrations/0005_recovery_failed && cp /recovery-private/failed.sql /tmp/recovery-prisma/migrations/0005_recovery_failed/migration.sql && cp /recovery-private/candidate.config.ts apps/api/recovery.config.ts && cd apps/api && TEST_DATABASE_URL=${TEST_DATABASE_URL}?schema=' + $schema + ' TEST_MIGRATION_DATABASE_URL=${TEST_MIGRATION_DATABASE_URL}?schema=' + $schema + ' npx prisma migrate deploy --config recovery.config.ts >/recovery-private/failed-migration.log 2>&1'
  $ErrorActionPreference = 'Continue'
  $failed = & docker @compose run --rm --no-deps runner -c $failureCommand 2>&1
  $failureExit = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  [IO.File]::WriteAllLines((Join-Path $directory 'failed-container.log'),[string[]]$failed,[Text.UTF8Encoding]::new($false))
  if ($failureExit -eq 0) { throw 'La migración deliberadamente inválida no falló.' }
  $failureAt = [DateTime]::UtcNow
  $failedState = Invoke-RecoveryDocker @('exec','--user','postgres',$container,'psql','-U','postgres','-d','academia_v00_test','-At','--set','ON_ERROR_STOP=1','-c',("SELECT count(*) FROM " + $schema + "._prisma_migrations WHERE migration_name='0005_recovery_failed' AND finished_at IS NULL AND rolled_back_at IS NULL"))
  if ($failedState.Trim() -ne '1') { throw 'No consta una migración fallida real.' }
  $partial = Invoke-RecoveryDocker @('exec','--user','postgres',$container,'psql','-U','postgres','-d','academia_v00_test','-At','--set','ON_ERROR_STOP=1','-c',("SELECT to_regclass('" + $schema + '."RecoveryInterrupted"' + "') IS NULL"))
  if ($partial.Trim() -ne 't') { throw 'La transacción fallida dejó una tabla parcial inesperada.' }
  $restore = & (Join-Path $PSScriptRoot 'restore-check.ps1') -Container $container -NewDatabase $newDatabase -ArchiveFile $archive -KeyFile $key -MaintenanceConfirmed
  $null = Invoke-RecoveryDocker @('exec','--user','postgres',$container,'psql','-U','postgres','-d','postgres','--set','ON_ERROR_STOP=1','-c',("COMMENT ON DATABASE " + $newDatabase + " IS 'identity-recovery-isolated'; REVOKE ALL ON DATABASE " + $newDatabase + ' FROM PUBLIC; GRANT CONNECT ON DATABASE ' + $newDatabase + ' TO academia_v00_runtime,academia_v00_owner;'))
  Run-Phase 'restore' $newDatabase
  $finished = [DateTime]::UtcNow
  $summary = [ordered]@{project=$project;oldRevision=$oldRevision;candidateRevision=$oldRevision;candidateMigrationSha256=(Get-FileHash -LiteralPath (Join-Path $directory 'failed.sql') -Algorithm SHA256).Hash.ToLowerInvariant();failedMigrationVerified=$true;backup=$backup;restore=$restore;failureAt=$failureAt.ToString('o');finishedAt=$finished.ToString('o');rpoUpperSeconds=(Get-RecoverySeconds $backup.startedAt $failureAt.ToString('o'));rtoSeconds=(Get-RecoverySeconds $failureAt.ToString('o') $finished.ToString('o'));knownLostChanges=1;automated=$true;manualAcceptance=$false}
  [IO.File]::WriteAllText((Join-Path $directory 'summary.json'),($summary | ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
  Write-Output ('Ensayo completado; resumen sin secretos: ' + (Join-Path $directory 'summary.json'))
} finally {
  # Sin -v: conserva exclusivamente el volumen nuevo para inspección; no toca otros proyectos.
  $null = Invoke-RecoveryDocker ($compose + @('stop','--timeout','10'))
  Write-Output ('Recursos del ensayo detenidos; volumen y archivos privados conservados: ' + $project)
}
