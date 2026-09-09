param([switch]$NoPath)
$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:USERPROFILE '.bunpm'
$binDir = Join-Path $installDir 'bin'
if (-not $NoPath) {
    . (Join-Path $PSScriptRoot 'path.ps1')
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
    if ($null -ne $key) {
        try { Update-BunpmPath -Key $key -BinDir $binDir -Remove } finally { $key.Dispose() }
    }
}
if (Test-Path -LiteralPath $installDir) { Remove-Item -LiteralPath $installDir -Recurse -Force }
Write-Host 'bunpm removed. Restart your terminal. Original managers and Bun were not removed.'
