param([string]$InstallDirectory)

# Read-only: no downloads, registry changes, process termination or user-data reads.
$ErrorActionPreference = 'Stop'
$installRoots = @()
if ($InstallDirectory) { $installRoots += [IO.Path]::GetFullPath($InstallDirectory) }
$installKey = 'Software\6c45bb57-0127-5e38-a317-d6ca2794c2d8'
foreach ($hive in @('HKCU:', 'HKLM:')) {
  $entry = Get-ItemProperty -LiteralPath "$hive\$installKey" -ErrorAction SilentlyContinue
  if ($entry -and $entry.InstallLocation) { $installRoots += $entry.InstallLocation }
}
Get-Process -Name Stable -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_.Path) { $installRoots += Split-Path -Parent $_.Path }
}
$installRoots = @($installRoots | Select-Object -Unique)
$runtimeRoots = @()
if ($env:STABLE_DSH_RUNTIME) { $runtimeRoots += $env:STABLE_DSH_RUNTIME }
if ($env:STABLE_RUNTIME_HOME) { $runtimeRoots += $env:STABLE_RUNTIME_HOME }
$runtimeRoots += Join-Path $env:LOCALAPPDATA 'stable-desktop\runtime-v1'
if ($env:ProgramData) { $runtimeRoots += Join-Path $env:ProgramData 'stable-desktop\runtime-v1' }
foreach ($installRoot in $installRoots) { $runtimeRoots += Join-Path $installRoot 'resources\runtime' }
$runtimeRoots = @($runtimeRoots | Select-Object -Unique)

[pscustomobject]@{
  CheckedAt = (Get-Date).ToString('o')
  Installations = @($installRoots | ForEach-Object {
    $exe = Join-Path $_ 'Stable.exe'
    $item = Get-Item -LiteralPath $exe -ErrorAction SilentlyContinue
    [pscustomobject]@{ Directory = $_; ExecutableExists = [bool]$item; Version = if ($item) { $item.VersionInfo.ProductVersion } else { $null } }
  })
  Runtimes = @($runtimeRoots | ForEach-Object {
    $runtimeRoot = $_
    $files = @('node\node.exe', 'dsh\node_modules\@deepseek-ai\dsh\lib\bin.js', 'app\node_modules\@deepseek-ai\dsh\lib\bin.js')
    [pscustomobject]@{
      Directory = $runtimeRoot
      Files = @($files | ForEach-Object {
        $target = Join-Path $runtimeRoot $_
        $item = Get-Item -LiteralPath $target -ErrorAction SilentlyContinue
        [pscustomobject]@{ Path = $target; Exists = [bool]$item; Bytes = if ($item) { $item.Length } else { $null } }
      })
    }
  })
} | ConvertTo-Json -Depth 6
