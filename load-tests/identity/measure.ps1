[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ContextFile,
  [Parameter(Mandatory=$true)][ValidateSet('sessions-warmup','sessions','authentication','smoke-sessions','smoke-authentication')][string]$Scenario,
  [switch]$Diagnostics,
  [switch]$EngineDiagnostics,
  [switch]$CpuProfile,
  [ValidateSet('baseline','pg2','k6-2','pg2-k6-2')][string]$ResourceExperiment='baseline'
)
. (Join-Path $PSScriptRoot '../../ops/recovery/common.ps1')
if($CpuProfile -and -not $EngineDiagnostics){throw 'CpuProfile requiere EngineDiagnostics.'}
$context=Get-Content -LiteralPath $ContextFile -Raw | ConvertFrom-Json
if($context.project -notmatch '^identity-load-[a-f0-9]{12}$'){throw 'Proyecto aislado invalido.'}
$compose=@('compose','--project-name',$context.project,'--env-file',$context.envFile,'-f',(Join-Path $PSScriptRoot 'compose.yml'))
if($EngineDiagnostics){$compose+=@('-f',(Join-Path $PSScriptRoot 'compose.engine.yml'))}
if($CpuProfile){$compose+=@('-f',(Join-Path $PSScriptRoot 'compose.cpu-profile.yml'))}
$env:IDENTITY_EXPERIMENT_PG_CPUS=if($ResourceExperiment -in @('pg2','pg2-k6-2')){'2'}else{'1'}
$env:IDENTITY_EXPERIMENT_K6_CPUS=if($ResourceExperiment -in @('k6-2','pg2-k6-2')){'2'}else{'1'}
if($ResourceExperiment -ne 'baseline'){$compose+=@('-f',(Join-Path $PSScriptRoot 'compose.resources.yml'))}
$name=$Scenario+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)
$env:LOAD_DIAGNOSTICS=if($Diagnostics){'1'}else{'0'}
$env:LOAD_DIAGNOSTICS_NAME=$name
$generator=$context.project+'-generator-'+[guid]::NewGuid().ToString('N').Substring(0,8)
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$revision=(& git -C $repo rev-parse HEAD).Trim()
$diff=@(& git -C $repo diff HEAD --binary)
[IO.File]::WriteAllLines((Join-Path $context.directory ($name+'-diff.patch')),[string[]]$diff,[Text.UTF8Encoding]::new($false))
$sourceHashes=Get-ChildItem -LiteralPath $PSScriptRoot -File | ForEach-Object {[ordered]@{name=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}}
$os=Get-CimInstance Win32_OperatingSystem
$cpu=Get-CimInstance Win32_Processor | Select-Object -First 1
$disk=Get-CimInstance Win32_LogicalDisk | Where-Object {$_.DeviceID -eq [IO.Path]::GetPathRoot($repo).TrimEnd('\')}
$k6=Invoke-RecoveryDocker ($compose+@('run','--rm','--no-deps','generator','version'))
$hardware=[ordered]@{os=$os.Caption;cpu=$cpu.Name;cores=$cpu.NumberOfLogicalProcessors;ramBytes=([long]$os.TotalVisibleMemorySize*1024);freeRamBytes=([long]$os.FreePhysicalMemory*1024);diskFreeBytes=$disk.FreeSpace;diskBytes=$disk.Size;fileSystem=$disk.FileSystem;driveType=$disk.DriveType;docker=(Invoke-RecoveryDocker @('info','--format','{{json .NCPU}} {{json .MemTotal}}'));sameHostContention=$true}
$null=Invoke-RecoveryDocker ($compose+@('up','-d','--wait','api'))
$null=Invoke-RecoveryDocker ($compose+@('run','--rm','--no-deps','runner','-c',('node --experimental-strip-types load-tests/identity/snapshot.ts '+$name+'-before')))
$containers=@((Invoke-RecoveryDocker ($compose+@('ps','-q','api'))).Trim(),(Invoke-RecoveryDocker ($compose+@('ps','-q','db'))).Trim())
$images=foreach($container in $containers){Invoke-RecoveryDocker @('inspect','--format','{{.Image}} memory={{.HostConfig.Memory}} nanoCpus={{.HostConfig.NanoCpus}}',$container)}
$imageDigests=foreach($image in @('academia-local-api:latest','postgres:16.14-bookworm','grafana/k6:1.6.0')){Invoke-RecoveryDocker @('image','inspect','--format','{{.Id}} {{json .RepoDigests}}',$image)}
$script=if($Scenario.StartsWith('smoke-')){'smoke.js'}elseif($Scenario -eq 'authentication'){'authentication.js'}else{'sessions.js'}
$phase=if($Scenario -eq 'sessions-warmup'){'warmup'}else{'measured'}
$kind=if($Scenario -eq 'smoke-authentication'){'authentication'}else{'sessions'}
$elapsed=[Diagnostics.Stopwatch]::StartNew()
$started=[DateTime]::UtcNow
$observerProcess=[Diagnostics.Process]::GetCurrentProcess()
$observerCpuStart=$observerProcess.TotalProcessorTime.TotalMilliseconds
$metadata=[ordered]@{scenario=$Scenario;diagnostics=[bool]$Diagnostics;engineDiagnostics=[bool]$EngineDiagnostics;cpuProfile=[bool]$CpuProfile;startedAt=$started.ToString('o');revision=$revision;sourceHashes=$sourceHashes;
  resourceExperiment=$ResourceExperiment;requestedPostgresCpus=[int]$env:IDENTITY_EXPERIMENT_PG_CPUS;requestedGeneratorCpus=[int]$env:IDENTITY_EXPERIMENT_K6_CPUS;
  lockSha256=(Get-FileHash -LiteralPath (Join-Path $repo 'package-lock.json') -Algorithm SHA256).Hash.ToLowerInvariant();
  diffSha256=(Get-FileHash -LiteralPath (Join-Path $context.directory ($name+'-diff.patch')) -Algorithm SHA256).Hash.ToLowerInvariant();
  hardware=$hardware;containers=$images;imageDigests=$imageDigests;k6=$k6;network='Docker bridge interna, sin puertos publicados; API y generador separados';finishedAt=$null;exitCode=$null;
  observerCoverage='Proceso PowerShell padre: CPU/RAM y duracion de ciclo; excluye procesos docker.exe, CIM, motor Docker y observador dentro de API.'}
$statsFile=Join-Path $context.directory ($name+'-resources.jsonl')
$resources=@{};$resourceSamples=0
$exitCode=1
try{
  $null=Invoke-RecoveryDocker ($compose+@('run','-d','--no-deps','--name',$generator,'-e',('RESULT_NAME='+$name),'-e',('LOAD_PHASE='+$phase),'-e',('SMOKE_KIND='+$kind),
    'generator','run','--out',('json=/load-private/'+$name+'-raw.jsonl'),('/scripts/'+$script)))
  $metadata['generatorResources']=Invoke-RecoveryDocker @('inspect','--format','memory={{.HostConfig.Memory}} nanoCpus={{.HostConfig.NanoCpus}}',$generator)
  while((Invoke-RecoveryDocker @('inspect','--format','{{.State.Running}}',$generator)).Trim() -eq 'true'){
    $cycleStart=$elapsed.Elapsed.TotalMilliseconds
    $stats=Invoke-RecoveryDocker (@('stats','--no-stream','--format','{{json .}}')+$containers+@($generator))
    $sample=[ordered]@{at=[DateTime]::UtcNow.ToString('o');elapsedMonotonicMs=$elapsed.Elapsed.TotalMilliseconds;docker=($stats -split "`n" | ForEach-Object {$_|ConvertFrom-Json})}
    if($Diagnostics -or $EngineDiagnostics){
      $cgroups=@{}
      foreach($target in @(@{role='api';id=$containers[0]},@{role='database';id=$containers[1]},@{role='generator';id=$generator})){
        if((Invoke-RecoveryDocker @('inspect','--format','{{.State.Running}}',$target.id)).Trim() -eq 'true'){
          try{$cpu=Invoke-RecoveryDocker @('exec',$target.id,'sh','-c','cat /sys/fs/cgroup/cpu.stat')}catch{
            if($target.role -eq 'generator' -and (Invoke-RecoveryDocker @('inspect','--format','{{.State.Running}}',$target.id)).Trim() -eq 'false'){continue}
            throw
          }
          $fields=@{};foreach($line in ($cpu -split "`n")){if($line -match '^([a-z_]+) ([0-9]+)$'){$fields[$matches[1]]=[long]$matches[2]}}
          $cgroups[$target.role]=$fields
        }
      }
      $sample['cgroups']=$cgroups
    }
    $resourceSamples++
    foreach($entry in $sample.docker){
      $role=if($entry.Name.EndsWith('-api-1')){'api'}elseif($entry.Name.EndsWith('-db-1')){'database'}else{'generator'}
      if(-not $resources.ContainsKey($role)){$resources[$role]=[ordered]@{peakCpuPercent=0.0;peakMemoryPercent=0.0;peakMemory='';blockIo='';networkIo=''}}
      $cpuPercent=[double]::Parse($entry.CPUPerc.TrimEnd('%'),[Globalization.CultureInfo]::InvariantCulture)
      $memPercent=[double]::Parse($entry.MemPerc.TrimEnd('%'),[Globalization.CultureInfo]::InvariantCulture)
      $resources[$role].peakCpuPercent=[Math]::Max($resources[$role].peakCpuPercent,$cpuPercent)
      if($memPercent -ge $resources[$role].peakMemoryPercent){$resources[$role].peakMemoryPercent=$memPercent;$resources[$role].peakMemory=$entry.MemUsage}
      $resources[$role].blockIo=$entry.BlockIO;$resources[$role].networkIo=$entry.NetIO
    }
    $probe=Invoke-RecoveryDocker ($compose+@('exec','-T','api','node','--experimental-strip-types','load-tests/identity/watchdog.ts'))
    $free=(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
    $sample['host']=[ordered]@{freeRamBytes=([long]$free*1024)}
    # Muestras espaciadas; el costo CIM queda incluido en el ciclo del observador.
    if($resourceSamples%5 -eq 1){
      $probeStarted=$elapsed.Elapsed.TotalMilliseconds
      $sample.host['at']=[DateTime]::UtcNow.ToString('o')
      $sample.host['processor']=Get-CimInstance Win32_PerfFormattedData_Counters_ProcessorInformation | Where-Object Name -eq '_Total' | Select-Object ProcessorFrequency,PercentProcessorPerformance,PercentProcessorTime
      $sample.host['power']=@(Get-CimInstance -Namespace root/wmi -ClassName BatteryStatus | Select-Object PowerOnline,Discharging)
      $sample.host['samplingMs']=($elapsed.Elapsed.TotalMilliseconds-$probeStarted)
    }
    $oom=$false;foreach($container in ($containers+@($generator))){if((Invoke-RecoveryDocker @('inspect','--format','{{.State.OOMKilled}}',$container)).Trim() -eq 'true'){$oom=$true}}
    $observerProcess.Refresh()
    $sample['observer']=[ordered]@{cpuSinceWindowMs=($observerProcess.TotalProcessorTime.TotalMilliseconds-$observerCpuStart);workingSetBytes=$observerProcess.WorkingSet64;privateMemoryBytes=$observerProcess.PrivateMemorySize64;cycleElapsedMs=($elapsed.Elapsed.TotalMilliseconds-$cycleStart)}
    Add-Content -LiteralPath $statsFile -Value ($sample|ConvertTo-Json -Depth 7 -Compress) -Encoding utf8
    if($probe.Trim() -ne 'CONTINUE' -or $free -lt 262144 -or $oom){
      $null=Invoke-RecoveryDocker @('stop','--time','1',$generator);$metadata['stopReason']=if($oom){'OOM_KILLED'}elseif($free -lt 262144){'HOST_RAM_UNDER_256M'}else{$probe.Trim()};break
    }
  }
  $exitCode=[int](Invoke-RecoveryDocker @('inspect','--format','{{.State.ExitCode}}',$generator)).Trim()
  if((Invoke-RecoveryDocker @('inspect','--format','{{.State.OOMKilled}}',$generator)).Trim() -eq 'true'){$metadata['stopReason']='OOM_KILLED'}
}catch{$metadata['stopReason']='MONITOR_OR_DOCKER_FAILURE';throw}finally{
  $running=Invoke-RecoveryDocker @('ps','--filter',('name=^/'+$generator+'$'),'--format','{{.Names}}')
  if($running.Trim() -eq $generator){$null=Invoke-RecoveryDocker @('stop','--time','1',$generator)}
  $metadata.finishedAt=[DateTime]::UtcNow.ToString('o');$metadata['elapsedMonotonicMs']=$elapsed.Elapsed.TotalMilliseconds;$elapsed.Stop();$metadata.exitCode=$exitCode
  $metadata['resources']=$resources;$metadata['resourceSamples']=$resourceSamples
  $logs=Invoke-RecoveryDocker @('logs',$generator)
  [IO.File]::WriteAllText((Join-Path $context.directory ($name+'-generator.log')),$logs,[Text.UTF8Encoding]::new($false))
  $null=Invoke-RecoveryDocker ($compose+@('stop','--timeout','10','api'))
  $metadata['apiExitCode']=[int](Invoke-RecoveryDocker @('inspect','--format','{{.State.ExitCode}}',$containers[0])).Trim()
  $null=Invoke-RecoveryDocker ($compose+@('run','--rm','--no-deps','runner','-c',('node --experimental-strip-types load-tests/identity/snapshot.ts '+$name+'-after')))
  $null=Invoke-RecoveryDocker ($compose+@('run','--rm','--no-deps','runner','-c',('node --experimental-strip-types load-tests/identity/finalize.ts '+$name)))
  $metaPath=Join-Path $context.directory ($name+'-meta.json')
  [IO.File]::WriteAllText($metaPath,($metadata|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false))
  $null=Invoke-RecoveryDocker @('cp',$metaPath,($containers[0]+':/load-private/'+$name+'-meta.json'))
  $null=Invoke-RecoveryDocker ($compose+@('run','--rm','--no-deps','--user','root','runner','-c',('chown node:node /load-private/'+$name+'-meta.json')))
  $report=Invoke-RecoveryDocker ($compose+@('run','--rm','--no-deps','runner','-c',('node --experimental-strip-types load-tests/identity/summarize.mjs '+$name)))
  $report=($report -split "`n" | Where-Object {$_.TrimStart().StartsWith('{')} | Select-Object -Last 1)
  if(-not $report){throw 'Resumen ausente; no aceptar el ensayo.'}
  $null=$report | ConvertFrom-Json
  [IO.File]::WriteAllText((Join-Path $context.directory ($name+'-report.json')),$report,[Text.UTF8Encoding]::new($false))
  Write-Output $report
}
if($exitCode -ne 0 -or $metadata.Contains('stopReason')){throw 'Ensayo fallido: conservar evidencia y revisar el reporte privado.'}
