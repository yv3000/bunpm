#!/usr/bin/env bash
# install.sh — bunpm one-time setup script for Linux
# Installs Bun (if needed), copies wrapper files, updates shell profile PATH.
# Does NOT require sudo/root for the standard install path.

set -euo pipefail

INSTALL_DIR="$HOME/.bunpm"
BIN_DIR="$INSTALL_DIR/bin"
CORE_DIR="$INSTALL_DIR/core"
SCRIPTS_DIR="$INSTALL_DIR/scripts"

write_ok()  { printf "  \033[32m[OK]\033[0m %s\n" "$1"; }
write_warn() { printf "  \033[33m[!]\033[0m %s\n" "$1"; }
write_err()  { printf "  \033[31m[ERR]\033[0m %s\n" "$1"; }
write_info() { printf "  \033[36m->\033[0m %s\n" "$1"; }

echo ""
echo "  bunpm installer (Linux)"
echo "  ------------------------------------"
echo ""

if [ -d "$INSTALL_DIR" ]; then
  write_warn "bunpm is already installed at $INSTALL_DIR"
  write_info "To reinstall, run the uninstall script first."
  echo ""
  exit 0
fi

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

if ! command -v node >/dev/null 2>&1; then
  write_err "Node.js is required but was not found."
  write_info "Install Node.js from https://nodejs.org, or via your distro's package manager"
  write_info "  (e.g. apt install nodejs npm  /  dnf install nodejs  /  pacman -S nodejs npm)"
  exit 1
fi
NODE_VERSION="$(node --version)"
write_ok "Node.js $NODE_VERSION detected"

mkdir -p "$BIN_DIR" "$CORE_DIR" "$SCRIPTS_DIR"
write_ok "Created $INSTALL_DIR"

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

cp -R "$SCRIPT_DIR/." "$SCRIPTS_DIR/"

write_ok "Copied project files to $INSTALL_DIR"

chmod +x "$BIN_DIR"/*
write_ok "Made launcher scripts executable"

# Linux shell profile priority: .bashrc first (bash is the dominant
# default login shell across mainstream Linux desktop distros), then
# .zshrc, then .profile as a generic fallback.
PATH_EXPORT_LINE="export PATH=\"$BIN_DIR:\$PATH\""
PATH_EXPORT_MARKER="# Added by bunpm installer"

PROFILE_CANDIDATES=(
  "$HOME/.bashrc"
  "$HOME/.zshrc"
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
  TARGET_PROFILE="$HOME/.bashrc"
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

export PATH="$BIN_DIR:$PATH"
write_ok "Refreshed current session PATH"

if [ -x "$BIN_DIR/npm" ]; then
  write_ok "Wrapper scripts verified"
else
  write_warn "npm launcher not found or not executable in $BIN_DIR — installation may be incomplete"
fi

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
