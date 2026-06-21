# install.ps1 - bunpm one-time setup script
# Installs bun (if needed), copies wrapper files, prepends to User PATH.
# Does NOT require admin/elevated privileges.

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
Write-Host "  bunpm installer" -ForegroundColor White
Write-Host "  ---" -ForegroundColor DarkGray
Write-Host ""

# --- Step 1: Check if already installed ---
try {
    if (Test-Path $installDir) {
        Write-Warn "bunpm is already installed at $installDir"
        Write-Info "To reinstall, run the uninstall script first:"
        Write-Info "  powershell -ExecutionPolicy Bypass -File scripts\uninstall.ps1"
        Write-Host ""
        exit 0
    }
} catch {
    Write-Err "Failed to check existing installation: $($_.Exception.Message)"
    exit 1
}

# --- Step 2: Check / install Bun ---
$bunAvailable = $false
try {
    $bunVersion = & bun --version 2>$null
    if ($LASTEXITCODE -eq 0 -and $bunVersion) {
        Write-Success "Bun v$bunVersion detected"
        $bunAvailable = $true
    }
} catch {
    # bun not found - will install below
}

if (-not $bunAvailable) {
    Write-Info "Bun not found. Installing Bun automatically..."
    try {
        # Use Bun's official Windows installer
        Invoke-RestMethod bun.sh/install.ps1 | Invoke-Expression

        # Refresh PATH in current session so bun is immediately usable
        $bunBinDir = Join-Path $env:USERPROFILE ".bun\bin"
        if (Test-Path $bunBinDir) {
            $env:PATH = "$bunBinDir;$env:PATH"
        }

        # Verify bun is now available
        $bunVersion = & bun --version 2>$null
        if ($LASTEXITCODE -eq 0 -and $bunVersion) {
            Write-Success "Bun v$bunVersion installed successfully"
            $bunAvailable = $true
        } else {
            throw "Bun installed but not responding"
        }
    } catch {
        Write-Err "Failed to install Bun automatically."
        Write-Err "Error: $($_.Exception.Message)"
        Write-Host ""
        Write-Info "Please install Bun manually from https://bun.sh"
        Write-Info "Then re-run this installer."
        Write-Host ""
        exit 1
    }
}

# --- Step 3: Check Node.js ---
try {
    $nodeVersion = & node --version 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $nodeVersion) {
        throw "Node.js not found"
    }
    Write-Success "Node.js $nodeVersion detected"
} catch {
    Write-Err "Node.js is required but was not found."
    Write-Info "Install Node.js from https://nodejs.org"
    Write-Host ""
    exit 1
}

# --- Step 4: Create installation directory ---
try {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
    Write-Success "Created $installDir"
} catch {
    Write-Err "Failed to create installation directory: $($_.Exception.Message)"
    exit 1
}

# --- Step 5: Copy project files ---
try {
    # Determine where the source project is (relative to this script)
    $scriptDir = if ($MyInvocation.MyCommand.Path) {
        Split-Path -Parent $MyInvocation.MyCommand.Path
    } else {
        Get-Location
    }
    $projectRoot = Split-Path -Parent $scriptDir

    # Copy core/ folder
    $coreSrc = Join-Path $projectRoot "core"
    $coreDst = Join-Path $installDir "core"
    if (Test-Path $coreSrc) {
        Copy-Item -Path $coreSrc -Destination $coreDst -Recurse -Force
    } else {
        throw "Source core/ folder not found at $coreSrc"
    }

    # Copy bin/ folder
    $binSrc = Join-Path $projectRoot "bin"
    if (Test-Path $binSrc) {
        Copy-Item -Path "$binSrc\*" -Destination $binDir -Recurse -Force
    } else {
        throw "Source bin/ folder not found at $binSrc"
    }

    # Copy package.json
    $pkgSrc = Join-Path $projectRoot "package.json"
    if (Test-Path $pkgSrc) {
        Copy-Item -Path $pkgSrc -Destination $installDir -Force
    }

    try {
        $scriptsSrc = Join-Path $projectRoot "scripts"
        $scriptsDst = Join-Path $installDir "scripts"
        if (Test-Path $scriptsSrc) {
            New-Item -ItemType Directory -Path $scriptsDst -Force | Out-Null
            Copy-Item -Path (Join-Path $scriptsSrc "*") -Destination $scriptsDst -Recurse -Force
            Write-Success "Copied scripts/ folder to $installDir"
        } else {
            Write-Warn "scripts/ folder not found at $scriptsSrc — uninstall.ps1 will not be available"
        }
    } catch {
        Write-Err "Failed to copy scripts/ folder: $($_.Exception.Message)"
    }

    Write-Success "Copied project files to $installDir"
} catch {
    Write-Err "Failed to copy project files: $($_.Exception.Message)"
    # Clean up partial install
    if (Test-Path $installDir) {
        Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

# --- Step 5b: Verify yarn/pnpm launchers were copied (NEW IN V2) ---
try {
    $yarnCmd = Join-Path $binDir "yarn.cmd"
    $pnpmCmd = Join-Path $binDir "pnpm.cmd"
    if (Test-Path $yarnCmd) {
        Write-Success "yarn launcher installed"
    } else {
        Write-Warn "yarn.cmd not found in $binDir — yarn command interception will not work"
    }
    if (Test-Path $pnpmCmd) {
        Write-Success "pnpm launcher installed"
    } else {
        Write-Warn "pnpm.cmd not found in $binDir — pnpm command interception will not work"
    }
} catch {
    Write-Warn "Could not verify yarn/pnpm launchers"
}

# --- Step 6: Prepend to User PATH ---
try {
    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if (-not $currentPath) { $currentPath = "" }

    # Only add if not already present
    if ($currentPath -notlike "*$binDir*") {
        # PREPEND - our bin must come FIRST so Windows finds it before original npm
        $newPath = "$binDir;$currentPath"
        [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        Write-Success "Added $binDir to User PATH (prepended)"
    } else {
        Write-Warn "$binDir is already in User PATH"
    }
} catch {
    Write-Err "Failed to update User PATH: $($_.Exception.Message)"
    Write-Info "You may need to manually add $binDir to your PATH."
}

# --- Step 7: Refresh current session PATH ---
try {
    # Make sure our bin dir is at the FRONT of the current session PATH too
    if ($env:PATH -notlike "*$binDir*") {
        $env:PATH = "$binDir;$env:PATH"
    }
    Write-Success "Refreshed current session PATH"
} catch {
    Write-Warn "Could not refresh session PATH. Restart your terminal."
}

# --- Step 8: Verify installation ---
try {
    # Quick sanity check - our npm.cmd should exist
    $npmCmd = Join-Path $binDir "npm.cmd"
    if (Test-Path $npmCmd) {
        Write-Success "Wrapper scripts verified"
    } else {
        Write-Warn "npm.cmd not found in $binDir - installation may be incomplete"
    }
} catch {
    Write-Warn "Could not verify installation"
}

# --- Step 9: Print success summary ---
Write-Host ""
Write-Host "  ---" -ForegroundColor DarkGray
Write-Host ""
Write-Success "bunpm installed successfully"
Write-Success "Bun v$bunVersion detected"
Write-Success "npm, npx, yarn, and pnpm commands will now run via Bun"
Write-Host ""
Write-Info "Restart your terminal for changes to take full effect."
Write-Info "Run 'npm --version' to verify."
Write-Host ""
