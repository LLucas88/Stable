$ErrorActionPreference='Stop'
$root='C:\stable-cloud\updates'
$caddy='C:\stable-cloud\https\caddy.exe'
$config='C:\stable-cloud\https\Caddyfile'
if(Get-ScheduledTask -TaskName Stable-Cloud-Update-Publish -ErrorAction SilentlyContinue){throw 'Receiver already installed'}
Disable-ScheduledTask -TaskName Stable-Cloud-Updates | Out-Null
Stop-ScheduledTask -TaskName Stable-Cloud-Updates
Start-Sleep -Seconds 1
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {$_.CommandLine -like '*updates\ops\sync-cloud-updates.cjs*'} | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue}
Remove-Item -LiteralPath "$root\sync.lock" -ErrorAction SilentlyContinue
Copy-Item C:\stable-cloud\staging\cloud-update-receiver.cjs "$root\ops\cloud-update-receiver.cjs"
Move-Item -LiteralPath C:\stable-cloud\staging\update-publish-token -Destination "$root\publish-token"
& icacls.exe "$root\publish-token" /inheritance:r /grant:r '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' '*S-1-5-19:(R)' | Out-Null
if($LASTEXITCODE -ne 0){throw 'Token ACL failed'}
$action=New-ScheduledTaskAction -Execute C:\stable-cloud\runtime\node.exe -Argument 'C:\stable-cloud\updates\ops\cloud-update-receiver.cjs C:\stable-cloud\updates' -WorkingDirectory "$root\ops"
$trigger=New-ScheduledTaskTrigger -AtStartup
$principal=New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\LOCAL SERVICE' -LogonType ServiceAccount
$settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName Stable-Cloud-Update-Publish -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Start-ScheduledTask -TaskName Stable-Cloud-Update-Publish
Start-Sleep -Seconds 2
if(-not(Get-NetTCPConnection -LocalPort 18881 -State Listen -ErrorAction SilentlyContinue)){throw 'Receiver failed to start'}
$original=[IO.File]::ReadAllText($config)
$start=$original.IndexOf('    handle_path /updates/* {')
$end=$original.IndexOf("    handle {",$start)
if($start -lt 0 -or $end -lt 0){throw 'Unexpected Caddy config'}
$route=@'
    handle_path /updates/* {
        handle /_publish/* {
            reverse_proxy 127.0.0.1:18881
        }
        handle {
            root * C:/stable-cloud/updates/public
            @manifest path /latest.yml
            header @manifest Cache-Control "no-store"
            header X-Content-Type-Options nosniff
            file_server
        }
    }
'@
$candidate=$original.Substring(0,$start)+$route+"`r`n"+$original.Substring($end)
$pending="$root\Caddyfile.receiver"
[IO.File]::WriteAllText($pending,$candidate)
& $caddy validate --config $pending --adapter caddyfile
if($LASTEXITCODE -ne 0){throw 'Caddy validation failed'}
Copy-Item $config "$root\Caddyfile.before-receiver"
try{
 Copy-Item $pending $config -Force
 & $caddy reload --config $config --adapter caddyfile
 if($LASTEXITCODE -ne 0){throw 'Caddy reload failed'}
 if((Invoke-WebRequest http://127.0.0.1:18880/api/health -UseBasicParsing -TimeoutSec 10).StatusCode -ne 200){throw 'Gateway unhealthy'}
 'CLOUD_RECEIVER_READY'
}catch{
 Copy-Item "$root\Caddyfile.before-receiver" $config -Force
 & $caddy reload --config $config --adapter caddyfile
 throw
}
