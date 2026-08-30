param(
  [Parameter(Mandatory = $true)]
  [string]$PreviousInstaller,

  [Parameter(Mandatory = $true)]
  [string]$UpdateInstaller
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'This destructive installer integration test is restricted to an ephemeral GitHub-hosted Actions runner.'
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class StableUpdateQaNative {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string className, string windowName);

  [DllImport("user32.dll")]
  public static extern IntPtr GetDlgItem(IntPtr dialog, int id);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr window);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr window, StringBuilder text, int maxCount);
}
'@

$qaRoot = Join-Path $env:RUNNER_TEMP 'stable-update-installer-qa'
$installDir = Join-Path $qaRoot 'Stable'
$baselineDir = Join-Path $qaRoot 'Stable-v0.9.31-baseline'
$dataDir = Join-Path $env:APPDATA 'stable-desktop'
$runtimeDir = Join-Path $env:LOCALAPPDATA 'stable-desktop\runtime-v1'
$desktopShortcut = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Stable.lnk'
$startMenuShortcut = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Stable.lnk'
$installRegistry = 'HKCU:\Software\6c45bb57-0127-5e38-a317-d6ca2794c2d8'
$uninstallRegistry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\6c45bb57-0127-5e38-a317-d6ca2794c2d8'

$PreviousInstaller = (Resolve-Path -LiteralPath $PreviousInstaller).Path
$UpdateInstaller = (Resolve-Path -LiteralPath $UpdateInstaller).Path

function Stop-QaProcesses {
  Get-Process -Name Stable -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      if ($_.Path -and $_.Path.StartsWith($qaRoot, [StringComparison]::OrdinalIgnoreCase)) {
        Stop-Process -Id $_.Id -Force
      }
    } catch {
      # A process can exit between enumeration and inspection.
    }
  }
}

function Reset-QaState {
  Stop-QaProcesses
  foreach ($path in @($qaRoot, $dataDir, $runtimeDir)) {
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Recurse -Force
    }
  }
  foreach ($path in @($desktopShortcut, $startMenuShortcut)) {
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Force
    }
  }
  foreach ($path in @($installRegistry, $uninstallRegistry)) {
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Recurse -Force
    }
  }
  New-Item -ItemType Directory -Path $qaRoot -Force | Out-Null
}

function Copy-Tree([string]$source, [string]$destination) {
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  & robocopy.exe $source $destination /E /COPY:DAT /DCOPY:DA /R:2 /W:1 /NFL /NDL /NJH /NJS | Out-Null
  $copyExitCode = $LASTEXITCODE
  if ($copyExitCode -ge 8) {
    throw "Robocopy failed with exit code $copyExitCode while copying '$source'."
  }
  $global:LASTEXITCODE = 0
}

function Invoke-Reg([string[]]$arguments) {
  & reg.exe @arguments | Out-Null
  $regExitCode = $LASTEXITCODE
  $global:LASTEXITCODE = 0
  if ($regExitCode -ne 0) {
    throw "reg.exe failed with exit code ${regExitCode}: $($arguments -join ' ')"
  }
}

function Wait-QaProcess($process, [int]$timeoutMs, [string]$description) {
  if (-not $process.WaitForExit($timeoutMs)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "$description timed out after $timeoutMs ms."
  }
  $process.Refresh()
  return $process.ExitCode
}

function Get-StableProductVersion([string]$executable) {
  $rawVersion = (Get-Item -LiteralPath $executable).VersionInfo.ProductVersion
  try {
    $parsedVersion = [Version]$rawVersion
  } catch {
    throw "Stable.exe has an invalid ProductVersion '$rawVersion'."
  }
  return "$($parsedVersion.Major).$($parsedVersion.Minor).$($parsedVersion.Build)"
}

function Get-EmbeddedRuntimeNode($baseline) {
  return (Join-Path (Split-Path -Parent $baseline.Exe) 'resources\runtime\node\node.exe')
}

