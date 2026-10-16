$ErrorActionPreference = 'Stop'
function Get-RecoverySeconds([string]$StartedAt,[string]$FinishedAt) {
  return ([DateTimeOffset]::Parse($FinishedAt)-[DateTimeOffset]::Parse($StartedAt)).TotalSeconds
}
function Invoke-RecoveryDocker([string[]]$DockerArguments) {
  # PowerShell 5.1 convierte stderr de progreso de Docker en ErrorRecord incluso con exit 0.
  $ErrorActionPreference = 'Continue'
  $captured = & docker @DockerArguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Docker/PostgreSQL no completó la operación. Valores omitidos.' }
  return ($captured -join "`n")
}
function Assert-RecoveryParameters([string]$Container, [string]$Database) {
  if ($Container -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$' -or $Database -notmatch '^[a-z][a-z0-9_]{0,62}$') { throw 'Destino inválido.' }
  $version = Invoke-RecoveryDocker @('exec', '--user', 'postgres', $Container, 'pg_dump', '--version')
  if ($version -notmatch 'PostgreSQL\) 16\.') { throw 'Se requiere PostgreSQL 16.' }
}
function Assert-RecoveryFiles([string]$ArchiveFile, [string]$KeyFile) {
  $archiveParent = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ArchiveFile))
  $keyPath = [IO.Path]::GetFullPath($KeyFile)
  if (-not (Test-Path -LiteralPath $archiveParent -PathType Container) -or -not (Test-Path -LiteralPath $keyPath -PathType Leaf)) { throw 'Preparar directorio privado y clave separada.' }
  if ($keyPath.StartsWith($archiveParent.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Guardar la clave fuera del directorio de copias.' }
  if ((Get-Item -LiteralPath $keyPath).Length -ne 32) { throw 'Clave binaria de 32 bytes requerida.' }
}
function Invoke-RecoveryCipher([string]$Mode, [string]$InputFile, [string]$OutputFile, [string]$KeyFile) {
  $ErrorActionPreference = 'Continue'
  $captured = & node (Join-Path $PSScriptRoot 'archive.mjs') $Mode $InputFile $OutputFile $KeyFile 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'Cifrado/autenticación no completados. Valores omitidos.' }
  return (($captured -join "`n") | ConvertFrom-Json)
}
