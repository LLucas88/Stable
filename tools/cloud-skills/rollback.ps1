$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$caddy='C:\stable-cloud\https\Caddyfile'
$plan=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'deployment.json') -Raw | ConvertFrom-Json
$hash=(Get-FileHash -LiteralPath $caddy -Algorithm SHA256).Hash.ToLowerInvariant()
if($hash -ne $plan.caddyBeforeSha256 -and $hash -ne $plan.files.'Caddyfile.skills'){throw 'Caddy changed since deployment; refusing to overwrite unrelated changes'}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Caddyfile.before') -Destination $caddy -Force
& 'C:\stable-cloud\https\caddy.exe' reload --config $caddy --adapter caddyfile
if($LASTEXITCODE -ne 0){throw 'Caddy restore failed; leave service running for inspection'}
Stop-ScheduledTask -TaskName Stable-Cloud-Skills -ErrorAction SilentlyContinue
foreach($listener in @(Get-NetTCPConnection -LocalPort 18882 -State Listen -ErrorAction SilentlyContinue)){
  $process=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listener.OwningProcess)
  if(!$process.CommandLine.Contains((Join-Path $PSScriptRoot 'server.cjs'))){throw 'Unexpected process on skill port; not stopped'}
  Stop-Process -Id $listener.OwningProcess
}
Unregister-ScheduledTask -TaskName Stable-Cloud-Skills -Confirm:$false -ErrorAction SilentlyContinue
Write-Output 'SKILL_SERVICE_ROLLED_BACK; private resource files retained'
