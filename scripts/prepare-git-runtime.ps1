$ErrorActionPreference = 'Stop'
# pwsh may pass its module paths into Windows PowerShell through npm.
if ($PSVersionTable.PSVersion.Major -lt 6) {
    $env:PSModulePath = [Environment]::GetEnvironmentVariable('PSModulePath', 'Machine')
}
$projectRoot = Split-Path -Parent $PSScriptRoot
$gitRoot = Join-Path $projectRoot 'runtime\git'
$version = '2.56.0.3'
$url = 'https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.3/PortableGit-2.56.0.3-64-bit.7z.exe'
$sha256 = '4fc27b779829a36df77911e3f4dea09c66c790dd6c5f7dfa3b6a5479f1fe354f'
if (!(Test-Path -LiteralPath (Join-Path $gitRoot 'bin\bash.exe'))) {
    $cacheRoot = Join-Path $projectRoot '.local\git-bash-2.56.0.3'
    New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
    $archive = Join-Path $cacheRoot 'PortableGit.7z.exe'
    if (!(Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri $url -OutFile $archive }
    # Windows PowerShell launched from pwsh can inherit an incompatible module path.
    # Hash directly with .NET so verification does not depend on module autoload.
    $archiveStream = [IO.File]::OpenRead($archive)
    $archiveHasher = [Security.Cryptography.SHA256]::Create()
    try { $archiveHash = [BitConverter]::ToString($archiveHasher.ComputeHash($archiveStream)).Replace('-', '').ToLowerInvariant() }
    finally { $archiveStream.Dispose(); $archiveHasher.Dispose() }
    if ($archiveHash -ne $sha256) { throw 'PortableGit archive checksum mismatch.' }
    $extract = Start-Process -FilePath $archive -ArgumentList @('-y', ('-o"' + $gitRoot + '"')) -WindowStyle Hidden -PassThru -Wait
    if ($extract.ExitCode -ne 0) { throw 'PortableGit extraction failed.' }
}
@{ version = $version; source = $url; archiveSha256 = $sha256; license = 'See runtime/git/LICENSE.txt and runtime/git/usr/share/licenses' } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $gitRoot 'stable-runtime.json') -Encoding utf8
node -e "console.log(require('./desktop/services/git-bash-runtime.cjs').verifyGitBash())"
if ($LASTEXITCODE -ne 0) { throw 'Bundled Git Bash validation failed.' }
