$ErrorActionPreference='Stop'
$root='C:\stable-cloud\egress-sync';$name='Stable-Cloud-Egress-Parameter-Sync'
if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){throw 'Existing maintenance task; inspect before replacing'}
if(!(Test-Path -LiteralPath "$root\policy.json")){throw 'Pinned policy required'}
foreach($file in @('encryption-sync.cjs','encryption-sync-apply.ps1','encryption-sync-run.ps1')){
 if(!(Test-Path -LiteralPath "$root\$file")){throw 'Missing maintenance source'}
}
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -NonInteractive -WindowStyle Hidden -File C:\stable-cloud\egress-sync\encryption-sync-run.ps1' -WorkingDirectory $root
$repeat=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(10) -RepetitionInterval (New-TimeSpan -Minutes 10)
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 8) -StartWhenAvailable -MultipleInstances IgnoreNew
$principal=New-ScheduledTaskPrincipal -UserId SYSTEM -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $name -InputObject (New-ScheduledTask -Action $action -Trigger @((New-ScheduledTaskTrigger -AtStartup),$repeat) -Settings $settings -Principal $principal) | Out-Null
Start-ScheduledTask -TaskName $name
'PARAMETER_SYNC_TASK_INSTALLED=OK'