function Assert-EmbeddedRuntimeReady($baseline, [string]$description) {
  $embeddedRuntimeNode = Get-EmbeddedRuntimeNode $baseline
  if (-not (Test-Path -LiteralPath $embeddedRuntimeNode)) {
    throw "$description left the v0.9.31 embedded runtime unavailable."
  }
  if (Test-Path -LiteralPath (Join-Path $runtimeDir 'node\node.exe')) {
    throw "$description unexpectedly left a migrated persistent runtime behind."
  }
}

function Assert-PersistentRuntimeReady([string]$description) {
  if (-not (Test-Path -LiteralPath (Join-Path $runtimeDir 'node\node.exe'))) {
    throw "$description did not prepare the persistent runtime."
  }
}

function Install-PreviousVersion {
  $arguments = @('/S', '/currentuser', "/D=$installDir")
  $process = Start-Process -FilePath $PreviousInstaller -ArgumentList $arguments -PassThru
  $exitCode = Wait-QaProcess $process 1800000 'Previous installer'
  if ($exitCode -ne 0) {
    throw "Previous installer failed with exit code $exitCode."
  }

  $exe = Join-Path $installDir 'Stable.exe'
  if (-not (Test-Path -LiteralPath $exe)) {
    throw 'Previous installer did not create Stable.exe.'
  }
  $version = Get-StableProductVersion $exe
  if ($version -ne '0.9.31') {
    throw "Previous installer produced unexpected version $version."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $installDir 'resources\runtime\node\node.exe'))) {
    throw 'Previous installer did not include its embedded Node runtime.'
  }

  Copy-Tree $installDir $baselineDir

  $installRegistryFile = Join-Path $qaRoot 'install-registry-v0.9.31.reg'
  $uninstallRegistryFile = Join-Path $qaRoot 'uninstall-registry-v0.9.31.reg'
  Invoke-Reg @('export', 'HKCU\Software\6c45bb57-0127-5e38-a317-d6ca2794c2d8', $installRegistryFile, '/y')
  Invoke-Reg @('export', 'HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\6c45bb57-0127-5e38-a317-d6ca2794c2d8', $uninstallRegistryFile, '/y')

  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
  $sentinel = Join-Path $dataDir 'update-qa-sentinel.txt'
  Set-Content -LiteralPath $sentinel -Value 'Stable update integration data' -Encoding utf8
  return [pscustomobject]@{
    Exe = $exe
    Sentinel = $sentinel
    SentinelHash = (Get-FileHash -LiteralPath $sentinel -Algorithm SHA256).Hash
    InstallRegistryFile = $installRegistryFile
    UninstallRegistryFile = $uninstallRegistryFile
  }
}

function Restore-PreviousVersion($baseline) {
  Stop-QaProcesses
  if (Test-Path -LiteralPath $installDir) {
    Remove-Item -LiteralPath $installDir -Recurse -Force
  }
  if (Test-Path -LiteralPath $runtimeDir) {
    Remove-Item -LiteralPath $runtimeDir -Recurse -Force
  }
  Copy-Tree $baselineDir $installDir
  foreach ($path in @($installRegistry, $uninstallRegistry)) {
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Recurse -Force
    }
  }
  Invoke-Reg @('import', $baseline.InstallRegistryFile)
  Invoke-Reg @('import', $baseline.UninstallRegistryFile)
  $version = Get-StableProductVersion $baseline.Exe
  if ($version -ne '0.9.31') {
    throw "Restored baseline has unexpected version $version."
  }
  $displayVersion = (Get-ItemProperty -LiteralPath $uninstallRegistry).DisplayVersion
  $registeredLocation = (Get-ItemProperty -LiteralPath $installRegistry).InstallLocation
  if ($displayVersion -ne '0.9.31' -or [IO.Path]::GetFullPath($registeredLocation) -ne [IO.Path]::GetFullPath($installDir)) {
    throw "Restored registry is inconsistent: version='$displayVersion', location='$registeredLocation'."
  }
  Assert-EmbeddedRuntimeReady $baseline 'Restored baseline'
  return $baseline
}

