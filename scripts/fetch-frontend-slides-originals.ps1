$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$assetRoot = Join-Path $repoRoot 'desktop\assets\frontend-slides\originals'
$entries = Get-Content -LiteralPath (Join-Path $repoRoot 'desktop\assets\frontend-slides\upstream-samples.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $assetRoot | Out-Null
$downloads = foreach ($entry in $entries) {
  [PSCustomObject]@{ Uri = "https://raw.githubusercontent.com/zarazhangrui/beautiful-html-templates/main/templates/$($entry.slug)/template.html"; Destination = Join-Path $assetRoot "$($entry.slug).html" }
  foreach ($url in $entry.images) { [PSCustomObject]@{ Uri = $url; Destination = Join-Path $assetRoot ([System.IO.Path]::GetFileName(([Uri]$url).AbsolutePath)) } }
}
$downloads += [PSCustomObject]@{ Uri = 'https://raw.githubusercontent.com/zarazhangrui/beautiful-html-templates/main/runtime/deck-stage.js'; Destination = Join-Path $assetRoot 'deck-stage.js' }
$downloads += [PSCustomObject]@{ Uri = 'https://raw.githubusercontent.com/zarazhangrui/beautiful-html-templates/main/LICENSE'; Destination = Join-Path $assetRoot 'LICENSE' }
$downloads | ForEach-Object -Parallel {
  $ErrorActionPreference = 'Stop'
  if (!(Test-Path -LiteralPath $_.Destination)) { Invoke-WebRequest -Uri $_.Uri -OutFile $_.Destination -TimeoutSec 60 }
  $file = Get-Item -LiteralPath $_.Destination
  if ($file.Length -eq 0) { throw "Empty upstream resource: $($_.Destination)" }
} -ThrottleLimit 6
Write-Output "Downloaded $($downloads.Count) original resources."
