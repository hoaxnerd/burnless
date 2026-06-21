#!/bin/sh
# scripts/artifact/install-path.test.sh — run: sh scripts/artifact/install-path.test.sh
set -eu
SELF_DIR="$(CDPATH= cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export HOME="$TMP"; HOME_DIR="$TMP/.burnless"; mkdir -p "$HOME_DIR/bin"
RC="$HOME/.zshrc"; : > "$RC"

# Source install.sh in a mode that defines functions but does not run main.
BURNLESS_LIB_ONLY=1 SHELL="/bin/zsh" . "$SELF_DIR/../install.sh"

ensure_on_path "$HOME_DIR"
ensure_on_path "$HOME_DIR"   # second run must be a no-op

COUNT="$(grep -c 'burnless installer (PATH)' "$RC" || true)"
[ "$COUNT" = "1" ] || { echo "FAIL: expected 1 managed block, got $COUNT"; exit 1; }
grep -q "$HOME_DIR/bin" "$RC" || { echo "FAIL: bin dir not in rc"; exit 1; }
echo "PASS install-path"
