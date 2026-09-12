#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != '--no-path' ]; }; then
  echo 'bunpm: install: usage: install.sh [--no-path]' >&2; exit 1
fi
INSTALL_DIR="$HOME/.bunpm"
if [ -e "$INSTALL_DIR" ] || [ -L "$INSTALL_DIR" ]; then
  echo 'bunpm: install: existing ~/.bunpm found; run uninstall.sh before reinstalling.' >&2; exit 1
fi
# Suppress the shell's own "command not found" so a missing prerequisite is
# reported once, by us. Without the redirection and the || branch, set -e also
# aborted on a missing node before any bunpm diagnostic was printed.
node --version 2>/dev/null || { echo 'bunpm: install: node not found; install Node.js before running bunpm setup.' >&2; exit 1; }
bun --version 2>/dev/null || { echo 'bunpm: install: bun not found; install it from https://bun.sh first.' >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$(dirname "$SCRIPT_DIR")"
CORE_ROOT="$SOURCE_ROOT"
if [ ! -d "$CORE_ROOT/core" ]; then CORE_ROOT="$(dirname "$(dirname "$SOURCE_ROOT")")"; fi
test -d "$CORE_ROOT/core"
test -d "$SOURCE_ROOT/bin"
test -f "$SCRIPT_DIR/uninstall.sh"
mkdir "$INSTALL_DIR"
trap 'rm -rf "$INSTALL_DIR"' ERR
cp -R "$CORE_ROOT/core" "$SOURCE_ROOT/bin" "$SCRIPT_DIR" "$INSTALL_DIR/"
cp "$CORE_ROOT/package.json" "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/bin/"*
if [ "${1:-}" != '--no-path' ]; then
  PROFILE="$HOME/.bashrc"
  for candidate in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
    if [ -f "$candidate" ]; then PROFILE="$candidate"; break; fi
  done
  # Literal HOME expansion avoids injecting special characters from a home path.
  # shellcheck disable=SC2016
  if [ ! -f "$PROFILE" ] || ! grep -Fqx 'export PATH="$HOME/.bunpm/bin:$PATH"' "$PROFILE"; then
    # shellcheck disable=SC2016
    printf '\n# Added by bunpm installer\nexport PATH="$HOME/.bunpm/bin:$PATH"\n' >> "$PROFILE"
  fi
fi
trap - ERR
echo 'bunpm installed. Restart your terminal; original managers remain unchanged.'
