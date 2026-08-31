param(
  [ValidateRange(1, 65535)]
  [int]$Port = 5900,
  [string]$Password = ''
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$CliEntry = Join-Path $ProjectRoot 'dist-cli\index.js'

if (-not (Test-Path -LiteralPath $CliEntry -PathType Leaf)) {
  throw 'Built CLI not found. Run .\scripts\install-windows.ps1 first.'
}

$Arguments = @($CliEntry, '--port', "$Port", '--no-open', '--no-tunnel')
if ($Password) {
  $Arguments += @('--password', $Password)
}

Set-Location -LiteralPath $ProjectRoot
& node @Arguments
exit $LASTEXITCODE
