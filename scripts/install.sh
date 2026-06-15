#!/bin/sh
# burnless installer. curl -fsSL https://burnless.ai/install | sh — ZERO env vars needed.
# Self-contained (D9): provisions Node inline (Alpine→apk / glibc+macOS→pinned download),
# verifies checksums BEFORE unpack, idempotent. POSIX sh (BusyBox ash-safe).
#
# Overrides (all optional; explicit values win):
#   BURNLESS_INSTALL_BASE_URL  base for burnless-<ver>.tar.gz(+.sha256). When set, BURNLESS_VERSION
#                              is REQUIRED. Supports file:// for tests.
#   BURNLESS_VERSION           pin a specific version (skips latest-resolution).
#   BURNLESS_HOME              install root (default ~/.burnless)
#   BURNLESS_PINNED_NODE       Node version to vendor (default v22.14.0) — KEEP IN SYNC with
#                              scripts/provision-node.sh and packages/cli/src/bootstrap/node-provision.ts
#   BURNLESS_NODE_DIST_URL     Node tarball base (default https://nodejs.org/dist)
#   BURNLESS_NO_LAUNCH         if set, skip the `burnless` hand-off (print instructions instead)
set -eu

PINNED_NODE="${BURNLESS_PINNED_NODE:-v22.14.0}"
NODE_DIST="${BURNLESS_NODE_DIST_URL:-https://nodejs.org/dist}"
RELEASE_REPO="hoaxnerd/burnless"
LATEST_URL="https://burnless.ai/latest"

BASE="${BURNLESS_INSTALL_BASE_URL:-}"
VER="${BURNLESS_VERSION:-}"; VER="${VER#v}"
HOME_DIR="${BURNLESS_HOME:-$HOME/.burnless}"

# ---- pretty output (NO_COLOR + non-tty aware) ----
if [ -z "${NO_COLOR:-}" ] && [ -t 1 ]; then
  B='\033[1m'; GRN='\033[32m'; YEL='\033[33m'; RED='\033[31m'; R='\033[0m'
else B=''; GRN=''; YEL=''; RED=''; R=''; fi
say()  { printf '%s\n' "$*"; }
step() { printf '%b\n' "${B}::${R} $*"; }
ok()   { printf '%b\n' "  ${GRN}OK${R} $*"; }
warn() { printf '%b\n' "  ${YEL}!${R} $*" >&2; }
die()  { printf '%b\n' "${RED}error:${R} $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

SUDO=""
if [ "$(id -u)" -ne 0 ]; then have sudo && SUDO="sudo"; fi

printf '%b\n' "${B}burnless${R} installer"

# ---- detect platform / libc ----
os_raw="$(uname -s)"; arch_raw="$(uname -m)"
case "$os_raw" in Darwin) OS=darwin;; Linux) OS=linux;; *) die "unsupported OS: $os_raw";; esac
case "$arch_raw" in arm64|aarch64) ARCH=arm64;; x86_64|amd64) ARCH=x64;; *) die "unsupported arch: $arch_raw";; esac
if [ "$OS" = darwin ] && [ "$ARCH" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then ARCH=arm64; fi
IS_MUSL=0
if [ "$OS" = linux ]; then
  [ -f /etc/alpine-release ] && IS_MUSL=1
  for f in /lib/ld-musl-*.so.1; do [ -e "$f" ] && IS_MUSL=1; done
  if [ "$IS_MUSL" = 0 ] && have ldd; then ldd --version 2>&1 | grep -qi musl && IS_MUSL=1; fi
fi

# ---- package manager ----
PKG=""
if   have apk;     then PKG=apk
elif have apt-get; then PKG=apt
elif have dnf;     then PKG=dnf
elif have yum;     then PKG=yum
fi
pkg_install() {
  case "$PKG" in
    apk) $SUDO apk add --no-cache "$@" ;;
    apt) $SUDO apt-get update -qq && $SUDO apt-get install -y -qq "$@" ;;
    dnf) $SUDO dnf install -y -q "$@" ;;
    yum) $SUDO yum install -y -q "$@" ;;
    *)   return 1 ;;
  esac
}

# ---- prerequisites ----
step "Checking prerequisites"
NEED=""
{ have curl || have wget; } || NEED="$NEED curl"
have tar || NEED="$NEED tar"
if [ -n "$NEED" ]; then
  [ -n "$PKG" ] || die "missing:$NEED and no supported package manager (apk/apt/dnf/yum) found"
  warn "installing:$NEED via $PKG"
  # shellcheck disable=SC2086
  pkg_install $NEED ca-certificates || die "failed to install prerequisites:$NEED"
fi
ok "download + extract tools present"

# ---- fetch helpers ----
fetch_text() { if have curl; then curl -fsSL "$1"; else wget -qO- "$1"; fi; }
dl() {
  case "$1" in
    file://*) cp "$(printf '%s' "$1" | sed -e 's,^file://localhost/,/,' -e 's,^file://,,')" "$2" ;;
    http://*|https://*) if have curl; then curl -fsSL "$1" -o "$2"; else wget -qO "$2" "$1"; fi ;;
    *) cp "$1" "$2" ;;
  esac
}
sha256_of() { if have shasum; then shasum -a 256 "$1" | awk '{print $1}'; else sha256sum "$1" | awk '{print $1}'; fi; }

