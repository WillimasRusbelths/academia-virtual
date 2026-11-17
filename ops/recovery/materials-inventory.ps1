# Requires common.ps1. Output contains only references, counts and complete hashes.
function Get-RecoveryMaterialsInventory([string]$Container,[string]$Database,[string]$Schema) {
  if ($Schema -notmatch '^[a-z][a-z0-9_]{0,62}$') { throw 'Schema de materiales invalido.' }
  $remoteSql = '/tmp/materials-inventory-' + [guid]::NewGuid().ToString('N') + '.sql'
  try {
    $null = Invoke-RecoveryDocker @('cp',(Join-Path $PSScriptRoot 'materials-inventory.sql'),($Container + ':' + $remoteSql))
    $text = Invoke-RecoveryDocker @('exec','--user','postgres',$Container,'psql','--no-psqlrc','--quiet','--tuples-only','--no-align','--username','postgres','--no-password','--dbname',$Database,'--set','ON_ERROR_STOP=1','--set',('schema='+$Schema),'--file',$remoteSql)
    $inventory = $text | ConvertFrom-Json
    if ($inventory.format -ne 'materials-inventory-v1' -or $inventory.schema -ne $Schema -or
      -not $inventory.allContentHashesVerified -or $inventory.materialCount -ne $inventory.contentCount -or
      @($inventory.items).Count -ne $inventory.materialCount) { throw 'Inventario de materiales inconsistente.' }
    foreach ($item in $inventory.items) {
      if ($item.bytesSha256 -notmatch '^[a-f0-9]{64}$' -or $item.bytesSha256 -ne $item.storedSha256 -or
        $item.metadataSha256 -notmatch '^[a-f0-9]{64}$') { throw 'Hash de material invalido.' }
    }
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { $digest = ([BitConverter]::ToString($algorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($text.Trim())))).Replace('-','').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
    return [pscustomobject]@{inventory=$inventory;sha256=$digest}
  # docker cp creates this SQL file as root; /tmp is sticky, so postgres cannot remove it.
  } finally { $null = Invoke-RecoveryDocker @('exec','--user','0',$Container,'rm','-f','--',$remoteSql) }
}
