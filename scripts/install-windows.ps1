$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $ProjectRoot

foreach ($CommandName in @('node', 'pnpm', 'codex')) {
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "Required command '$CommandName' was not found in PATH."
  }
}

Write-Host 'Checking prerequisites...'
& node --version
& pnpm --version
& codex --version

Write-Host 'Installing codex-ui dependencies...'
& pnpm install
if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed.' }

Write-Host 'Building codex-ui...'
& pnpm run build
if ($LASTEXITCODE -ne 0) { throw 'pnpm run build failed.' }

Write-Host "codex-ui is ready in $ProjectRoot"
Write-Host 'Start it with: .\scripts\start-windows.ps1'
