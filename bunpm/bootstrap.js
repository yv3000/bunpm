// bootstrap.js - Step 1: Copy all project files to real Windows filesystem
const fs = require('fs');
const path = require('path');

const home = process.env.USERPROFILE;
const dest = path.join(home, 'bunpm');

// Create directories
const dirs = ['bin', 'lib', 'scripts'];
dirs.forEach(d => fs.mkdirSync(path.join(dest, d), { recursive: true }));

// Read from workspace and write to real FS
const base = __dirname;
const files = [
  'bin/npm.cmd', 'bin/npm', 'bin/npx.cmd', 'bin/npx',
  'lib/detector.js', 'lib/mapper.js', 'lib/formatter.js', 'lib/wrapper.js',
  'package.json'
];

files.forEach(f => {
  const src = path.join(base, f);
  const dst = path.join(dest, f);
  fs.copyFileSync(src, dst);
  console.log('Copied: ' + f);
});

// Write install.ps1 with ASCII-only content and UTF-8 BOM
const installPs1 = `
$ErrorActionPreference = "Stop"
$installDir = Join-Path $env:USERPROFILE ".bunpm"
$binDir = Join-Path $installDir "bin"

function Write-OK { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-WRN { param([string]$msg) Write-Host "  [!] $msg" -ForegroundColor Yellow }
function Write-ERR { param([string]$msg) Write-Host "  [ERR] $msg" -ForegroundColor Red }
function Write-NFO { param([string]$msg) Write-Host "  -> $msg" -ForegroundColor Cyan }

Write-Host ""
Write-Host "  bunpm installer" -ForegroundColor White
Write-Host "  ------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# Step 1: Check if already installed
try {
    if (Test-Path $installDir) {
        Write-WRN "bunpm is already installed at $installDir"
        Write-NFO "To reinstall, run the uninstall script first."
        Write-Host ""
        exit 0
    }
} catch {
    Write-ERR "Failed to check existing installation: $($_.Exception.Message)"
    exit 1
}

# Step 2: Check / install Bun
$bunAvailable = $false
try {
    $bunVersion = & bun --version 2>$null
    if ($LASTEXITCODE -eq 0 -and $bunVersion) {
        Write-OK "Bun v$bunVersion detected"
        $bunAvailable = $true
    }
} catch {}

if (-not $bunAvailable) {
    Write-NFO "Bun not found. Installing Bun automatically..."
    try {
        Invoke-RestMethod bun.sh/install.ps1 | Invoke-Expression
        $bunBinDir = Join-Path $env:USERPROFILE ".bun\\bin"
        if (Test-Path $bunBinDir) {
            $env:PATH = "$bunBinDir;$env:PATH"
        }
        $bunVersion = & bun --version 2>$null
        if ($LASTEXITCODE -eq 0 -and $bunVersion) {
            Write-OK "Bun v$bunVersion installed successfully"
            $bunAvailable = $true
        } else {
            throw "Bun installed but not responding"
        }
    } catch {
        Write-ERR "Failed to install Bun automatically."
        Write-ERR "Error: $($_.Exception.Message)"
        Write-Host ""
        Write-NFO "Please install Bun manually from https://bun.sh"
        exit 1
    }
}

# Step 3: Check Node.js
try {
    $nodeVersion = & node --version 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $nodeVersion) { throw "Node.js not found" }
    Write-OK "Node.js $nodeVersion detected"
} catch {
    Write-ERR "Node.js is required but was not found."
    Write-NFO "Install Node.js from https://nodejs.org"
    exit 1
}

# Step 4: Create installation directory
try {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
    Write-OK "Created $installDir"
} catch {
    Write-ERR "Failed to create installation directory: $($_.Exception.Message)"
    exit 1
}

# Step 5: Copy project files from staging area
try {
    $sourceDir = Join-Path $env:USERPROFILE "bunpm"

    $libSrc = Join-Path $sourceDir "lib"
    $libDst = Join-Path $installDir "lib"
    Copy-Item -Path $libSrc -Destination $libDst -Recurse -Force

    $binSrc = Join-Path $sourceDir "bin"
    Copy-Item -Path (Join-Path $binSrc "*") -Destination $binDir -Recurse -Force

    $pkgSrc = Join-Path $sourceDir "package.json"
    if (Test-Path $pkgSrc) { Copy-Item -Path $pkgSrc -Destination $installDir -Force }

    Write-OK "Copied project files to $installDir"
} catch {
    Write-ERR "Failed to copy project files: $($_.Exception.Message)"
    if (Test-Path $installDir) { Remove-Item -Path $installDir -Recurse -Force -ErrorAction SilentlyContinue }
    exit 1
}

# Step 6: Prepend to User PATH
try {
    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if (-not $currentPath) { $currentPath = "" }
    if ($currentPath -notlike "*$binDir*") {
        $newPath = "$binDir;$currentPath"
        [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        Write-OK "Added $binDir to User PATH (prepended)"
    } else {
        Write-WRN "$binDir is already in User PATH"
    }
} catch {
    Write-ERR "Failed to update User PATH: $($_.Exception.Message)"
}

# Step 6b: Prepend to System PATH (requires admin)
try {
    $machinePath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
    if ($machinePath -notlike "*$binDir*") {
        Start-Process powershell -Verb RunAs -Wait -ArgumentList "-ExecutionPolicy Bypass -Command \`"[Environment]::SetEnvironmentVariable('PATH', '$binDir;' + [Environment]::GetEnvironmentVariable('PATH','Machine'), 'Machine')\`""
        Write-OK "Added to System PATH (admin)"
    } else {
        Write-OK "Already in System PATH"
    }
} catch {
    Write-WRN "Could not update System PATH automatically."
    Write-NFO "Run this manually as admin:"
    Write-NFO "  [Environment]::SetEnvironmentVariable('PATH', '$binDir;' + $$env:PATH, 'Machine')"
}

# Step 7: Refresh current session PATH
try {
    if ($env:PATH -notlike "*$binDir*") { $env:PATH = "$binDir;$env:PATH" }
    Write-OK "Refreshed current session PATH"
} catch {
    Write-WRN "Could not refresh session PATH. Restart your terminal."
}

# Step 8: Verify
try {
    $npmCmd = Join-Path $binDir "npm.cmd"
    if (Test-Path $npmCmd) { Write-OK "Wrapper scripts verified" }
    else { Write-WRN "npm.cmd not found in $binDir" }
} catch { Write-WRN "Could not verify installation" }

# Step 9: Success
Write-Host ""
Write-Host "  ------------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-OK "bunpm installed successfully"
Write-OK "Bun v$bunVersion detected"
Write-OK "npm commands will now run via Bun"
Write-Host ""
Write-NFO "Restart your terminal for changes to take full effect."
Write-NFO "Run 'npm --version' to verify."
Write-Host ""
`;

