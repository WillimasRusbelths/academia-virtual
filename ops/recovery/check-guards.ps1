[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Container,
  [Parameter(Mandatory=$true)][string]$ArchiveFile,
  [Parameter(Mandatory=$true)][string]$KeyFile,
  [Parameter(Mandatory=$true)][string]$Revision
)
. (Join-Path $PSScriptRoot 'common.ps1')
$passed = 0
function Assert-Rejected([scriptblock]$Action) {
  $rejected = $false
  try { $null = & $Action } catch { $rejected = $true }
  if (-not $rejected) { throw 'Una guarda no rechazó la operación inválida.' }
  $script:passed++
}
$backupScript = Join-Path $PSScriptRoot 'backup.ps1'
$restoreScript = Join-Path $PSScriptRoot 'restore-check.ps1'
$before = (Get-FileHash -LiteralPath $ArchiveFile -Algorithm SHA256).Hash
Assert-Rejected { & $backupScript -Container $Container -Database academia_v00_test -ArchiveFile $ArchiveFile -KeyFile $KeyFile -Revision $Revision -MaintenanceConfirmed }
Assert-Rejected { & $backupScript -Container $Container -Database academia_v00_test -ArchiveFile ($ArchiveFile+'.disabled') -KeyFile $KeyFile -Revision $Revision -MaintenanceConfirmed:$false }
if ((Get-FileHash -LiteralPath $ArchiveFile -Algorithm SHA256).Hash -ne $before) { throw 'La copia previa cambió.' }
$id = [guid]::NewGuid().ToString('N').Substring(0,12)
$guardDatabase = 'recovery_guard_' + $id + '_test'
$wrongKey = Join-Path (Split-Path $KeyFile) ($id+'.key')
$corrupt = $ArchiveFile + '.corrupt'
try {
  & node -e "require('node:fs').writeFileSync(process.argv[1],require('node:crypto').randomBytes(32),{flag:'wx',mode:0o600})" $wrongKey
  if ($LASTEXITCODE -ne 0) { throw 'No se preparó la prueba de clave.' }
  Assert-Rejected { & $restoreScript -Container $Container -NewDatabase $guardDatabase -ArchiveFile $ArchiveFile -KeyFile $wrongKey -MaintenanceConfirmed }
  Copy-Item -LiteralPath $ArchiveFile -Destination $corrupt
  Copy-Item -LiteralPath ($ArchiveFile+'.json') -Destination ($corrupt+'.json')
  $stream = [IO.File]::OpenWrite($corrupt)
  try { $stream.SetLength(10) } finally { $stream.Dispose() }
  Assert-Rejected { & $restoreScript -Container $Container -NewDatabase $guardDatabase -ArchiveFile $corrupt -KeyFile $KeyFile -MaintenanceConfirmed }
  $exists = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'psql','-U','postgres','-d','postgres','-At','-c',("SELECT count(*) FROM pg_database WHERE datname='"+$guardDatabase+"'"))
  if ($exists.Trim() -ne '0') { throw 'Una entrada inválida creó una BD.' }
  $null = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'createdb','-U','postgres',$guardDatabase)
  $identityBefore = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'psql','-U','postgres','-d','postgres','-At','-c',("SELECT oid FROM pg_database WHERE datname='"+$guardDatabase+"'"))
  Assert-Rejected { & $restoreScript -Container $Container -NewDatabase $guardDatabase -ArchiveFile $ArchiveFile -KeyFile $KeyFile -MaintenanceConfirmed }
  $identityAfter = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'psql','-U','postgres','-d','postgres','-At','-c',("SELECT oid FROM pg_database WHERE datname='"+$guardDatabase+"'"))
  if ($identityBefore -ne $identityAfter) { throw 'Una guarda sustituyó la BD existente.' }
  if (@(Get-ChildItem -LiteralPath (Split-Path $ArchiveFile) -Filter '*.dump').Count -ne 0) { throw 'Quedó un dump temporal.' }
  return [pscustomobject]@{passed=$passed;failed=0;existingDatabasePreserved=$true;invalidInputCreatedDatabase=$false;partialPlaintextRemoved=$true}
} finally {
  foreach ($file in @($wrongKey,$corrupt,($corrupt+'.json'))) { if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force } }
}
