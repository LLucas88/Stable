$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot 'runtime'
$outputPath = Join-Path $projectRoot 'stable-runtime-win-x64.zip'
$nodePath = Join-Path $runtimeRoot 'node\node.exe'

if (-not (Test-Path -LiteralPath $nodePath)) {
  throw 'runtime/ is incomplete; node.exe is required.'
}
if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath }
Compress-Archive -Path (Join-Path $runtimeRoot 'node') -DestinationPath $outputPath -CompressionLevel Optimal
Write-Output $outputPath
