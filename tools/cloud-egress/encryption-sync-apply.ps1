param([ValidatePattern('^[a-f0-9-]{36}$')][string]$RunId,[switch]$Recover)
$ErrorActionPreference='Stop'
$root='C:\stable-cloud\egress-sync';$dir=Join-Path $root $RunId
$plan=Get-Content -LiteralPath "$dir\plan.json" -Raw | ConvertFrom-Json
$id=$plan.id
if($id -notin @('primary','backup') -or $plan.runId -ne $RunId){exit 1}
$file=if($id -eq 'primary'){'C:\stable-cloud\egress\config.json'}else{'C:\stable-cloud\egress-ha\backup.json'}
$task=if($id -eq 'primary'){'Stable-Cloud-OpenAI-Egress'}else{'Stable-Cloud-OpenAI-Backup'}
$port=if($id -eq 'primary'){10818}else{10828}
$before="$dir\before.json";$next="$dir\candidate.json";$changed=$false;$stopped=$false;$stage='validate'
function Assert-Idle {
 $h=Invoke-RestMethod http://127.0.0.1:10819/health -TimeoutSec 3
 $n=@($h.nodes|Where-Object {$_.id -eq $id})
 if($n.Count -ne 1 -or $n[0].healthy -or $n[0].status -eq 401 -or $h.active -eq $id){throw 'NOT_REPLACEABLE'}
 if(Get-NetTCPConnection -LocalPort $port -State Established -ErrorAction SilentlyContinue){throw 'CONNECTION_ACTIVE'}
}
function Wait-Healthy {
 $started=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();$good=0;$last=0
 for($i=0;$i -lt 110;$i++){
  Start-Sleep -Seconds 1
  $h=Invoke-RestMethod http://127.0.0.1:10819/health -TimeoutSec 3;$n=$h.nodes|Where-Object {$_.id -eq $id}
  if($n.checkedAt -gt $started -and $n.checkedAt -ne $last){$last=$n.checkedAt;if($n.status -eq 401){$good++}else{$good=0}}
  if($good -ge 3 -and $n.healthy){return}
 }
 throw 'LIVE_QUALIFICATION_FAILED'
}
function Stop-Exit {
 Stop-ScheduledTask -TaskName $task
 for($i=0;$i -lt 5;$i++){if(!(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)){return};Start-Sleep -Seconds 1}
 throw 'LISTENER_STILL_RUNNING'
}
if($Recover){
 try{
  & C:\stable-cloud\runtime\node.exe "$root\encryption-sync.cjs" verify-plan-recovery "$dir\plan.json" *> $null
  if($LASTEXITCODE -ne 0){throw 'RECOVERY_PLAN_INVALID'}
  $liveHash=(Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant()
  if($liveHash -eq $plan.beforeHash){
   if((Get-ScheduledTask -TaskName $task).State -ne 'Running'){Start-ScheduledTask -TaskName $task}
   [IO.File]::WriteAllText("$dir\journal.json",'{"status":"recovered_previous"}');exit 0
  }
  if($liveHash -ne $plan.nextHash){throw 'RECOVERY_CONFLICT'}
  if((Get-ScheduledTask -TaskName $task).State -ne 'Running'){Start-ScheduledTask -TaskName $task}
  try{Wait-Healthy;[IO.File]::WriteAllText("$dir\journal.json",'{"status":"committed_after_recovery","goodChecks":3}');exit 0}catch{}
  Assert-Idle
  Stop-Exit
  if((Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() -ne $plan.nextHash){throw 'RECOVERY_CONFLICT'}
  Copy-Item -LiteralPath $before -Destination "$file.sync-tmp"
  [IO.File]::Replace("$file.sync-tmp",$file,"$dir\recovery-replaced.json");Start-ScheduledTask -TaskName $task
  [IO.File]::WriteAllText("$dir\journal.json",'{"status":"recovered_previous"}');exit 0
 }catch{exit 1}
}
try{
 & C:\stable-cloud\runtime\node.exe "$root\encryption-sync.cjs" verify-plan "$dir\plan.json" *> $null
 if($LASTEXITCODE -ne 0){throw 'PLAN_INVALID'}
 for($i=0;$i -lt 3;$i++){Assert-Idle;Start-Sleep -Seconds 1}
 if((Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() -ne $plan.beforeHash){throw 'CONCURRENT_CHANGE'}
 Copy-Item -LiteralPath $file -Destination $before
 [IO.File]::WriteAllText("$dir\journal.json",'{"status":"applying"}')
 Assert-Idle
 $stage='stop';$stopped=$true;Stop-Exit
 if((Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() -ne $plan.beforeHash){throw 'CONCURRENT_CHANGE'}
 $stage='replace';Copy-Item -LiteralPath $next -Destination "$file.sync-tmp"
 [IO.File]::Replace("$file.sync-tmp",$file,"$dir\atomic-before.json");$changed=$true
 $stage='start';Start-ScheduledTask -TaskName $task
 $stage='verify'
 Wait-Healthy
 [IO.File]::WriteAllText("$dir\journal.json",'{"status":"committed","goodChecks":3}')
 exit 0
}catch{
 $reason=if($_.Exception.Message -cmatch '^[A-Z_]{3,60}$'){$_.Exception.Message}else{'OPERATION_FAILED'}
 $errorType=$_.Exception.GetType().Name
 try{
  if($changed){
   # Never overwrite an unrelated concurrent maintenance change.
   if((Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() -ne $plan.nextHash){throw 'ROLLBACK_CONFLICT'}
   # A candidate may have recovered and accepted a user request while checks
   # were running. Defer rollback instead of killing that user's connection.
   try{Assert-Idle}catch{[IO.File]::WriteAllText("$dir\journal.json",'{"status":"applying","reason":"rollback_deferred_busy"}');exit 1}
   Stop-Exit
   if((Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() -ne $plan.nextHash){throw 'ROLLBACK_CONFLICT'}
   Copy-Item -LiteralPath $before -Destination "$file.sync-tmp"
   [IO.File]::Replace("$file.sync-tmp",$file,"$dir\rollback-replaced.json")
  }
  if($stopped){Start-ScheduledTask -TaskName $task}
  [IO.File]::WriteAllText("$dir\journal.json",(@{status='failed_or_rolled_back';stage=$stage;reason=$reason;errorType=$errorType}|ConvertTo-Json -Compress))
 }catch{[IO.File]::WriteAllText("$dir\journal.json",'{"status":"manual_recovery_required"}')}
 exit 1
}
