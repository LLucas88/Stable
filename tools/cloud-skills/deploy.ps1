param([switch]$Apply)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root='C:\stable-cloud'
if(!(Test-Path -LiteralPath "$root\config\runtime.dpapi")){throw 'Not the Stable Cloud server'}
$plan=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'deployment.json') -Raw | ConvertFrom-Json
$caddy="$root\https\Caddyfile"
$candidate=Join-Path $PSScriptRoot 'Caddyfile.skills'
if((Get-FileHash -LiteralPath $caddy -Algorithm SHA256).Hash.ToLowerInvariant() -ne $plan.caddyBeforeSha256){throw 'Live Caddy configuration changed; review again'}
foreach($entry in $plan.files.PSObject.Properties){
  if($entry.Name -match '[\\:]|(^|/)\.\.(/|$)' -or $entry.Name.StartsWith('/')){throw 'Unsafe deployment path'}
  $file=Join-Path $PSScriptRoot $entry.Name
  if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.Value){throw ('Deployment hash mismatch: '+$entry.Name)}
}
if((Get-PSDrive C).Free -lt 1GB){throw 'Insufficient free disk'}
if(Get-ScheduledTask -TaskName Stable-Cloud-Skills -ErrorAction SilentlyContinue){throw 'Skills service already exists; use a reviewed upgrade'}
if(Get-NetTCPConnection -State Listen -LocalPort 18882 -ErrorAction SilentlyContinue){throw 'Port 18882 is occupied'}
& "$root\https\caddy.exe" validate --config $candidate --adapter caddyfile
if($LASTEXITCODE -ne 0){throw 'Candidate Caddy configuration invalid'}
if((Invoke-WebRequest 'http://127.0.0.1:18880/api/health' -UseBasicParsing -TimeoutSec 10).StatusCode -ne 200){throw 'Gateway unhealthy'}
Write-Output 'SKILL_DEPLOY_PREFLIGHT_PASS'
if(!$Apply){return}
$release="$root\skills\releases\$($plan.release)"
if(Test-Path -LiteralPath $release){throw 'Release already exists'}
New-Item -ItemType Directory -Path $release -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'packages') -Destination $release -Recurse
foreach($name in @('catalog.json','server.cjs','deployment.json','Caddyfile.skills','run.ps1','rollback.ps1')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $release}
Copy-Item -LiteralPath $caddy -Destination (Join-Path $release 'Caddyfile.before')
& icacls.exe $release /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-19:(OI)(CI)RX' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Private resource ACL failed'}
$logDir="$root\skills\logs"
New-Item -ItemType Directory -Force $logDir | Out-Null
& icacls.exe $logDir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Log ACL failed'}
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$release+'\run.ps1"') -WorkingDirectory $release
$principal=New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
try{
  Register-ScheduledTask -TaskName Stable-Cloud-Skills -Action $action -Principal $principal -Settings $settings -Trigger (New-ScheduledTaskTrigger -AtStartup) | Out-Null
  Start-ScheduledTask -TaskName Stable-Cloud-Skills
  $ready=$false
  for($attempt=0;$attempt -lt 20;$attempt++){
    Start-Sleep -Seconds 1
    try{Invoke-WebRequest 'http://127.0.0.1:18882/api/skills/catalog' -UseBasicParsing -TimeoutSec 2 | Out-Null}catch{if($_.Exception.Response.StatusCode.value__ -eq 401){$ready=$true;break}}
  }
  if(!$ready){throw 'Private download service not ready'}
  Copy-Item -LiteralPath $candidate -Destination $caddy -Force
  & "$root\https\caddy.exe" reload --config $caddy --adapter caddyfile
  if($LASTEXITCODE -ne 0){throw 'Caddy reload failed'}
  if((Invoke-WebRequest 'http://127.0.0.1:18880/api/health' -UseBasicParsing -TimeoutSec 10).StatusCode -ne 200){throw 'Gateway health check failed'}
  Write-Output ('SKILL_SERVICE_DEPLOYED='+$release)
}catch{
  & (Join-Path $release 'rollback.ps1')
  throw
}
