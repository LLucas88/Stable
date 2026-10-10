param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$testRoot = Split-Path -Parent $PSScriptRoot
$testData = Join-Path $env:APPDATA 'stable-desktop'
$testRuntime = Join-Path $testRoot 'node_modules\@anthropic-ai\claude-agent-sdk-win32-x64\claude.exe'
$testElectron = Join-Path $testRoot 'node_modules\electron\dist\electron.exe'
foreach ($testPath in @($testElectron, $testRuntime, (Join-Path $testData 'stable.db'))) {
    if (!(Test-Path -LiteralPath $testPath)) { throw "Missing required file: $testPath" }
}
Push-Location $testRoot
try {
    & node scripts/verify-builtin-tools.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Built-in tools verification failed.' }
    & $testRuntime --version
    if ($LASTEXITCODE -ne 0) { throw 'Claude runtime verification failed.' }
    Write-Host "Test source: $testRoot"
    Write-Host "Existing data: $testData"
    if ($CheckOnly) { Write-Host 'STARTUP_PREFLIGHT_PASSED'; return }
    if (Get-Process -Name Stable -ErrorAction SilentlyContinue) { throw 'Please completely exit Stable, including the system tray, before starting this test version.' }
    $testEnvNames = @('ELECTRON_RUN_AS_NODE','STABLE_QA_USER_DATA','STABLE_QA_CAPTURE','STABLE_HARNESS')
    $testSavedEnv = @{}
    foreach ($testName in $testEnvNames) { $testSavedEnv[$testName] = [Environment]::GetEnvironmentVariable($testName,'Process'); [Environment]::SetEnvironmentVariable($testName,$null,'Process') }
    try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
        # Installer backs up the existing database before registering bundled skills.
        & node scripts/install-filtered-skills.cjs --user-data $testData
        if ($LASTEXITCODE -ne 0) { throw 'Skill registration failed; app was not started.' }
        & $testElectron . "--stable-user-data=$testData"
    } finally {
        foreach ($testName in $testEnvNames) { [Environment]::SetEnvironmentVariable($testName,$testSavedEnv[$testName],'Process') }
    }
} finally { Pop-Location }
