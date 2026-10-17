[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
# Solo lectura del equipo. No inicia Docker ni cambia Windows/WSL/recursos.
$started = [DateTimeOffset]::Now
$elapsed = [Diagnostics.Stopwatch]::StartNew()
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$directory = Join-Path $repo ('.cache/identity-host-' + [guid]::NewGuid().ToString('N').Substring(0,12))
$null = New-Item -ItemType Directory -Path $directory
$acl = Get-Acl -LiteralPath $directory
$acl.SetAccessRuleProtection($true,$false)
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
Set-Acl -LiteralPath $directory -AclObject $acl
$observations = [ordered]@{
  startedAt = $started.ToString('o')
  revision = (& git -C $repo rev-parse HEAD).Trim()
  activePowerScheme = ((& powercfg /getactivescheme) -join "`n")
  processor = @(Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,CurrentClockSpeed,MaxClockSpeed,LoadPercentage)
  battery = @(Get-CimInstance Win32_Battery | Select-Object BatteryStatus,EstimatedChargeRemaining)
  # PowerOnline evita inferir alimentacion solo de BatteryStatus.
  power = @(Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus | Select-Object PowerOnline,Discharging,Charging,RemainingCapacity,DischargeRate)
  memory = (Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory,LastBootUpTime)
  processorSample = @(Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation | Where-Object Name -eq '_Total' | Select-Object ProcessorFrequency,PercentProcessorPerformance,PercentProcessorUtility,PercentProcessorTime)
  # Nombres/contadores, sin lineas de comando, usuarios ni configuracion privada.
  competingProcesses = @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $_.Name -notmatch '^(_Total|Idle)$' } | Sort-Object PercentProcessorTime -Descending | Select-Object -First 12 Name,IDProcess,PercentProcessorTime,WorkingSetPrivate)
  docker = $null
}
try {
  $dockerInfo = & docker info --format '{{json .NCPU}} {{json .MemTotal}} {{json .ServerVersion}}' 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Docker no disponible.' }
  $observations.docker = [ordered]@{available=$true;cpuMemoryVersion=($dockerInfo -join "`n")}
} catch {
  $observations.docker = [ordered]@{available=$false;reason='Cliente o motor Docker no disponible; verificar antes de cargar.'}
}
$observations['finishedAt'] = [DateTimeOffset]::Now.ToString('o')
$observations['elapsedMonotonicMs'] = $elapsed.Elapsed.TotalMilliseconds
$observations['elapsedCivilMs'] = ([DateTimeOffset]::Now - $started).TotalMilliseconds
$observations['limitations'] = 'Muestras puntuales no simultaneas, incluyen costo de CIM; no son telemetria de carga, potencia, temperatura ni prueba de ausencia de contencion.'
$path = Join-Path $directory 'host.json'
[IO.File]::WriteAllText($path,($observations | ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false))
Write-Output ('Preflight privado: ' + $path)
