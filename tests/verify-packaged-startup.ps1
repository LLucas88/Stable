param([Parameter(Mandatory=$true)][string]$PackageDirectory)
$ErrorActionPreference = 'Stop'
$PackageDirectory = (Resolve-Path -LiteralPath $PackageDirectory).Path
$qa = Join-Path $env:TEMP ('stable-packaged-startup-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $qa | Out-Null
# A sibling of the repository could resolve its node_modules. Use the OS temp
# directory, no NODE_PATH, and the real packaged executable instead of Electron.
& robocopy.exe $PackageDirectory $qa /E /XD resources /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -gt 7) { throw 'Failed to copy packaged executable' }
New-Item -ItemType Directory -Path (Join-Path $qa 'resources') | Out-Null
Copy-Item -LiteralPath (Join-Path $PackageDirectory 'resources\app.asar') -Destination (Join-Path $qa 'resources\app.asar')
$unpacked = Join-Path $PackageDirectory 'resources\app.asar.unpacked'
if (Test-Path -LiteralPath $unpacked) { Copy-Item -LiteralPath $unpacked -Destination (Join-Path $qa 'resources\app.asar.unpacked') -Recurse }
Remove-Item Env:ELECTRON_RUN_AS_NODE,Env:NODE_PATH -ErrorAction SilentlyContinue
$env:STABLE_QA_USER_DATA = Join-Path $qa 'profile'
$env:STABLE_STARTUP_PROBE = Join-Path $qa 'probe.json'
$process = Start-Process -FilePath (Join-Path $qa 'Stable.exe') -WorkingDirectory $qa -WindowStyle Hidden -PassThru
if (!$process.WaitForExit(25000)) { Stop-Process -Id $process.Id; throw "Packaged startup timed out: $qa" }
if ($process.ExitCode -ne 0) { throw "Packaged startup exited $($process.ExitCode): $qa" }
$result = Get-Content -LiteralPath $env:STABLE_STARTUP_PROBE -Raw | ConvertFrom-Json
if ($result.status -ne 'ready' -or !$result.renderer) { throw "Packaged startup failed: $qa" }
$result | ConvertTo-Json -Depth 5
