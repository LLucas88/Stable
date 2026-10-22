param([string]$StableExe)
$ErrorActionPreference='Stop'
$env:STABLE_CLOUD_ENABLED='1'
$env:STABLE_CLOUD_URL='https://116.62.83.85'
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
if(-not $StableExe){throw 'Provide the full path to Stable.exe with -StableExe.'}
$exe=(Resolve-Path -LiteralPath $StableExe).Path
if([IO.Path]::GetFileName($exe) -ne 'Stable.exe'){throw 'Select the installed Stable.exe'}
Start-Process -FilePath $exe -WorkingDirectory ([IO.Path]::GetDirectoryName($exe)) -WindowStyle Hidden
'PUBLIC_HTTPS_CLIENT_STARTED'