function Clear-ProgressFiles([string]$progressFile) {
  foreach ($path in @($progressFile, "$progressFile.log")) {
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Force
    }
  }
}

function Get-TerminalProgress([string]$progressFile) {
  $log = "$progressFile.log"
  if (-not (Test-Path -LiteralPath $log)) {
    return $null
  }
  return Get-Content -LiteralPath $log | Select-Object -Last 1
}

function Assert-VisibleInstallerWindow($process) {
  $process.Refresh()
  $mainWindow = $process.MainWindowHandle
  if ($mainWindow -eq [IntPtr]::Zero -or -not [StableUpdateQaNative]::IsWindowVisible($mainWindow)) {
    throw 'The update installer process has no visible main window.'
  }
  if ($process.MainWindowTitle -notlike 'Stable v0.9.33*') {
    throw "Unexpected installer window title '$($process.MainWindowTitle)'."
  }

  $page = [StableUpdateQaNative]::FindWindowEx($mainWindow, [IntPtr]::Zero, '#32770', $null)
  if ($page -eq [IntPtr]::Zero) {
    throw 'The update installer page is missing.'
  }

  $visibleProgressBar = [IntPtr]::Zero
  $after = [IntPtr]::Zero
  do {
    $after = [StableUpdateQaNative]::FindWindowEx($page, $after, 'msctls_progress32', $null)
    if ($after -ne [IntPtr]::Zero -and [StableUpdateQaNative]::IsWindowVisible($after)) {
      $visibleProgressBar = $after
      break
    }
  } while ($after -ne [IntPtr]::Zero)
  if ($visibleProgressBar -eq [IntPtr]::Zero) {
    throw 'The update installer has no visible progress bar.'
  }

  $statusControl = [StableUpdateQaNative]::GetDlgItem($page, 1006)
  $statusText = [Text.StringBuilder]::new(512)
  [void][StableUpdateQaNative]::GetWindowText($statusControl, $statusText, $statusText.Capacity)
  if ($statusText.ToString() -notmatch '\d+%') {
    throw "The visible installer status has no percentage: '$statusText'."
  }
}

function Wait-ForVisibleProgress($process, [string]$progressFile) {
  $deadline = [DateTime]::UtcNow.AddMinutes(2)
  do {
    Start-Sleep -Milliseconds 100
    $process.Refresh()
    if ($process.HasExited) {
      throw 'The visible installer exited before its progress UI could be inspected.'
    }
    if (Get-TerminalProgress $progressFile) {
      Assert-VisibleInstallerWindow $process
      return
    }
  } until ([DateTime]::UtcNow -ge $deadline)
  throw 'The visible installer did not report progress within two minutes.'
}

function Assert-MonotonicProgress([string]$progressFile, [string]$expectedTerminal) {
  $lines = @(Get-Content -LiteralPath "$progressFile.log")
  if ($lines.Count -eq 0) {
    throw 'The update installer did not report progress.'
  }
  $previous = -1
  foreach ($line in $lines) {
    $parts = $line -split '\|'
    $percent = [int]$parts[0]
    if ($percent -lt $previous) {
      throw "Progress moved backwards from $previous to $percent."
    }
    $previous = $percent
  }
  if ($lines[-1] -ne $expectedTerminal) {
    throw "Unexpected terminal progress '$($lines[-1])'; expected '$expectedTerminal'."
  }
}

function Assert-DataRetained($baseline) {
  if (-not (Test-Path -LiteralPath $baseline.Sentinel)) {
    throw 'User-data sentinel was removed.'
  }
  $actual = (Get-FileHash -LiteralPath $baseline.Sentinel -Algorithm SHA256).Hash
  if ($actual -ne $baseline.SentinelHash) {
    throw 'User-data sentinel changed during the update.'
  }
}

