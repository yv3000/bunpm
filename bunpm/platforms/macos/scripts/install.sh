#!/usr/bin/env bash
# install.sh — bunpm one-time setup script for macOS
# Installs Bun (if needed), copies wrapper files, updates shell profile PATH.
# Does NOT require sudo/root for the standard install path.

set -euo pipefail

# --- Configuration ---
INSTALL_DIR="$HOME/.bunpm"
BIN_DIR="$INSTALL_DIR/bin"
CORE_DIR="$INSTALL_DIR/core"
SCRIPTS_DIR="$INSTALL_DIR/scripts"

# --- Helper: colored output (works in both bash and zsh-invoked subshells) ---
write_ok()  { printf "  \033[32m[OK]\033[0m %s\n" "$1"; }
write_warn() { printf "  \033[33m[!]\033[0m %s\n" "$1"; }
write_err()  { printf "  \033[31m[ERR]\033[0m %s\n" "$1"; }
write_info() { printf "  \033[36m->\033[0m %s\n" "$1"; }

echo ""
echo "  bunpm installer (macOS)"
echo "  ------------------------------------"
echo ""

# --- Step 1: Check if already installed ---
if [ -d "$INSTALL_DIR" ]; then
  write_warn "bunpm is already installed at $INSTALL_DIR"
  write_info "To reinstall, run the uninstall script first."
  echo ""
  exit 0
fi

# --- Step 2: Check / install Bun ---
BUN_AVAILABLE=false
BUN_VERSION=""
if command -v bun >/dev/null 2>&1; then
  BUN_VERSION="$(bun --version)"
  write_ok "Bun v$BUN_VERSION detected"
  BUN_AVAILABLE=true
fi

if [ "$BUN_AVAILABLE" = false ]; then
  write_info "Bun not found. Installing Bun automatically..."
  if curl -fsSL https://bun.sh/install | bash >/dev/null 2>&1; then
    # Bun's official installer places the binary at ~/.bun/bin/bun and
    # also attempts to add itself to shell profiles on its own — we still
    # explicitly source the PATH change into THIS script's current shell
    # session so the version check immediately below succeeds without
    # requiring the user to open a new terminal mid-install.
    export PATH="$HOME/.bun/bin:$PATH"
    if command -v bun >/dev/null 2>&1; then
      BUN_VERSION="$(bun --version)"
      write_ok "Bun v$BUN_VERSION installed successfully"
      BUN_AVAILABLE=true
    else
      write_err "Bun installer ran but bun command still not found."
      write_info "Please install Bun manually from https://bun.sh and re-run this installer."
      exit 1
    fi
  else
    write_err "Failed to install Bun automatically."
    write_info "Please install Bun manually from https://bun.sh and re-run this installer."
    exit 1
  fi
fi

# --- Step 3: Check Node.js ---
if ! command -v node >/dev/null 2>&1; then
  write_err "Node.js is required but was not found."
  write_info "Install Node.js from https://nodejs.org or via Homebrew: brew install node"
  exit 1
fi
NODE_VERSION="$(node --version)"
write_ok "Node.js $NODE_VERSION detected"

# --- Step 4: Create installation directories ---
mkdir -p "$BIN_DIR" "$CORE_DIR" "$SCRIPTS_DIR"
write_ok "Created $INSTALL_DIR"

# --- Step 5: Copy project files from staging directory ---
# The staging directory is where bootstrap.js downloaded the core/ and
# platforms/macos/ files to before invoking this script. SCRIPT_DIR
# resolves to the staging scripts/ folder this very file lives in;
# its parent is the staging root.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGING_ROOT="$(dirname "$SCRIPT_DIR")"

if [ ! -d "$STAGING_ROOT/core" ]; then
  write_err "Source core/ folder not found at $STAGING_ROOT/core"
  rm -rf "$INSTALL_DIR"
  exit 1
fi
cp -R "$STAGING_ROOT/core/." "$CORE_DIR/"

if [ ! -d "$STAGING_ROOT/bin" ]; then
  write_err "Source bin/ folder not found at $STAGING_ROOT/bin"
  rm -rf "$INSTALL_DIR"
  exit 1
fi
cp -R "$STAGING_ROOT/bin/." "$BIN_DIR/"

if [ -f "$STAGING_ROOT/package.json" ]; then
  cp "$STAGING_ROOT/package.json" "$INSTALL_DIR/package.json"
fi

# Copy this very scripts/ folder (install.sh + uninstall.sh) into the
# final install location too, exactly mirroring the bug-fix that was
# needed on Windows in v1.2.2 where uninstall.ps1 was forgotten initially
# — do NOT repeat that mistake here, copy scripts/ explicitly from the start.
cp -R "$SCRIPT_DIR/." "$SCRIPTS_DIR/"

write_ok "Copied project files to $INSTALL_DIR"

# --- Step 6: chmod +x every launcher script in bin/ ---
# CRITICAL — see the detailed explanation earlier in this prompt about why
# this step is non-optional. Without it, every npm/npx/yarn/pnpm invocation
# will fail with "Permission denied" the moment a new terminal opens.
chmod +x "$BIN_DIR"/*
write_ok "Made launcher scripts executable"

# --- Step 7: Update shell profile PATH ---
# Iterate the macOS shell profile candidates in priority order (see
# core/platform-detect.js getShellProfileCandidates('macos') for the
# canonical list this mirrors: .zprofile, .zshrc, .bash_profile, .profile).
# Write to the FIRST one that already exists; if none exist, create
# .zprofile as the macOS-appropriate default since Catalina+.
PATH_EXPORT_LINE="export PATH=\"$BIN_DIR:\$PATH\""
PATH_EXPORT_MARKER="# Added by bunpm installer"

PROFILE_CANDIDATES=(
  "$HOME/.zprofile"
  "$HOME/.zshrc"
  "$HOME/.bash_profile"
  "$HOME/.profile"
)

TARGET_PROFILE=""
for candidate in "${PROFILE_CANDIDATES[@]}"; do
  if [ -f "$candidate" ]; then
    TARGET_PROFILE="$candidate"
    break
  fi
done

if [ -z "$TARGET_PROFILE" ]; then
  TARGET_PROFILE="$HOME/.zprofile"
  touch "$TARGET_PROFILE"
  write_info "No existing shell profile found, created $TARGET_PROFILE"
fi

if grep -qF "$BIN_DIR" "$TARGET_PROFILE" 2>/dev/null; then
  write_warn "$BIN_DIR is already in $TARGET_PROFILE"
else
  {
    echo ""
    echo "$PATH_EXPORT_MARKER"
    echo "$PATH_EXPORT_LINE"
  } >> "$TARGET_PROFILE"
  write_ok "Added $BIN_DIR to PATH via $TARGET_PROFILE"
fi

# --- Step 8: Refresh current session PATH so verification below works ---
export PATH="$BIN_DIR:$PATH"
write_ok "Refreshed current session PATH"

# --- Step 9: Verify installation ---
if [ -x "$BIN_DIR/npm" ]; then
  write_ok "Wrapper scripts verified"
else
  write_warn "npm launcher not found or not executable in $BIN_DIR — installation may be incomplete"
fi

# --- Step 10: Print success summary ---
echo ""
echo "  ------------------------------------"
echo ""
write_ok "bunpm installed successfully"
write_ok "Bun v$BUN_VERSION detected"
write_ok "npm, npx, yarn, and pnpm commands will now run via Bun"
echo ""
write_info "Restart your terminal (or run: source $TARGET_PROFILE) for changes to take full effect."
write_info "Run 'npm --version' to verify."
echo ""
