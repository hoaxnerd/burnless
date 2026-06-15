#!/bin/sh
# Provision Node for burnless. Alpine/musl → `apk add nodejs npm` (no arm64-musl prebuilt exists;
# Alpine needs apk for runtime libs regardless). glibc Linux + macOS → download the pinned Node into
# <dest>, verified against nodejs.org SHASUMS256.txt. POSIX sh (BusyBox ash-safe). No prompts.
# Usage: provision-node.sh <dest-runtime-dir>
set -eu
DEST="${1:?dest dir}"
NODE_VERSION="${BURNLESS_PINNED_NODE:-v22.14.0}"
NODE_BASE="${BURNLESS_NODE_DIST_URL:-https://nodejs.org/dist}"

have() { command -v "$1" >/dev/null 2>&1; }

# --- Alpine / musl: use the distro package (covers both arches; meets the >=20.9 floor) ---
is_musl() {
  [ -f /etc/alpine-release ] && return 0
  for f in /lib/ld-musl-*.so.1; do [ -e "$f" ] && return 0; done
  if have ldd; then ldd --version 2>&1 | grep -qi musl && return 0; fi
  return 1
}
if [ "$(uname -s)" = "Linux" ] && is_musl; then
  if have apk; then
    apk add --no-cache nodejs npm >/dev/null 2>&1 || apk add --no-cache nodejs npm
    node -v >/dev/null
    echo "provisioned Node via apk (musl): $(node -v)"
    exit 0
  fi
  echo "musl detected but apk not found — install nodejs manually"; exit 1
fi

# --- glibc Linux + macOS: download the pinned Node ---
os="$(uname -s)"; arch="$(uname -m)"
case "$os" in Darwin) o=darwin;; Linux) o=linux;; *) echo "unsupported OS $os"; exit 1;; esac
case "$arch" in arm64|aarch64) a=arm64;; x86_64|amd64) a=x64;; *) echo "unsupported arch $arch"; exit 1;; esac
PKG="node-$NODE_VERSION-$o-$a.tar.gz"

dl() {
  case "$1" in
    file://*) cp "$(printf '%s' "$1" | sed 's,^file://,,')" "$2" ;;
    http://*|https://*)
      if have curl; then curl -fsSL "$1" -o "$2"
      elif have wget; then wget -qO "$2" "$1"
      else echo "need curl or wget"; exit 1; fi ;;
    *) cp "$1" "$2" ;;
  esac
}
sha() { if have shasum; then shasum -a 256 "$1" | awk '{print $1}'; else sha256sum "$1" | awk '{print $1}'; fi; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
BASE_SLASH="$NODE_BASE"; case "$NODE_BASE" in */) ;; *) BASE_SLASH="$NODE_BASE/";; esac
dl "$BASE_SLASH$NODE_VERSION/$PKG" "$TMP/$PKG"
dl "$BASE_SLASH$NODE_VERSION/SHASUMS256.txt" "$TMP/SHASUMS256.txt"
EXPECT="$(grep "  $PKG\$" "$TMP/SHASUMS256.txt" | awk '{print $1}')"
ACTUAL="$(sha "$TMP/$PKG")"
[ -n "$EXPECT" ] && [ "$EXPECT" = "$ACTUAL" ] || { echo "node checksum mismatch — refusing"; exit 1; }

mkdir -p "$DEST"
tar -xzf "$TMP/$PKG" -C "$TMP"
cp -R "$TMP/node-$NODE_VERSION-$o-$a/." "$DEST/"
"$DEST/bin/node" -v >/dev/null
echo "provisioned Node $NODE_VERSION → $DEST/bin/node"
