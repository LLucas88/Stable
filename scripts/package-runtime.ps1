$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot 'runtime'
$outputPath = Join-Path $projectRoot 'stable-runtime-win-x64.zip'
$nodePath = Join-Path $runtimeRoot 'node\node.exe'
$harnessPath = Join-Path $runtimeRoot 'dsh\node_modules\@deepseek-ai\dsh\lib\bin.js'

if (-not (Test-Path -LiteralPath $nodePath) -or -not (Test-Path -LiteralPath $harnessPath)) {
  throw 'runtime/ is incomplete; node.exe and the DeepSeek Harness entry are required.'
}
if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath }
Compress-Archive -Path (Join-Path $runtimeRoot '*') -DestinationPath $outputPath -CompressionLevel Optimal
Write-Output $outputPath
