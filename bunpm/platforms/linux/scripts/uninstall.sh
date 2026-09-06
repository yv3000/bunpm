#!/usr/bin/env bash
# uninstall.sh — bunpm full cleanup/restore script for Linux
set -euo pipefail

INSTALL_DIR="$HOME/.bunpm"
BIN_DIR="$INSTALL_DIR/bin"

write_ok()  { printf "  \033[32m[OK]\033[0m %s\n" "$1"; }
write_warn() { printf "  \033[33m[!]\033[0m %s\n" "$1"; }
write_err()  { printf "  \033[31m[ERR]\033[0m %s\n" "$1"; }
write_info() { printf "  \033[36m->\033[0m %s\n" "$1"; }

echo ""
echo "  bunpm uninstaller (Linux)"
echo "  ------------------------------------"
echo ""

if [ ! -d "$INSTALL_DIR" ]; then
  write_warn "bunpm is not installed (folder $INSTALL_DIR not found)"
  echo ""
  exit 0
fi

PROFILE_CANDIDATES=(
  "$HOME/.bashrc"
  "$HOME/.zshrc"
  "$HOME/.profile"
  "$HOME/.zprofile"
  "$HOME/.bash_profile"
)

for profile in "${PROFILE_CANDIDATES[@]}"; do
  if [ -f "$profile" ] && grep -qF "$BIN_DIR" "$profile" 2>/dev/null; then
    TMP_FILE="$(mktemp)"
    grep -vF "$BIN_DIR" "$profile" | grep -vF "# Added by bunpm installer" > "$TMP_FILE"
    mv "$TMP_FILE" "$profile"
    write_ok "Removed bunpm PATH entry from $profile"
  fi
done

rm -rf "$INSTALL_DIR"
write_ok "Deleted $INSTALL_DIR"

# Split from the export deliberately. The combined `export PATH="$(...)"` form
# hides the pipeline's exit status (shellcheck SC2155), but splitting it means
# that status now reaches `set -o pipefail`: grep -vF exits 1 when it prints
# nothing, which is exactly what happens if $BIN_DIR was the only entry on
# PATH. That is a correct outcome here, not a failure, so `|| true` stops it
# aborting the script two lines before the summary below.
CLEANED_PATH="$(echo "$PATH" | tr ':' '\n' | grep -vF "$BIN_DIR" | tr '\n' ':')" || true
export PATH="$CLEANED_PATH"

echo ""
echo "  ------------------------------------"
echo ""
write_ok "bunpm uninstalled"
write_ok "Original npm/yarn/pnpm restored"
echo ""
write_info "Restart your terminal for changes to take full effect."
echo ""
