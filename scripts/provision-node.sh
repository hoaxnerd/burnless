#!/bin/sh
# Provision a pinned Node into <dest> (default the hybrid --with-node path). Verifies against
# nodejs.org SHASUMS256.txt. POSIX sh. Usage: provision-node.sh <dest-runtime-dir>
set -eu
DEST="${1:?dest dir}"
NODE_VERSION="${BURNLESS_PINNED_NODE:-v22.14.0}"   # pin; bump deliberately
NODE_BASE="${BURNLESS_NODE_DIST_URL:-https://nodejs.org/dist}"

os="$(uname -s)"; arch="$(uname -m)"
case "$os" in Darwin) o=darwin;; Linux) o=linux;; *) echo "unsupported OS $os"; exit 1;; esac
case "$arch" in arm64|aarch64) a=arm64;; x86_64|amd64) a=x64;; *) echo "unsupported arch $arch"; exit 1;; esac
PKG="node-$NODE_VERSION-$o-$a.tar.gz"

have() { command -v "$1" >/dev/null 2>&1; }
dl() { # dl <url> <dest> — http(s) via curl/wget; file:// (or bare path) via cp
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
# the tarball unpacks to node-<ver>-<o>-<a>/; copy its contents into <dest> so <dest>/bin/node exists
cp -R "$TMP/node-$NODE_VERSION-$o-$a/." "$DEST/"
"$DEST/bin/node" -v >/dev/null
echo "provisioned Node $NODE_VERSION → $DEST/bin/node"
