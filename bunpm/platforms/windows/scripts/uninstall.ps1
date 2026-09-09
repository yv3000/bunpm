param([switch]$NoPath)
$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:USERPROFILE '.bunpm'
$binDir = Join-Path $installDir 'bin'
if (-not $NoPath) {
    $current = [Environment]::GetEnvironmentVariable('PATH', 'User')
    if ($null -ne $current) {
        $entries = @($current -split ';' | Where-Object { $_.Trim('"').TrimEnd('\') -ine $binDir })
        [Environment]::SetEnvironmentVariable('PATH', ($entries -join ';'), 'User')
    }
}
if (Test-Path -LiteralPath $installDir) { Remove-Item -LiteralPath $installDir -Recurse -Force }
Write-Host 'bunpm removed. Restart your terminal. Original managers and Bun were not removed.'
