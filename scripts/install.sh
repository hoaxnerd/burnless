#!/bin/sh
# burnless installer (S5 P5). curl|sh. Verifies checksum BEFORE unpack. Idempotent.
#   BURNLESS_INSTALL_BASE_URL  base for burnless-<ver>.tar.gz(+.sha256)  (S6 sets a default hosted URL)
#   BURNLESS_VERSION           version to install (required until S6 wires "latest")
#   BURNLESS_HOME              install root override (default ~/.burnless via $HOME)
#   --with-node                provision a pinned Node into ~/.burnless/runtime if system Node is inadequate
set -eu

MIN_NODE_MAJOR=20; MIN_NODE_MINOR=9
WITH_NODE=0
for a in "$@"; do [ "$a" = "--with-node" ] && WITH_NODE=1; done

BASE="${BURNLESS_INSTALL_BASE_URL:-}"
VER="${BURNLESS_VERSION:-}"
HOME_DIR="${BURNLESS_HOME:-$HOME/.burnless}"
[ -n "$BASE" ] || { echo "error: set BURNLESS_INSTALL_BASE_URL (the hosted URL ships in S6)"; exit 1; }
[ -n "$VER" ]  || { echo "error: set BURNLESS_VERSION (latest-resolution ships in S6)"; exit 1; }

say() { printf '%s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
dl() { # dl <url> <dest> — http(s) via curl/wget; file:// (or bare path) via cp
  # For local testing BURNLESS_INSTALL_BASE_URL must be the file:///abs (or file://localhost/abs)
  # form — strip the optional empty/localhost authority so both yield the absolute path.
  case "$1" in
    file://*) cp "$(printf '%s' "$1" | sed -e 's,^file://localhost/,/,' -e 's,^file://,,')" "$2" ;;
    http://*|https://*)
      if have curl; then curl -fsSL "$1" -o "$2"
      elif have wget; then wget -qO "$2" "$1"
      else echo "need curl or wget"; exit 1; fi ;;
    *) cp "$1" "$2" ;; # bare local path
  esac
}
sha256_of() { if have shasum; then shasum -a 256 "$1" | awk '{print $1}'; else sha256sum "$1" | awk '{print $1}'; fi; }

# --- banner (honors NO_COLOR + non-tty) ---
if [ -z "${NO_COLOR:-}" ] && [ -t 1 ]; then B='\033[1m'; R='\033[0m'; else B=''; R=''; fi
printf '%b\n' "${B}burnless${R} installer — v$VER"

# --- Node hybrid ---
node_ok() {
  have node || return 1
  v="$(node -p 'process.versions.node' 2>/dev/null)" || return 1
  maj="${v%%.*}"; rest="${v#*.}"; min="${rest%%.*}"
  [ "$maj" -gt "$MIN_NODE_MAJOR" ] || { [ "$maj" -eq "$MIN_NODE_MAJOR" ] && [ "$min" -ge "$MIN_NODE_MINOR" ]; }
}
NODE_BIN=""
if node_ok; then
  : # system Node is adequate
elif [ "$WITH_NODE" = "1" ]; then
  say "system Node missing/old — provisioning a pinned Node into $HOME_DIR/runtime ..."
  sh "$(dirname "$0")/provision-node.sh" "$HOME_DIR/runtime" || { echo "node provisioning failed"; exit 1; }
  NODE_BIN="$HOME_DIR/runtime/bin/node"
else
  cat >&2 <<EOF
error: burnless needs Node >= $MIN_NODE_MAJOR.$MIN_NODE_MINOR but none adequate was found.
  Install Node (e.g. via your version manager) and re-run, OR re-run with --with-node to let
  the installer download a pinned Node into $HOME_DIR/runtime.
EOF
  exit 1
fi

# --- download + verify BEFORE unpack ---
TARNAME="burnless-$VER.tar.gz"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
BASE_SLASH="$BASE"; case "$BASE" in */) ;; *) BASE_SLASH="$BASE/";; esac
dl "$BASE_SLASH$TARNAME" "$TMP/$TARNAME"
dl "$BASE_SLASH$TARNAME.sha256" "$TMP/$TARNAME.sha256"
EXPECT="$(awk '{print $1}' "$TMP/$TARNAME.sha256")"
ACTUAL="$(sha256_of "$TMP/$TARNAME")"
[ "$EXPECT" = "$ACTUAL" ] || { echo "error: checksum mismatch (expected $EXPECT, got $ACTUAL) — refusing to unpack"; exit 1; }
say "checksum verified ✓"

# --- extract + flip + symlink (idempotent) ---
VDIR="$HOME_DIR/versions"; mkdir -p "$VDIR" "$HOME_DIR/bin"
STAGING="$(mktemp -d "$VDIR/.staging-$VER-XXXXXX")"
tar -xzf "$TMP/$TARNAME" -C "$STAGING"
rm -rf "$VDIR/$VER"; mv "$STAGING" "$VDIR/$VER"
ln -sfn "$VER" "$VDIR/current"
ln -sfn "../versions/current/burnless" "$HOME_DIR/bin/burnless"
chmod +x "$VDIR/$VER/burnless" 2>/dev/null || true

say ""
say "installed burnless v$VER → $VDIR/$VER"
say "add to PATH:  export PATH=\"$HOME_DIR/bin:\$PATH\""
say "then run:     burnless start"
