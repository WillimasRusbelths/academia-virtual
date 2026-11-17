[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ApiImage)
. (Join-Path $PSScriptRoot 'common.ps1')
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$id = [guid]::NewGuid().ToString('N').Substring(0,12)
$project = 'materials-resources-' + $id
$directory = Join-Path $repo ('.cache/materials-resources-' + $id)
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
      RESOURCES_ISOLATED: '1'
      TRUSTED_PROXY: ''
    volumes:
      - '__ROOT__/apps/api/tsconfig.json:/workspace/apps/api/tsconfig.json:ro'
      - '__ROOT__/apps/api/src:/workspace/apps/api/src:ro'
      - '__ROOT__/apps/api/prisma:/workspace/apps/api/prisma:ro'
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
COMMENT ON DATABASE academia_v00_test IS 'materials-resources-isolated';
\connect academia_v00_test
REVOKE ALL ON SCHEMA public FROM PUBLIC;
'@
[IO.File]::WriteAllText((Join-Path $directory 'init.sql'),$init,[Text.UTF8Encoding]::new($false))
$compose = @('compose','--project-name',$project,'--env-file',(Join-Path $directory 'private.env'),'-f',(Join-Path $directory 'compose.yml'))

$revision = (& git -C $repo rev-parse HEAD).Trim()
$imageId = (Invoke-RecoveryDocker @('image','inspect',$ApiImage,'--format','{{.Id}}')).Trim()
$sourceManifest = @(git -C $repo ls-files --cached --others --exclude-standard -- apps/api ops/recovery | ForEach-Object { if(Test-Path -LiteralPath (Join-Path $repo $_) -PathType Leaf){[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $repo $_) -Algorithm SHA256).Hash.ToLowerInvariant()}} })
[IO.File]::WriteAllText((Join-Path $directory 'source-manifest.json'),($sourceManifest|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
$configurationHash = (Get-FileHash -LiteralPath (Join-Path $directory 'private.env') -Algorithm SHA256).Hash
function Get-LabFootprint([string]$Container) {
  $settings = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'psql','-X','-q','-At','-U','postgres','-d','academia_v00_test','--set','ON_ERROR_STOP=1','-c',"SELECT json_build_object('databaseBytes',pg_database_size(current_database()),'settings',(SELECT json_object_agg(name,setting) FROM pg_settings WHERE name IN ('server_version','shared_buffers','wal_level','max_connections','full_page_writes','wal_compression','default_toast_compression')))" )
  $data = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'du','-sk','/var/lib/postgresql/data')
  $wal = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'du','-sk','/var/lib/postgresql/data/pg_wal')
  $disk = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'df','-Pk','/var/lib/postgresql/data')
  $stats = Invoke-RecoveryDocker @('stats','--no-stream','--format','{{json .}}',$Container)
  return [pscustomobject]@{at=[DateTime]::UtcNow.ToString('o');postgres=($settings|ConvertFrom-Json);clusterAllocatedKiB=[long]([regex]::Match($data,'^[0-9]+').Value);walAllocatedKiB=[long]([regex]::Match($wal,'^[0-9]+').Value);disk=$disk;container=($stats|ConvertFrom-Json)}
}
Write-Output ('Proyecto aislado de recursos: '+$project)
try {
  & (Join-Path $PSScriptRoot 'check-time.ps1')
  $resolved=(Invoke-RecoveryDocker ($compose+@('config','--format','json')))|ConvertFrom-Json
  if(-not $resolved.networks.default.internal -or $resolved.volumes.trial_data.name -ne ($project+'_trial_data')){throw 'Aislamiento de recursos rechazado.'}
  foreach($service in $resolved.services.PSObject.Properties){if($service.Value.ports.Count -gt 0){throw 'Puertos publicados rechazados.'}}
  $null=Invoke-RecoveryDocker ($compose+@('up','-d','--wait','db','mailpit'))
  $container=(Invoke-RecoveryDocker ($compose+@('ps','-q','db'))).Trim()
  $before=Get-LabFootprint $container
  $check='npm run db:generate >/tmp/generate.txt 2>&1 && npm run lint --workspace apps/api >/tmp/lint.txt 2>&1 && npm run build --workspace apps/api >/tmp/build.txt 2>&1 && cd apps/api && npx tsc --ignoreConfig --allowJs --checkJs false --noEmit --target ES2023 --module NodeNext --moduleResolution NodeNext --strict --experimentalDecorators --emitDecoratorMetadata --esModuleInterop --skipLibCheck tests/recovery/materials-resources.spec.ts >/recovery-private/types.log 2>&1'
  $null=Invoke-RecoveryDocker ($compose+@('run','--rm','--no-deps','runner','-c',$check))
  Write-Output 'Lint, tipos del ensayo y build API aprobados.'
  $command='npm run db:generate >/tmp/generate.txt 2>&1 && npm run build --workspace apps/api >/tmp/build.txt 2>&1 && cd apps/api && { npx vitest run tests/recovery/materials-resources.spec.ts --maxWorkers=1 --reporter=json --outputFile=/recovery-private/resources-tests.json >/tmp/resources.log 2>&1; node /workspace/ops/recovery/report.mjs /recovery-private/resources-tests.json; }'
  $null=Invoke-RecoveryDocker ($compose+@('run','--rm','--no-deps','runner','-c',$command))
  Write-Output 'Transferencias, recursos, cliente lento y fallos inyectados: aprobados.'
  $after=Get-LabFootprint $container
  $resources=Get-Content -LiteralPath (Join-Path $directory 'resources-summary.json') -Raw|ConvertFrom-Json
  if($resources.schema -notmatch '^t_materials_fixture_[a-f0-9]+$' -or -not $resources.hashesVerified -or $resources.capacityAccepted){throw 'Resultado de recursos rechazado.'}
  $backup=& (Join-Path $PSScriptRoot 'backup.ps1') -Container $container -Database academia_v00_test -ArchiveFile (Join-Path $copies 'materials-resources.enc') -KeyFile $key -Revision $revision -MaintenanceConfirmed -MaterialsSchema $resources.schema
  if($backup.materials.byteCount -ne [long]$resources.final.logicalContentBytes){throw 'Inventario y medicion no coinciden.'}
  foreach($entry in $sourceManifest){if((Get-FileHash -LiteralPath (Join-Path $repo $entry.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256){throw 'Fuente modificada durante el ensayo.'}}
  if((Get-FileHash -LiteralPath (Join-Path $directory 'private.env') -Algorithm SHA256).Hash -ne $configurationHash){throw 'Configuracion privada modificada.'}
  $afterBackup=Get-LabFootprint $container
  $summary=[ordered]@{project=$project;clientDate='2026-11-17';timezone='America/Lima';revision=$revision;apiImageId=$imageId;sourceManifestVerified=$true;configurationPreserved=$true;before=$before;after=$after;afterBackup=$afterBackup;backup=$backup;backupSeconds=(Get-RecoverySeconds $backup.startedAt $backup.completedAt);physicalDiskExhaustion=$false;capacityAccepted=$false;humanAcceptance=$false;publicTraffic=$false}
  [IO.File]::WriteAllText((Join-Path $directory 'summary.json'),($summary|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
  Write-Output ('Ensayo de recursos completado; resumen sin secretos: '+(Join-Path $directory 'summary.json'))
} finally {
  $null=Invoke-RecoveryDocker ($compose+@('stop','--timeout','10'))
  Write-Output ('Recursos detenidos; volumen y evidencia privada conservados: '+$project)
}
