#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -gt 1 ] || { [ "$#" -eq 1 ] && [ "$1" != '--no-path' ]; }; then
  echo 'bunpm: uninstall: usage: uninstall.sh [--no-path]' >&2; exit 1
fi
INSTALL_DIR="$HOME/.bunpm"
if [ "${1:-}" != '--no-path' ]; then
  for profile in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile" "$HOME/.zprofile" "$HOME/.bash_profile"; do
    if [ ! -f "$profile" ]; then continue; fi
    TMP_FILE="$(mktemp)"
    trap 'rm -f "$TMP_FILE"' EXIT
    # Remove only our marked exact line, including the legacy absolute spelling.
    BUNPM_OLD="export PATH=\"$INSTALL_DIR/bin:\$PATH\"" awk '
      $0 == "# Added by bunpm installer" { if (marker) print marker; marker=$0; next }
      marker { if ($0 != "export PATH=\"$HOME/.bunpm/bin:$PATH\"" && $0 != ENVIRON["BUNPM_OLD"]) { print marker; print } marker=""; next }
      { print }
      END { if (marker) print marker }
    ' "$profile" > "$TMP_FILE"
    cat "$TMP_FILE" > "$profile"
    rm -f "$TMP_FILE"
    trap - EXIT
  done
fi
rm -rf "$INSTALL_DIR"
echo 'bunpm removed. Restart your terminal; original managers and Bun remain installed.'