# ---- provision Node (ALWAYS; vendored). KEEP IN SYNC with scripts/provision-node.sh ----
provision_node() {
  if [ "$OS" = linux ] && [ "$IS_MUSL" = 1 ]; then
    [ -n "$PKG" ] || die "Alpine/musl detected but no apk — cannot install Node"
    step "Installing Node via $PKG (musl)"
    pkg_install nodejs npm || die "apk Node install failed"
    ok "Node $(node -v 2>/dev/null) (system, musl)"
    return 0
  fi
  step "Provisioning Node $PINNED_NODE ($OS-$ARCH)"
  NODE_PKG="node-$PINNED_NODE-$OS-$ARCH.tar.gz"
  NBASE="$NODE_DIST"; case "$NODE_DIST" in */) ;; *) NBASE="$NODE_DIST/";; esac
  ntmp="$(mktemp -d)"
  dl "$NBASE$PINNED_NODE/$NODE_PKG" "$ntmp/$NODE_PKG" || { rm -rf "$ntmp"; die "Node download failed"; }
  dl "$NBASE$PINNED_NODE/SHASUMS256.txt" "$ntmp/SHASUMS256.txt" || { rm -rf "$ntmp"; die "Node SHASUMS download failed"; }
  nexp="$(grep "  $NODE_PKG\$" "$ntmp/SHASUMS256.txt" | awk '{print $1}')"
  nact="$(sha256_of "$ntmp/$NODE_PKG")"
  if [ -z "$nexp" ] || [ "$nexp" != "$nact" ]; then rm -rf "$ntmp"; die "Node checksum mismatch — refusing"; fi
  mkdir -p "$HOME_DIR/runtime"
  tar -xzf "$ntmp/$NODE_PKG" -C "$ntmp"
  cp -R "$ntmp/node-$PINNED_NODE-$OS-$ARCH/." "$HOME_DIR/runtime/"
  rm -rf "$ntmp"
  "$HOME_DIR/runtime/bin/node" -v >/dev/null || die "provisioned Node failed to run"
  ok "Node $PINNED_NODE -> $HOME_DIR/runtime/bin/node"
}
provision_node

# ---- resolve version + base ----
if [ -n "$BASE" ]; then
  [ -n "$VER" ] || die "BURNLESS_INSTALL_BASE_URL is set, so BURNLESS_VERSION is required"
else
  if [ -z "$VER" ]; then
    step "Resolving latest version"
    VER="$(fetch_text "$LATEST_URL" | tr -d '[:space:]')" || true
    [ -n "$VER" ] || die "could not resolve the latest version from $LATEST_URL (set BURNLESS_VERSION to pin one)"
  fi
  BASE="https://github.com/${RELEASE_REPO}/releases/download/v${VER}"
fi

# ---- download + verify artifact BEFORE unpack ----
step "Downloading burnless v$VER"
TARNAME="burnless-$VER.tar.gz"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
BS="$BASE"; case "$BASE" in */) ;; *) BS="$BASE/";; esac
dl "$BS$TARNAME" "$TMP/$TARNAME" || die "download failed"
dl "$BS$TARNAME.sha256" "$TMP/$TARNAME.sha256" || die "checksum download failed"
EXPECT="$(awk '{print $1}' "$TMP/$TARNAME.sha256")"
ACTUAL="$(sha256_of "$TMP/$TARNAME")"
[ "$EXPECT" = "$ACTUAL" ] || die "checksum mismatch (expected $EXPECT, got $ACTUAL) — refusing to unpack"
ok "checksum verified"

# ---- extract + flip + symlink (idempotent) ----
step "Installing"
VDIR="$HOME_DIR/versions"; mkdir -p "$VDIR" "$HOME_DIR/bin"
STAGING="$(mktemp -d "$VDIR/.staging-$VER-XXXXXX")"
tar -xzf "$TMP/$TARNAME" -C "$STAGING"
rm -rf "$VDIR/$VER"; mv "$STAGING" "$VDIR/$VER"
ln -sfn "$VER" "$VDIR/current"
ln -sfn "../versions/current/burnless" "$HOME_DIR/bin/burnless"
chmod +x "$VDIR/$VER/burnless" 2>/dev/null || true
ok "installed burnless v$VER -> $VDIR/$VER"

# ---- PATH note ----
case ":$PATH:" in
  *":$HOME_DIR/bin:"*) ON_PATH=1 ;;
  *) ON_PATH=0 ;;
esac
say ""
if [ "$ON_PATH" = 0 ]; then
  say "Add burnless to your PATH:"
  printf '%b\n' "  ${B}export PATH=\"$HOME_DIR/bin:\$PATH\"${R}"
  say ""
fi

# ---- hand off to burnless (interactive when a TTY is available — P4) ----
if [ -n "${BURNLESS_NO_LAUNCH:-}" ]; then
  ok "Done. Run: burnless"
  exit 0
fi
ok "Done. Launching burnless..."
exec "$HOME_DIR/bin/burnless"
