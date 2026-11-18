param([ValidateRange(1,2)][int]$BackupCount=1)
$ErrorActionPreference='Stop'
$root='C:\stable-cloud\egress-ha'
$report=Get-Content -LiteralPath "$root\candidate-report.json" -Raw | ConvertFrom-Json
if(@($report.selected).Count -lt 1 -or @($report.selected).Count -gt 2){throw 'Expected one or two verified backup candidates'}
$backups=@($report.selected|Select-Object -First $BackupCount)
if($backups.Count -ne $BackupCount){throw 'Requested backup count exceeds verified candidates'}
$tasks=@('Stable-Cloud-OpenAI-Backup','Stable-Cloud-OpenAI-Router')
$ports=@(10828,10819)
if($backups.Count -eq 2){$tasks+='Stable-Cloud-OpenAI-Backup-2';$ports+=10829}
foreach($name in $tasks){if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){throw 'Task already exists; inspect before updating'}}
foreach($port in $ports){if(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue){throw 'HA port already in use'}}
Copy-Item -LiteralPath 'C:\stable-cloud\egress\xray.exe' -Destination "$root\xray.exe"
if((Get-FileHash "$root\xray.exe").Hash -ne (Get-FileHash 'C:\stable-cloud\egress\xray.exe').Hash){throw 'Proxy binary mismatch'}
$nodes=@([PSCustomObject]@{id='primary';port=10818})
$seenHosts=@($report.primaryHostHash)
for($index=0;$index -lt $backups.Count;$index++){
$selected=$backups[$index]
$id=if($index -eq 0){'backup'}else{'backup-2'}
$expected=Join-Path $root ('candidate-'+$selected.nodeHash+'.json')
if([IO.Path]::GetFullPath($selected.file) -ne [IO.Path]::GetFullPath($expected)){throw 'Unexpected candidate file'}
if($selected.hostHash -in $seenHosts){throw 'Backup must use a different server address'}
$seenHosts+=$selected.hostHash
if(!(@($report.reports|Where-Object {$_.nodeHash -eq $selected.nodeHash -and $_.reachable -eq $true -and $_.openaiTls -eq 'verified'}).Count)){throw 'Missing successful TLS verification'}
$config=Get-Content -LiteralPath $expected -Raw | ConvertFrom-Json
if($config.inbounds.Count -ne 1 -or $config.inbounds[0].listen -ne '127.0.0.1' -or $config.outbounds.Count -ne 2 -or $config.outbounds[1].protocol -ne 'blackhole'){throw 'Unexpected candidate scope'}
if($config.outbounds[0].streamSettings.security -notin @('tls','reality') -or $config.outbounds[0].streamSettings.tlsSettings.allowInsecure){throw 'TLS/REALITY verification is required'}
if($config.routing.rules[0].domain[0] -ne 'full:api.openai.com' -or $config.routing.rules[1].outboundTag -ne 'block'){throw 'Only OpenAI traffic is allowed'}
$config.inbounds[0].port=10828+$index;$config.log.loglevel='none'
[IO.File]::WriteAllText("$root\$id.json",($config|ConvertTo-Json -Depth 40),[Text.UTF8Encoding]::new($false))
& "$root\xray.exe" run -test -c "$root\$id.json" *> "$root\$id-validation.log"
if($LASTEXITCODE -ne 0){throw 'Backup config invalid'}
$nodes+=[PSCustomObject]@{id=$id;port=(10828+$index)}
}
[IO.File]::WriteAllText("$root\router.json",(@{port=10819;nodes=$nodes}|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 999 -StartWhenAvailable -MultipleInstances IgnoreNew
$principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$created=@()
try{
 for($index=0;$index -lt $backups.Count;$index++){
  $id=if($index -eq 0){'backup'}else{'backup-2'}
  $name=if($index -eq 0){'Stable-Cloud-OpenAI-Backup'}else{'Stable-Cloud-OpenAI-Backup-2'}
  $backupAction=New-ScheduledTaskAction -Execute "$root\xray.exe" -Argument ('run -c "'+$root+'\'+$id+'.json"') -WorkingDirectory $root
  Register-ScheduledTask -TaskName $name -InputObject (New-ScheduledTask -Action $backupAction -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $settings -Principal $principal) | Out-Null
  $created+=$name;Start-ScheduledTask -TaskName $name
 }
 for($index=0;$index -lt $backups.Count;$index++){
  $listening=$false
  for($attempt=0;$attempt -lt 10;$attempt++){
   if(Get-NetTCPConnection -LocalPort (10828+$index) -State Listen -ErrorAction SilentlyContinue){$listening=$true;break}
   Start-Sleep -Seconds 1
  }
  if(!$listening){throw 'Backup process did not open its loopback listener'}
 }
 $routerAction=New-ScheduledTaskAction -Execute 'C:\stable-cloud\runtime\node.exe' -Argument ('"'+$root+'\router.cjs" "'+$root+'\router.json"') -WorkingDirectory $root
 Register-ScheduledTask -TaskName Stable-Cloud-OpenAI-Router -InputObject (New-ScheduledTask -Action $routerAction -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $settings -Principal $principal) | Out-Null
 $created+='Stable-Cloud-OpenAI-Router';Start-ScheduledTask -TaskName Stable-Cloud-OpenAI-Router
 $healthy=$false
 for($i=0;$i -lt 50;$i++){Start-Sleep -Seconds 2;try{$h=Invoke-RestMethod 'http://127.0.0.1:10819/health' -TimeoutSec 2;if($h.status -eq 'healthy'){$healthy=$true;break};if($i % 10 -eq 0){$h|ConvertTo-Json -Depth 8 -Compress}}catch{}}
 if(!$healthy -or @($h.nodes).Count -ne $nodes.Count){throw 'All exits did not become healthy; live gateway remains unchanged'}
 foreach($port in $ports){if((Get-NetTCPConnection -LocalPort $port -State Listen).LocalAddress -ne '127.0.0.1'){throw 'HA listener must stay on loopback'}}
 $h|ConvertTo-Json -Depth 8|Set-Content -LiteralPath "$root\installation-health.json" -Encoding UTF8
 'HA_EXITS_INSTALLED=OK';$h|ConvertTo-Json -Depth 8
}catch{
 foreach($name in $created){Stop-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue;Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue}
 throw
}
