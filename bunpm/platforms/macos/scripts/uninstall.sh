#!/usr/bin/env bash
# uninstall.sh — bunpm full cleanup/restore script for macOS
# Removes wrapper files, cleans shell profile PATH entry.
# Original npm/yarn/pnpm are never touched — removing our PATH entry
# restores them automatically since they're still on PATH elsewhere.

set -euo pipefail

INSTALL_DIR="$HOME/.bunpm"
BIN_DIR="$INSTALL_DIR/bin"

write_ok()  { printf "  \033[32m[OK]\033[0m %s\n" "$1"; }
write_warn() { printf "  \033[33m[!]\033[0m %s\n" "$1"; }
write_err()  { printf "  \033[31m[ERR]\033[0m %s\n" "$1"; }
write_info() { printf "  \033[36m->\033[0m %s\n" "$1"; }

echo ""
echo "  bunpm uninstaller (macOS)"
echo "  ------------------------------------"
echo ""

# --- Step 1: Check if installed ---
if [ ! -d "$INSTALL_DIR" ]; then
  write_warn "bunpm is not installed (folder $INSTALL_DIR not found)"
  echo ""
  exit 0
fi

# --- Step 2: Remove the PATH export block from every shell profile that has it ---
# We check ALL candidate profile files, not just the one install.sh originally
# wrote to, because the user may have since switched shells (bash -> zsh or
# vice versa) and could plausibly have copies of the PATH line in more than
# one profile file by now. Removing from all of them is the safe, thorough
# choice for a clean uninstall.
PROFILE_CANDIDATES=(
  "$HOME/.zprofile"
  "$HOME/.zshrc"
  "$HOME/.bash_profile"
  "$HOME/.profile"
  "$HOME/.bashrc"
)

for profile in "${PROFILE_CANDIDATES[@]}"; do
  if [ -f "$profile" ] && grep -qF "$BIN_DIR" "$profile" 2>/dev/null; then
    # Remove the marker comment line and the export line that follows it.
    # Using a temp file + mv rather than in-place sed -i, because macOS's
    # built-in BSD sed has different -i flag syntax than GNU sed (BSD sed
    # requires an explicit (even if empty) backup extension argument like
    # -i '' whereas GNU sed accepts -i with no argument) — using a temp
    # file sidesteps this BSD-vs-GNU sed incompatibility entirely rather
    # than trying to detect which sed variant is present.
    TMP_FILE="$(mktemp)"
    grep -vF "$BIN_DIR" "$profile" | grep -vF "# Added by bunpm installer" > "$TMP_FILE"
    mv "$TMP_FILE" "$profile"
    write_ok "Removed bunpm PATH entry from $profile"
  fi
done

# --- Step 3: Delete the installation folder ---
rm -rf "$INSTALL_DIR"
write_ok "Deleted $INSTALL_DIR"

# --- Step 4: Refresh current session PATH (best effort) ---
# We can only affect the CURRENT shell's PATH if this script is sourced
# rather than executed as a subprocess — since most users will run this
# via `bash uninstall.sh` (subprocess) rather than `source uninstall.sh`,
# we cannot guarantee this export persists back to the calling shell.
# We attempt it anyway for the case where it IS sourced, and print an
# explicit instruction either way.
export PATH="$(echo "$PATH" | tr ':' '\n' | grep -vF "$BIN_DIR" | tr '\n' ':')"

echo ""
echo "  ------------------------------------"
echo ""
write_ok "bunpm uninstalled"
write_ok "Original npm/yarn/pnpm restored"
echo ""
write_info "Restart your terminal for changes to take full effect."
echo ""
