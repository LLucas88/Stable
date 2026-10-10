param([string]$OutputDirectory = 'deliverables\model-setup-20260927')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$output = [IO.Path]::GetFullPath((Join-Path $repo $OutputDirectory))
New-Item -ItemType Directory -Force -Path $output | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /utf8output /codepage:65001 /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Security.dll "/out:$output\Stable-Config-Builder.exe" (Join-Path $repo 'tools\model-setup\StableModelSetup.cs')
if ($LASTEXITCODE -ne 0) { throw 'Config builder compilation failed' }
Get-Item -LiteralPath (Join-Path $output 'Stable-Config-Builder.exe') | Select-Object FullName, Length
