$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if ($PSVersionTable.PSVersion.Major -lt 6) {
    $env:PSModulePath = [Environment]::GetEnvironmentVariable('PSModulePath', 'Machine')
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$version = '24.14.0'
$expectedHash = '313fa40c0d7b18575821de8cb17483031fe07d95de5994f6f435f3b345f85c66'
$destination = Join-Path $projectRoot 'runtime\node'
$executable = Join-Path $destination 'node.exe'
if (Test-Path -LiteralPath $destination) {
    if (-not (Test-Path -LiteralPath $executable) -or -not (Test-Path -LiteralPath (Join-Path $destination 'LICENSE'))) { throw 'Existing Node runtime is incomplete; preserve it before replacing.' }
    $installedVersion = & $executable -p 'process.versions.node'
    if ($LASTEXITCODE -ne 0 -or "$installedVersion".Trim() -ne $version) { throw 'Existing Node version differs; preserve it before replacing.' }
    Write-Output "Node $version already installed with LICENSE."
    exit 0
}
$staging = Join-Path $projectRoot ('.local\node-install-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging -Force | Out-Null
$archive = Join-Path $staging 'node.zip'
Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$version/node-v$version-win-x64.zip" -OutFile $archive
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Node archive SHA256 mismatch.' }
Expand-Archive -LiteralPath $archive -DestinationPath $staging
$expanded = Join-Path $staging "node-v$version-win-x64"
if (-not (Test-Path -LiteralPath (Join-Path $expanded 'LICENSE'))) { throw 'Official Node archive is missing LICENSE.' }
$stagedVersion = & (Join-Path $expanded 'node.exe') -p 'process.versions.node'
if ($LASTEXITCODE -ne 0 -or "$stagedVersion".Trim() -ne $version) { throw 'Extracted Node failed version verification.' }
New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
$prepared = Join-Path $staging 'prepared'
New-Item -ItemType Directory -Path $prepared -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $expanded 'node.exe'), (Join-Path $expanded 'LICENSE') -Destination $prepared
$resolvedDestination = [IO.Path]::GetFullPath($destination)
$resolvedPrepared = [IO.Path]::GetFullPath($prepared)
if ($resolvedDestination -ne (Join-Path $projectRoot 'runtime\node') -or -not $resolvedPrepared.StartsWith(([IO.Path]::GetFullPath($staging) + [IO.Path]::DirectorySeparatorChar))) { throw 'Unexpected Node runtime destination.' }
Move-Item -LiteralPath $resolvedPrepared -Destination $resolvedDestination
Write-Output "Node $version installed with verified SHA256 and LICENSE."
