$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$exe = Join-Path $root '.cache/mailpit-1.31.3/mailpit.exe'
if (-not (Test-Path -LiteralPath $exe)) { throw 'Falta Mailpit: seguir ops/local/native.md' }
if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash -ne 'EE0B025BC9F61E6856D6032128408EE6FE1627F510C118A4FA0FAA7BFDB7CD33') {
    throw 'Binario Mailpit no coincide con el verificado'
}
$listeners = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
if ($listeners | Where-Object { $_.Port -in @(1025,8025) }) { throw 'Puertos ocupados: no detener servicios existentes' }
# Limpiar solo variables heredadas del proceso hijo; no modificar entorno global.
$saved = @{}
Get-ChildItem Env:MP_* | ForEach-Object { $saved[$_.Name] = $_.Value; Remove-Item -LiteralPath ('Env:' + $_.Name) }
try {
    $process = Start-Process -FilePath $exe -WorkingDirectory $root -WindowStyle Hidden -PassThru -ArgumentList @(
        '--listen','127.0.0.1:8025','--smtp','127.0.0.1:1025',
        '--allowed-hosts','localhost,127.0.0.1','--smtp-allowed-recipients','@example[.]test$',
        '--smtp-disable-rdns','--disable-version-check','--block-remote-css-and-fonts',
        '--max','0','--quiet'
    )
    Write-Output "Mailpit iniciado por este script; PID=$($process.Id). Sin relay ni forwarding."
} finally { foreach ($name in $saved.Keys) { Set-Item -LiteralPath ('Env:' + $name) -Value $saved[$name] } }
