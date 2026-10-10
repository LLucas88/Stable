param([switch]$InstallComponent)
$ErrorActionPreference = 'Stop'
$env:WSL_UTF8 = '1'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$repo = Split-Path -Parent $PSScriptRoot
$wsl = Join-Path $env:SystemRoot 'System32\wsl.exe'
if ($InstallComponent) {
    # This phase requires an administrator PowerShell. No automatic reboot.
    & $wsl --install --no-distribution
    if ($LASTEXITCODE -ne 0) { throw 'WSL component installation failed.' }
    Write-Host 'If Windows requests a restart, restart and run npm run sandbox:setup again.'
    exit 0
}
function Invoke-Linux([string[]]$LinuxArgs) {
    & $wsl --distribution StableAgent --user root --exec @LinuxArgs
    if ($LASTEXITCODE -ne 0) { throw "StableAgent setup failed (exit $LASTEXITCODE)." }
}
$distros = (& $wsl --list --quiet 2>$null) -replace "`0", ''
if ($LASTEXITCODE -ne 0) { throw 'Install WSL2 first: administrator PowerShell: wsl --install --no-distribution; restart Windows, then rerun this script.' }
if ('StableAgent' -notin @($distros | ForEach-Object { $_.Trim() })) {
    & $wsl --install Ubuntu-24.04 --name StableAgent --no-launch --web-download
    if ($LASTEXITCODE -ne 0) { throw 'Could not install the dedicated StableAgent distribution.' }
    # wsl --install also returns 0 when Windows must reboot before creation.
    $installed = (& $wsl --list --quiet 2>$null) -replace "`0", ''
    if ($LASTEXITCODE -ne 0 -or 'StableAgent' -notin @($installed | ForEach-Object { $_.Trim() })) {
        throw 'StableAgent was not created. Restart Windows to apply WSL2/Virtual Machine Platform changes, then rerun npm run sandbox:setup. No command sandbox is ready yet.'
    }
    Invoke-Linux @('/usr/bin/touch', '/etc/stable-agent-managed')
} else {
    & $wsl --distribution StableAgent --user root --exec /usr/bin/test -f /etc/stable-agent-managed
    if ($LASTEXITCODE -ne 0) { throw 'StableAgent already exists but is not managed by Stable. Refusing to change its user or interop configuration.' }
}
# Do not convert or terminate any user-owned distribution.
$kernel = (& $wsl --distribution StableAgent --user root --exec /usr/bin/uname -r) -join ''
if ($LASTEXITCODE -ne 0) { throw 'Could not start StableAgent to verify its kernel.' }
# WSL 3 can reject --set-version 2 while an already-v2 VM is running.
if ($kernel -notmatch '(?i)microsoft.*WSL2') {
    & $wsl --set-version StableAgent 2
    if ($LASTEXITCODE -ne 0) { throw 'StableAgent requires WSL2; a Windows restart or firmware virtualization setting may be needed.' }
    $kernel = (& $wsl --distribution StableAgent --user root --exec /usr/bin/uname -r) -join ''
    if ($LASTEXITCODE -ne 0 -or $kernel -notmatch '(?i)microsoft.*WSL2') { throw 'StableAgent did not start with a WSL2 kernel.' }
}
$source = Join-Path $repo 'vendor\wsl-agent'
if (-not (Test-Path -LiteralPath $source)) { $source = Join-Path $repo 'wsl-agent' }
$linuxSource = (& $wsl --distribution StableAgent --user root --exec /usr/bin/wslpath -a -u $source).Trim()
if ($LASTEXITCODE -ne 0 -or -not $linuxSource.StartsWith('/mnt/')) { throw 'Could not resolve the runtime source inside WSL.' }
$linuxSetup = (& $wsl --distribution StableAgent --user root --exec /usr/bin/wslpath -a -u (Join-Path $PSScriptRoot 'setup-wsl-sandbox.sh')).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the setup script inside WSL.' }
Invoke-Linux @('/bin/bash', $linuxSetup, $linuxSource)
& $wsl --terminate StableAgent
if ($LASTEXITCODE -ne 0) { throw 'Could not restart StableAgent to apply its interop policy.' }
& $wsl --distribution StableAgent --user stable --exec /opt/stable-agent/node/bin/node /opt/stable-agent/runner.cjs --check
if ($LASTEXITCODE -ne 0) { throw 'WSL sandbox preflight failed; commands remain disabled.' }
Write-Host 'StableAgent is configured. Run npm run test:wsl-integration for real sandbox acceptance.'
