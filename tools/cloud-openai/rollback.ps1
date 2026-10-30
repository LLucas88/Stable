param([switch]$ValidateOnly)
$ErrorActionPreference='Stop'
$root='C:\stable-cloud'
$current="$root\current"
$previous="$root\openai-previous-20261029"
if((Get-Item -LiteralPath $current).Target -ne "$root\releases\20261029-openai"){throw 'Unexpected current release'}
if((Get-Item -LiteralPath $previous).Target -ne "$root\releases\20261027-cloud-tools"){throw 'Unexpected previous release'}
if(!(Test-Path -LiteralPath "$PSScriptRoot\disable-models.cjs")){throw 'Missing admission gate'}
if($ValidateOnly){'ROLLBACK_PATHS_VALID=OK';exit 0}
& "$root\runtime\node.exe" "$PSScriptRoot\disable-models.cjs" "$root\data\stable.db"
if($LASTEXITCODE -ne 0){throw 'Could not disable new model admission'}
& "$root\runtime\node.exe" "$root\staging\check-idle.cjs"
if($LASTEXITCODE -ne 0){throw 'Wait for active requests; new GPT admission remains disabled'}
$retained='openai-retained-'+(Get-Date -Format yyyyMMdd-HHmmss)
try {
 Disable-ScheduledTask -TaskName Stable-Cloud-Gateway | Out-Null
 Stop-ScheduledTask -TaskName Stable-Cloud-Gateway
 Start-Sleep -Seconds 2
 foreach($listener in @(Get-NetTCPConnection -LocalPort 18880 -State Listen -ErrorAction SilentlyContinue)){
  $p=Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  if($p.ExecutablePath -ne "$root\runtime\node.exe" -or $p.CommandLine -notmatch 'vinext'){throw 'Unexpected listener'}
  Stop-Process -Id $listener.OwningProcess -Force
 }
 Rename-Item -LiteralPath $current -NewName $retained
 try {Rename-Item -LiteralPath $previous -NewName 'current'} catch {Rename-Item -LiteralPath "$root\$retained" -NewName 'current';throw}
} finally {Enable-ScheduledTask -TaskName Stable-Cloud-Gateway | Out-Null; Start-ScheduledTask -TaskName Stable-Cloud-Gateway}
for($i=0;$i -lt 25;$i++){
 Start-Sleep -Seconds 1
 try {if((Invoke-WebRequest http://127.0.0.1:18880/api/health -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200){'ROLLBACK_HEALTHY=OK';exit 0}} catch {}
}
throw 'Rollback service health failed; inspect service.log. No database backup was restored.'
