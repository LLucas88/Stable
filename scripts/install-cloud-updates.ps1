$ErrorActionPreference = 'Stop'
$root = 'C:\stable-cloud\updates'
$caddy = 'C:\stable-cloud\https\caddy.exe'
$config = 'C:\stable-cloud\https\Caddyfile'
if (Get-ScheduledTask -TaskName Stable-Cloud-Updates -ErrorAction SilentlyContinue) { throw 'Update task already exists; inspect before changing it.' }
if (Test-Path -LiteralPath $root) { throw 'Update directory already exists; inspect before changing it.' }
New-Item -ItemType Directory -Path "$root\ops", "$root\public" | Out-Null
& tar.exe -xzf C:\stable-cloud\staging\cloud-update-service.tar.gz -C "$root\ops"
if ($LASTEXITCODE -ne 0) { throw 'Extraction failed' }
& icacls.exe $root /grant '*S-1-5-19:(OI)(CI)M' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Update service ACL failed' }
$runner = @'
$ErrorActionPreference='Stop'
$log='C:\stable-cloud\updates\sync.log'
if ((Test-Path $log) -and (Get-Item $log).Length -gt 5MB) { Move-Item -LiteralPath $log -Destination ($log+'.previous') -Force }
& C:\stable-cloud\runtime\node.exe C:\stable-cloud\updates\ops\sync-cloud-updates.cjs C:\stable-cloud\updates *>> $log
exit $LASTEXITCODE
'@
[IO.File]::WriteAllText("$root\ops\run.ps1", $runner)
$original = [IO.File]::ReadAllText($config)
if ($original -match '/updates/' -or $original -notmatch '    reverse_proxy 127.0.0.1:18880') { throw 'Unexpected Caddy configuration' }
$route = @'
    handle_path /updates/* {
        root * C:/stable-cloud/updates/public
        @manifest path /latest.yml
        header @manifest Cache-Control "no-store"
        header X-Content-Type-Options nosniff
        file_server
    }
    handle {
    reverse_proxy 127.0.0.1:18880
'@
$candidate = $original.Replace('    reverse_proxy 127.0.0.1:18880', $route.TrimEnd())
$last = $candidate.LastIndexOf('}')
$candidate = $candidate.Insert($last, "    }`r`n")
$pending = "$root\Caddyfile.pending"
[IO.File]::WriteAllText($pending, $candidate)
& $caddy validate --config $pending --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'Caddy validation failed' }
Copy-Item -LiteralPath $config -Destination "$root\Caddyfile.before"
try {
  Copy-Item -LiteralPath $pending -Destination $config -Force
  & $caddy reload --config $config --adapter caddyfile
  if ($LASTEXITCODE -ne 0) { throw 'Caddy reload failed' }
  if ((Invoke-WebRequest http://127.0.0.1:18880/api/health -UseBasicParsing -TimeoutSec 10).StatusCode -ne 200) { throw 'Gateway health failed' }
  $action = New-ScheduledTaskAction -Execute powershell.exe -Argument '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\stable-cloud\updates\ops\run.ps1' -WorkingDirectory "$root\ops"
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
  $principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\LOCAL SERVICE' -LogonType ServiceAccount
  $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
  Register-ScheduledTask -TaskName Stable-Cloud-Updates -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
  Start-ScheduledTask -TaskName Stable-Cloud-Updates
  'CLOUD_UPDATE_SERVICE_INSTALLED'
} catch {
  Copy-Item -LiteralPath "$root\Caddyfile.before" -Destination $config -Force
  & $caddy reload --config $config --adapter caddyfile
  throw
}