function Assert-NoAutomaticRestart {
  Start-Sleep -Seconds 2
  $running = @(Get-Process -Name Stable -ErrorAction SilentlyContinue | Where-Object {
    try { $_.Path -and $_.Path.StartsWith($qaRoot, [StringComparison]::OrdinalIgnoreCase) } catch { $false }
  })
  if ($running.Count -gt 0) {
    throw 'Stable restarted automatically after the installer finished.'
  }
}

function Invoke-Update([string]$progressFile, [bool]$quiet, [bool]$forceFailure) {
  Clear-ProgressFiles $progressFile
  $env:STABLE_UPDATE_PROGRESS_FILE = $progressFile
  $env:STABLE_UPDATE_QA_PROGRESS_DELAY_MS = '200'
  if ($forceFailure) {
    $env:STABLE_UPDATE_FORCE_HEALTHCHECK_FAILURE = '1'
  } else {
    Remove-Item Env:STABLE_UPDATE_FORCE_HEALTHCHECK_FAILURE -ErrorAction SilentlyContinue
  }

  $arguments = @('--updated', '/S', '--force-run')
  if ($quiet) {
    $arguments += '--stable-update-quiet'
  }
  return Start-Process -FilePath $UpdateInstaller -ArgumentList $arguments -PassThru
}

Reset-QaState
$successBaseline = Install-PreviousVersion
$successProgress = Join-Path $qaRoot 'success.status'
$successProcess = Invoke-Update $successProgress $false $false
Wait-ForVisibleProgress $successProcess $successProgress
$successExitCode = Wait-QaProcess $successProcess 300000 'Visible success update'
if ($successExitCode -ne 0) {
  throw "Visible success update exited with $successExitCode."
}
Assert-MonotonicProgress $successProgress '100|complete|success|0'
Assert-NoAutomaticRestart
Assert-DataRetained $successBaseline
Assert-PersistentRuntimeReady 'Successful update'
$successEmbeddedRuntime = Get-EmbeddedRuntimeNode $successBaseline
if (Test-Path -LiteralPath $successEmbeddedRuntime) {
  throw 'Successful update left the obsolete embedded runtime in the application directory.'
}

$successVersion = Get-StableProductVersion $successBaseline.Exe
if ($successVersion -ne '0.9.33') {
  throw "Success update produced unexpected version $successVersion."
}
if (-not (Test-Path -LiteralPath $desktopShortcut)) {
  throw 'The Stable desktop shortcut is missing after success.'
}
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($desktopShortcut)
if ([IO.Path]::GetFullPath($shortcut.TargetPath) -ne [IO.Path]::GetFullPath($successBaseline.Exe)) {
  throw "Desktop shortcut points to '$($shortcut.TargetPath)'."
}
$healthcheck = Start-Process -FilePath $successBaseline.Exe -ArgumentList '--stable-update-healthcheck' -PassThru
$healthcheckExitCode = Wait-QaProcess $healthcheck 120000 'Updated executable healthcheck'
if ($healthcheckExitCode -ne 0) {
  throw "The updated executable failed its healthcheck with $healthcheckExitCode."
}

$failureBaseline = Restore-PreviousVersion $successBaseline
$failureProgress = Join-Path $qaRoot 'failure-visible.status'
$failureProcess = Invoke-Update $failureProgress $false $true
$deadline = [DateTime]::UtcNow.AddMinutes(5)
do {
  Start-Sleep -Milliseconds 250
  $terminal = Get-TerminalProgress $failureProgress
  $failureProcess.Refresh()
  if ($failureProcess.HasExited -and $terminal -ne '92|healthcheck_rollback|failed_rolled_back|12') {
    throw "Visible failure update exited before reporting rollback; terminal='$terminal'."
  }
} until ($terminal -eq '92|healthcheck_rollback|failed_rolled_back|12' -or [DateTime]::UtcNow -ge $deadline)

