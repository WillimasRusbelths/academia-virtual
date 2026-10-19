[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Container,
  [Parameter(Mandatory=$true)][ValidatePattern('^recovery_[a-z0-9_]+_test$')][string]$NewDatabase,
  [Parameter(Mandatory=$true)][string]$ArchiveFile,
  [Parameter(Mandatory=$true)][string]$KeyFile,
  [Parameter(Mandatory=$true)][switch]$MaintenanceConfirmed
)
. (Join-Path $PSScriptRoot 'common.ps1')
if (-not $MaintenanceConfirmed) { throw 'Mantener escritores y worker detenidos.' }
Assert-RecoveryParameters $Container $NewDatabase
Assert-RecoveryFiles $ArchiveFile $KeyFile
$archivePath = [IO.Path]::GetFullPath($ArchiveFile)
$manifest = Get-Content -LiteralPath ($archivePath + '.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.format -ne 'ACADBKP1' -or $manifest.postgresMajor -ne 16 -or (Get-Item -LiteralPath $archivePath).Length -ne $manifest.cipherBytes -or
    (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.cipherSha256) { throw 'Hash/formato del respaldo inválido.' }
$exists = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'psql','--username','postgres','--no-password','--dbname','postgres','-At','--set','ON_ERROR_STOP=1','--command',("SELECT 1 FROM pg_database WHERE datname='" + $NewDatabase + "'"))
if ($exists.Trim() -ne '') { throw 'La base destino ya existe; no se modifica.' }
$id = [guid]::NewGuid().ToString('N')
$plainFile = Join-Path ([IO.Path]::GetDirectoryName($archivePath)) ($id + '.dump')
$remoteFile = '/tmp/identity-restore-' + $id + '.dump'
$started = [DateTime]::UtcNow
try {
  $plain = Invoke-RecoveryCipher 'decrypt' $archivePath $plainFile $KeyFile
  if ($plain.sha256 -ne $manifest.plainSha256) { throw 'Hash del archivo descifrado inválido.' }
  $null = Invoke-RecoveryDocker @('cp',$plainFile,($Container + ':' + $remoteFile))
  $null = Invoke-RecoveryDocker @('exec','--user','root',$Container,'chown','postgres:postgres',$remoteFile)
  $null = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'pg_restore','--list',$remoteFile)
  $null = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'createdb','--username','postgres','--no-password','--template=template0',$NewDatabase)
  $null = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'psql','-U','postgres','-d','postgres','--set','ON_ERROR_STOP=1','--command',('REVOKE ALL ON DATABASE '+$NewDatabase+' FROM PUBLIC'))
  # Conserva owners/ACL. Los roles globales deben existir previamente. Nunca --clean/--create.
  $null = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'pg_restore','--username','postgres','--no-password','--exit-on-error','--single-transaction','--dbname',$NewDatabase,$remoteFile)
  return [pscustomobject]@{database=$NewDatabase;revision=$manifest.revision;startedAt=$started.ToString('o');completedAt=[DateTime]::UtcNow.ToString('o');archiveSha256=$manifest.cipherSha256;restored=$true;trafficReady=$false}
} finally {
  if (Test-Path -LiteralPath $plainFile) { Remove-Item -LiteralPath $plainFile -Force }
  $null = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'rm','-f','--',$remoteFile)
}
