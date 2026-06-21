# uninstall.ps1 - bunpm full cleanup/restore script
# Removes wrapper files, cleans User PATH entry.
# Does NOT require admin/elevated privileges.
# Original npm is never touched - removing our PATH entry restores it automatically.

$ErrorActionPreference = "Stop"

# --- Configuration ---
$installDir = Join-Path $env:USERPROFILE ".bunpm"
$binDir     = Join-Path $installDir "bin"

# --- Helper: colored output ---
function Write-Success { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn    { param([string]$msg) Write-Host "  ! $msg" -ForegroundColor Yellow }
function Write-Err     { param([string]$msg) Write-Host "  [ERR] $msg" -ForegroundColor Red }
function Write-Info    { param([string]$msg) Write-Host "  -> $msg" -ForegroundColor Cyan }

Write-Host ""
Write-Host "  bunpm uninstaller" -ForegroundColor White
Write-Host "  ---" -ForegroundColor DarkGray
Write-Host ""

# --- Step 1: Check if installed ---
try {
    if (-not (Test-Path $installDir)) {
        Write-Warn "bunpm is not installed (folder $installDir not found)"
        Write-Host ""
        exit 0
    }
} catch {
    Write-Err "Failed to check installation: $($_.Exception.Message)"
    exit 1
}

# --- Step 2: Remove from User PATH ---
try {
    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($currentPath) {
        # Split, filter out our entry, rejoin
        $entries = $currentPath -split ';' | Where-Object { $_ -ne $binDir -and $_ -ne "" }
        $newPath = $entries -join ';'
        [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        Write-Success "Removed $binDir from User PATH"
    } else {
        Write-Warn "User PATH is empty - nothing to remove"
    }
} catch {
    Write-Err "Failed to update User PATH: $($_.Exception.Message)"
    Write-Info "You may need to manually remove $binDir from your PATH."
}

# --- Step 3: Delete installation folder ---
try {
    Remove-Item -Path $installDir -Recurse -Force
    Write-Success "Deleted $installDir"
} catch {
    Write-Err "Failed to delete $installDir : $($_.Exception.Message)"
    Write-Info "Try closing any terminals using bunpm, then run this script again."
    exit 1
}

# --- Step 4: Refresh current session PATH ---
try {
    # Remove our bin dir from the current session PATH
    $sessionEntries = $env:PATH -split ';' | Where-Object { $_ -ne $binDir -and $_ -ne "" }
    $env:PATH = $sessionEntries -join ';'
    Write-Success "Refreshed current session PATH"
} catch {
    Write-Warn "Could not refresh session PATH. Restart your terminal."
}

# --- Step 5: Print success summary ---
Write-Host ""
Write-Host "  ---" -ForegroundColor DarkGray
Write-Host ""
Write-Success "bunpm uninstalled"
Write-Success "Original npm restored"
Write-Host ""
Write-Info "Restart your terminal for changes to take full effect."
Write-Host ""
