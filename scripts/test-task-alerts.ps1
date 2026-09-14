$ErrorActionPreference = 'Stop'
$testRoot = Split-Path -Parent $PSScriptRoot
Push-Location $testRoot
try {
    & npm.cmd run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed.' }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    $testFiles = @(
        'tests/approval-notification.test.cjs',
        'tests/approval-notification-decision.test.cjs',
        'tests/task-alerts.test.cjs',
        'tests/task-alerts-desktop.test.cjs',
        'tests/cloud-reasoning.test.cjs',
        'tests/model-reasoning.test.cjs',
        'tests/clarification-ipc.test.cjs',
        'tests/cloud-gateway-proxy.test.cjs',
        'tests/model-switching-ui.test.cjs',
        'tests/effort-alerts-ui.test.cjs',
        'tests/codex-surfaces-ui.test.cjs'
    )
    & node --test --test-concurrency=1 @testFiles
    if ($LASTEXITCODE -ne 0) { throw 'Regression tests failed. See the failing case above.' }
    Write-Host 'TASK_ALERTS_REGRESSION_PASSED (30 tests)'
} finally { Pop-Location }
