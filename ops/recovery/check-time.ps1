. (Join-Path $PSScriptRoot 'common.ps1')
if ((Get-RecoverySeconds '2026-10-16T11:22:12Z' '2026-10-16T06:22:12-05:00') -ne 0) { throw 'Zona horaria incorrecta.' }
$seconds = Get-RecoverySeconds '2026-10-16T11:21:46.7097283Z' '2026-10-16T06:22:12.5271083-05:00'
if ([Math]::Abs($seconds-25.81738) -gt 0.0000001) { throw 'Precision temporal incorrecta.' }
Write-Output 'Tiempos: 2/2 comprobaciones aprobadas (UTC y America/Lima).'
