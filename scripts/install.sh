#!/bin/sh
# burnless installer. curl -fsSL https://burnless.ai/install | sh — ZERO env vars needed.
# Verifies checksum BEFORE unpack. Idempotent.
#
# Zero-env default: resolves the latest version from https://burnless.ai/latest and downloads
# the tarball + .sha256 DIRECT from GitHub Releases
# (https://github.com/<org>/burnless/releases/download/v<ver>/burnless-<ver>.tar.gz).
#
# Overrides (all optional; explicit values win over the hosted defaults):
#   BURNLESS_INSTALL_BASE_URL  base for burnless-<ver>.tar.gz(+.sha256). When set, BURNLESS_VERSION
#                              is REQUIRED (no latest-resolution). Supports file:// for tests.
#   BURNLESS_VERSION           pin a specific version (skips latest-resolution).
#   BURNLESS_HOME              install root override (default ~/.burnless via $HOME)
#   --with-node                provision a pinned Node into ~/.burnless/runtime if system Node is inadequate
# NOTE: set the public <org>/burnless repo + burnless.ai routes once the repository is live.
set -eu

MIN_NODE_MAJOR=20; MIN_NODE_MINOR=9
WITH_NODE=0
for a in "$@"; do [ "$a" = "--with-node" ] && WITH_NODE=1; done

RELEASE_REPO="burnless/burnless"
LATEST_URL="https://burnless.ai/latest"

BASE="${BURNLESS_INSTALL_BASE_URL:-}"
VER="${BURNLESS_VERSION:-}"
VER="${VER#v}"   # accept a leading-v tag form (v0.1.0) — asset names use the bare semver
HOME_DIR="${BURNLESS_HOME:-$HOME/.burnless}"

say() { printf '%s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

fetch_text() { # fetch_text <url> — print body to stdout (http(s) only)
  if have curl; then curl -fsSL "$1"
  elif have wget; then wget -qO- "$1"
  else echo "need curl or wget" >&2; return 1; fi
}

# --- resolve version + base (zero-env default) ---
# If BURNLESS_INSTALL_BASE_URL is explicitly set we honor it verbatim and REQUIRE
# BURNLESS_VERSION (the file:// acceptance flow stays unchanged). Otherwise we default to
# the hosted path: resolve VER from burnless.ai/latest, then build the GitHub-Releases base.
if [ -n "$BASE" ]; then
  [ -n "$VER" ] || { echo "error: BURNLESS_INSTALL_BASE_URL is set, so BURNLESS_VERSION is required"; exit 1; }
else
  if [ -z "$VER" ]; then
    VER="$(fetch_text "$LATEST_URL" | tr -d '[:space:]')" || true
    [ -n "$VER" ] || { echo "error: could not resolve the latest version from $LATEST_URL (set BURNLESS_VERSION to pin one)"; exit 1; }
  fi
  BASE="https://github.com/${RELEASE_REPO}/releases/download/v${VER}"
fi
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
