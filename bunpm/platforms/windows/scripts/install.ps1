param([switch]$NoPath)
$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:USERPROFILE '.bunpm'
$binDir = Join-Path $installDir 'bin'
if (Test-Path -LiteralPath $installDir) { throw 'bunpm: install: existing .bunpm found; run uninstall.ps1 before reinstalling.' }
foreach ($tool in @('node', 'bun')) {
    & $tool --version
    if ($LASTEXITCODE -ne 0) { throw "bunpm: install: $tool not found; install it separately before running bunpm setup." }
}
$sourceRoot = Split-Path -Parent $PSScriptRoot
$coreRoot = $sourceRoot
if (-not (Test-Path -LiteralPath (Join-Path $coreRoot 'core'))) {
    $coreRoot = Split-Path -Parent (Split-Path -Parent $sourceRoot)
}
foreach ($required in @((Join-Path $coreRoot 'core'), (Join-Path $sourceRoot 'bin'), (Join-Path $PSScriptRoot 'uninstall.ps1'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "bunpm: install: missing installation source: $required" }
}
try {
    New-Item -ItemType Directory -Path $installDir | Out-Null
    Copy-Item -LiteralPath (Join-Path $coreRoot 'core') -Destination $installDir -Recurse
    Copy-Item -LiteralPath (Join-Path $sourceRoot 'bin') -Destination $installDir -Recurse
    Copy-Item -LiteralPath $PSScriptRoot -Destination (Join-Path $installDir 'scripts') -Recurse
    Copy-Item -LiteralPath (Join-Path $coreRoot 'package.json') -Destination $installDir
    if (-not $NoPath) {
        . (Join-Path $PSScriptRoot 'path.ps1')
        $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')
        try { Update-BunpmPath -Key $key -BinDir $binDir } finally { $key.Dispose() }
    }
} catch {
    if (Test-Path -LiteralPath $installDir) { Remove-Item -LiteralPath $installDir -Recurse -Force }
    throw
}
Write-Host 'bunpm installed. Restart your terminal. Only User PATH was eligible for modification.'
Write-Host 'System PATH can take precedence; prepend the printed bin path in your session if needed:'
Write-Host $binDir
