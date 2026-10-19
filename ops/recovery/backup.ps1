[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Container,
  [Parameter(Mandatory=$true)][string]$Database,
  [Parameter(Mandatory=$true)][string]$ArchiveFile,
  [Parameter(Mandatory=$true)][string]$KeyFile,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{7,40}$')][string]$Revision,
  [Parameter(Mandatory=$true)][switch]$MaintenanceConfirmed
)
. (Join-Path $PSScriptRoot 'common.ps1')
if (-not $MaintenanceConfirmed) { throw 'Detener escritores y worker antes del respaldo.' }
Assert-RecoveryParameters $Container $Database
Assert-RecoveryFiles $ArchiveFile $KeyFile
$archivePath = [IO.Path]::GetFullPath($ArchiveFile)
$manifestPath = $archivePath + '.json'
if ((Test-Path -LiteralPath $archivePath) -or (Test-Path -LiteralPath $manifestPath)) { throw 'No se sobrescriben copias ni manifiestos.' }
$id = [guid]::NewGuid().ToString('N')
$remoteFile = '/tmp/identity-backup-' + $id + '.dump'
$plainFile = Join-Path ([IO.Path]::GetDirectoryName($archivePath)) ($id + '.dump')
$started = [DateTime]::UtcNow
try {
  # El flujo binario permanece en archivos: nunca pasa por la redirección de PowerShell.
  $null = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'pg_dump','--username','postgres','--no-password','--format=custom','--file',$remoteFile,'--dbname',$Database)
  $null = Invoke-RecoveryDocker @('cp',($Container + ':' + $remoteFile),$plainFile)
  if ((Get-Item -LiteralPath $plainFile).Length -le 0) { throw 'Respaldo vacío.' }
  $plainHash = (Get-FileHash -LiteralPath $plainFile -Algorithm SHA256).Hash.ToLowerInvariant()
  $cipher = Invoke-RecoveryCipher 'encrypt' $plainFile $archivePath $KeyFile
  $manifest = [ordered]@{format='ACADBKP1';postgresMajor=16;revision=$Revision;startedAt=$started.ToString('o');completedAt=[DateTime]::UtcNow.ToString('o');plainSha256=$plainHash;cipherSha256=$cipher.sha256;cipherBytes=$cipher.bytes;restored=$false}
  $json = $manifest | ConvertTo-Json
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $stream = [IO.File]::Open($manifestPath,[IO.FileMode]::CreateNew)
  try { $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
  return [pscustomobject]$manifest
} finally {
  if (Test-Path -LiteralPath $plainFile) { Remove-Item -LiteralPath $plainFile -Force }
  $null = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'rm','-f','--',$remoteFile)
}
