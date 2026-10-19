. (Join-Path $PSScriptRoot '../../ops/recovery/common.ps1')
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$project='identity-load-'+[guid]::NewGuid().ToString('N').Substring(0,12)
$directory=Join-Path $repo ('.cache/'+$project)
$null=New-Item -ItemType Directory -Path $directory
$acl=Get-Acl -LiteralPath $directory
$acl.SetAccessRuleProtection($true,$false)
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule([Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
Set-Acl -LiteralPath $directory -AclObject $acl
$lines=foreach($name in @('POSTGRES_PASSWORD','PROBE_OWNER_PASSWORD','PROBE_RUNTIME_PASSWORD','TEST_MAIL_PAYLOAD_KEY','TEST_RATE_HMAC_KEY')){
  $format=if($name.EndsWith('KEY')){'base64'}else{'base64url'}
  $value=& node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString(process.argv[1]))" $format
  if($LASTEXITCODE -ne 0){throw 'No se generaron secretos.'};$name+'='+$value
}
$envFile=Join-Path $directory 'private.env'
[IO.File]::WriteAllLines($envFile,$lines,[Text.UTF8Encoding]::new($false))
$composeFile=Join-Path $PSScriptRoot 'compose.yml'
$compose=@('compose','--project-name',$project,'--env-file',$envFile,'-f',$composeFile)
$null=Invoke-RecoveryDocker ($compose+@('up','-d','--wait','db','mailpit'))
$null=Invoke-RecoveryDocker ($compose+@('run','--rm','--no-deps','--user','root','runner','-c','mkdir -p /load-private/fixtures && chown -R node:node /load-private && chmod 700 /load-private /load-private/fixtures'))
$null=Invoke-RecoveryDocker ($compose+@('run','--rm','--no-deps','runner','-c','npm run build --workspace apps/api && npm run db:migrate:deploy --workspace apps/api'))
$context=[ordered]@{project=$project;directory=$directory;envFile=$envFile;composeFile=$composeFile}
$contextFile=Join-Path $directory 'context.json'
[IO.File]::WriteAllText($contextFile,($context|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
Write-Output ('Contexto aislado preparado: '+$contextFile)