if ($terminal -ne '92|healthcheck_rollback|failed_rolled_back|12') {
  Stop-Process -Id $failureProcess.Id -Force -ErrorAction SilentlyContinue
  throw "Visible failure update did not finish rollback; terminal='$terminal'."
}
Start-Sleep -Seconds 2
$failureProcess.Refresh()
if ($failureProcess.HasExited) {
  throw 'Visible failure installer closed automatically instead of keeping the rollback result open.'
}
Assert-VisibleInstallerWindow $failureProcess
Stop-Process -Id $failureProcess.Id -Force
Assert-MonotonicProgress $failureProgress '92|healthcheck_rollback|failed_rolled_back|12'
Assert-NoAutomaticRestart
Assert-DataRetained $failureBaseline
Assert-EmbeddedRuntimeReady $failureBaseline 'Visible rollback'

$restoredVersion = Get-StableProductVersion $failureBaseline.Exe
if ($restoredVersion -ne '0.9.31') {
  throw "Rollback restored unexpected version $restoredVersion."
}
Remove-Item Env:STABLE_UPDATE_FORCE_HEALTHCHECK_FAILURE -ErrorAction SilentlyContinue
$rollbackHealthcheck = Start-Process -FilePath $failureBaseline.Exe -ArgumentList '--stable-update-healthcheck' -PassThru
$rollbackHealthcheckExitCode = Wait-QaProcess $rollbackHealthcheck 120000 'Restored executable healthcheck'
if ($rollbackHealthcheckExitCode -ne 0) {
  throw "The restored executable failed its healthcheck with $rollbackHealthcheckExitCode."
}

$quietFailureProgress = Join-Path $qaRoot 'failure-quiet.status'
$quietFailureProcess = Invoke-Update $quietFailureProgress $true $true
$quietFailureExitCode = Wait-QaProcess $quietFailureProcess 300000 'Quiet rollback update'
if ($quietFailureExitCode -ne 12) {
  throw "Quiet rollback update exited with $quietFailureExitCode, expected 12."
}
Assert-MonotonicProgress $quietFailureProgress '92|healthcheck_rollback|failed_rolled_back|12'
Assert-NoAutomaticRestart
Assert-DataRetained $failureBaseline
$quietRestoredVersion = Get-StableProductVersion $failureBaseline.Exe
if ($quietRestoredVersion -ne '0.9.31') {
  throw "Quiet rollback restored unexpected version $quietRestoredVersion."
}
Assert-EmbeddedRuntimeReady $failureBaseline 'Quiet rollback'
Remove-Item Env:STABLE_UPDATE_FORCE_HEALTHCHECK_FAILURE -ErrorAction SilentlyContinue
$quietRollbackHealthcheck = Start-Process -FilePath $failureBaseline.Exe -ArgumentList '--stable-update-healthcheck' -PassThru
$quietRollbackHealthcheckExitCode = Wait-QaProcess $quietRollbackHealthcheck 120000 'Quiet rollback executable healthcheck'
if ($quietRollbackHealthcheckExitCode -ne 0) {
  throw "The quiet-rollback executable failed its healthcheck with $quietRollbackHealthcheckExitCode."
}

Remove-Item Env:STABLE_UPDATE_PROGRESS_FILE -ErrorAction SilentlyContinue
Remove-Item Env:STABLE_UPDATE_QA_PROGRESS_DELAY_MS -ErrorAction SilentlyContinue
Remove-Item Env:STABLE_UPDATE_FORCE_HEALTHCHECK_FAILURE -ErrorAction SilentlyContinue

[pscustomobject]@{
  SuccessVersion = $successVersion
  SuccessTerminal = Get-TerminalProgress $successProgress
  SuccessAutoRestarted = $false
  ShortcutTarget = $shortcut.TargetPath
  RollbackVersion = $restoredVersion
  VisibleFailureStayedOpen = $true
  RollbackTerminal = Get-TerminalProgress $failureProgress
  QuietFailureExitCode = $quietFailureExitCode
  UserDataRetained = $true
  RuntimeReady = Test-Path -LiteralPath (Get-EmbeddedRuntimeNode $failureBaseline)
  RuntimeLocation = 'embedded after rollback'
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $qaRoot 'result.json') -Encoding utf8

Get-Content -LiteralPath (Join-Path $qaRoot 'result.json')