// Write with UTF-8 BOM
const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
const content = Buffer.from(installPs1, 'utf8');
const ps1Path = path.join(dest, 'scripts', 'install.ps1');
fs.writeFileSync(ps1Path, Buffer.concat([bom, content]));
console.log('Wrote: scripts/install.ps1 (UTF-8 BOM, ASCII-only)');

// Write uninstall.ps1
const uninstallPs1 = `
$ErrorActionPreference = "Stop"
$installDir = Join-Path $env:USERPROFILE ".bunpm"
$binDir = Join-Path $installDir "bin"

function Write-OK { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-WRN { param([string]$msg) Write-Host "  [!] $msg" -ForegroundColor Yellow }
function Write-ERR { param([string]$msg) Write-Host "  [ERR] $msg" -ForegroundColor Red }
function Write-NFO { param([string]$msg) Write-Host "  -> $msg" -ForegroundColor Cyan }

Write-Host ""
Write-Host "  bunpm uninstaller" -ForegroundColor White
Write-Host "  ------------------------------------" -ForegroundColor DarkGray
Write-Host ""

try {
    if (-not (Test-Path $installDir)) {
        Write-WRN "bunpm is not installed"
        exit 0
    }
} catch { Write-ERR "Failed: $($_.Exception.Message)"; exit 1 }

try {
    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($currentPath) {
        $entries = $currentPath -split ';' | Where-Object { $_ -ne $binDir -and $_ -ne "" }
        $newPath = $entries -join ';'
        [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        Write-OK "Removed $binDir from User PATH"
    }
} catch { Write-ERR "Failed to update User PATH: $($_.Exception.Message)" }

try {
    $machinePath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
    if ($machinePath -like "*$binDir*") {
        Start-Process powershell -Verb RunAs -Wait -ArgumentList "-ExecutionPolicy Bypass -Command \`"$$entries = [Environment]::GetEnvironmentVariable('PATH','Machine') -split ';' | Where-Object { $$_ -ne '$binDir' -and $$_ -ne '' }; [Environment]::SetEnvironmentVariable('PATH', ($$entries -join ';'), 'Machine')\`""
        Write-OK "Removed $binDir from System PATH (admin)"
    }
} catch { Write-WRN "Could not update System PATH. Remove manually if needed." }

try {
    Remove-Item -Path $installDir -Recurse -Force
    Write-OK "Deleted $installDir"
} catch { Write-ERR "Failed to delete: $($_.Exception.Message)"; exit 1 }

try {
    $sessionEntries = $env:PATH -split ';' | Where-Object { $_ -ne $binDir -and $_ -ne "" }
    $env:PATH = $sessionEntries -join ';'
    Write-OK "Refreshed current session PATH"
} catch { Write-WRN "Restart your terminal." }

Write-Host ""
Write-Host "  ------------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-OK "bunpm uninstalled"
Write-OK "Original npm restored"
Write-Host ""
Write-NFO "Restart your terminal for changes to take full effect."
Write-Host ""
`;

const uninstPath = path.join(dest, 'scripts', 'uninstall.ps1');
fs.writeFileSync(uninstPath, Buffer.concat([bom, Buffer.from(uninstallPs1, 'utf8')]));
console.log('Wrote: scripts/uninstall.ps1 (UTF-8 BOM, ASCII-only)');

console.log('\n--- All files staged to: ' + dest + ' ---');
console.log('Now running install script...\n');

// Run the install script
const { execSync } = require('child_process');
try {
  execSync(
    'powershell -ExecutionPolicy Bypass -File "' + ps1Path + '"',
    { stdio: 'inherit' }
  );
} catch (e) {
  console.error('Install script exited with error code:', e.status);
  process.exit(e.status || 1);
}
