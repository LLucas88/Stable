$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$version = '7.6.6'
$expectedHash = '02FE458BE20493FBDF43F61EA20610B811EE6C738AB1676C61B9CFCD1A33C860'
$releaseUrl = "https://github.com/PowerShell/PowerShell/releases/download/v$version/PowerShell-$version-win-x64.zip"
$destination = Join-Path $projectRoot 'runtime\powershell'
$executable = Join-Path $destination 'pwsh.exe'
if (Test-Path -LiteralPath $destination) {
    if (-not (Test-Path -LiteralPath $executable)) { throw "Existing PowerShell runtime is incomplete: $destination" }
    $installedVersion = & $executable -NoLogo -NoProfile -NonInteractive -Command '$PSVersionTable.PSVersion.ToString()'
    if ($LASTEXITCODE -ne 0 -or "$installedVersion".Trim() -ne $version) { throw "Existing PowerShell runtime differs from $version; preserve it before replacing: $destination" }
    Write-Output "PowerShell $version already installed: $executable"
    exit 0
}
$staging = Join-Path $projectRoot ('.local\powershell-install-' + [guid]::NewGuid().ToString('N'))
$archive = Join-Path $staging "PowerShell-$version-win-x64.zip"
$expanded = Join-Path $staging 'expanded'
New-Item -ItemType Directory -Path $staging -Force | Out-Null
Invoke-WebRequest -Uri $releaseUrl -OutFile $archive -UseBasicParsing
$actualHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash
if ($actualHash -ne $expectedHash) { throw 'PowerShell archive SHA256 does not match the official release.' }
Expand-Archive -LiteralPath $archive -DestinationPath $expanded
$stagedExecutable = Join-Path $expanded 'pwsh.exe'
$signature = Get-AuthenticodeSignature -LiteralPath $stagedExecutable
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') { throw 'PowerShell executable does not have a valid Microsoft signature.' }
$stagedVersion = & $stagedExecutable -NoLogo -NoProfile -NonInteractive -Command '$PSVersionTable.PSVersion.ToString()'
if ($LASTEXITCODE -ne 0 -or "$stagedVersion".Trim() -ne $version) { throw 'Extracted PowerShell failed its version check.' }
$manifest = @{ version = $version; platform = 'win-x64'; source = $releaseUrl; archiveSha256 = $actualHash; executableSha256 = (Get-FileHash -LiteralPath $stagedExecutable -Algorithm SHA256).Hash; publisher = $signature.SignerCertificate.Subject }
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $expanded 'stable-runtime.json') -Encoding UTF8
$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'runtime'))
$resolvedDestination = [IO.Path]::GetFullPath($destination)
$resolvedStaging = [IO.Path]::GetFullPath($expanded)
if ($resolvedDestination -ne (Join-Path $runtimeRoot 'powershell') -or -not $resolvedStaging.StartsWith(([IO.Path]::GetFullPath($staging) + [IO.Path]::DirectorySeparatorChar))) { throw 'Unexpected PowerShell runtime destination.' }
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
Move-Item -LiteralPath $expanded -Destination $resolvedDestination
Write-Output "PowerShell $version installed and verified: $executable"
