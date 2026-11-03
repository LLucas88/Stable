$ErrorActionPreference='Stop'
$env:STABLE_SKILL_ROOT=$PSScriptRoot
& 'C:\stable-cloud\runtime\node.exe' (Join-Path $PSScriptRoot 'server.cjs') >> 'C:\stable-cloud\skills\logs\service.log' 2>&1
exit $LASTEXITCODE
