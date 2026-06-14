#!/usr/bin/env bash
#
# verify-npm-package.sh — smoke-test the publishable `burnless` npm package.
#
# Why this exists: `burnless` (packages/cli) is the only public npm package. The CLI
# is fully bundled by tsup (the published bin imports only Node built-ins), so the
# package must ship with ZERO runtime dependencies. A regression that reintroduces a
# `workspace:*` (or `file:`/`link:`) dependency into `dependencies` publishes a package
# that `npm install` cannot resolve (EUNSUPPORTEDPROTOCOL) — which is exactly how
# burnless@0.1.0 shipped broken. The fat-artifact verification (verify-fat-artifact)
# exercises the curl|sh / GitHub-Releases path, NOT the npm-package path, so this is a
# separate guard.
#
# What it does:
#   1. Builds the CLI.
#   2. `npm pack`s it (mimics the exact publish path: `cd packages/cli && npm publish`).
#   3. Asserts the packed package.json has no workspace:/file:/link: runtime deps.
#   4. Installs the tarball into a throwaway dir OUTSIDE the pnpm workspace (so npm
#      cannot mask a workspace dep via workspace resolution) and runs the bin.
#
# Run locally: bash scripts/verify-npm-package.sh
# Exits non-zero on any failure. Cleans up temp dirs and the tarball.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
CLI_DIR="$REPO_ROOT/packages/cli"

EXPECTED_VERSION="$(node -e "console.log(require('$CLI_DIR/package.json').version)")"
echo "==> burnless npm package smoke test (expecting v$EXPECTED_VERSION)"

echo "==> building the CLI"
pnpm --filter burnless build

echo "==> npm pack"
cd "$CLI_DIR"
TARBALL_NAME="$(npm pack --silent)"
TARBALL_ABS="$CLI_DIR/$TARBALL_NAME"
echo "    packed: $TARBALL_NAME"

# Always clean up the tarball, even on failure.
cleanup() { rm -f "$TARBALL_ABS"; [ -n "${TMP_INSTALL:-}" ] && rm -rf "$TMP_INSTALL"; }
trap cleanup EXIT

echo "==> asserting no workspace:/file:/link: runtime dependencies in the packed package.json"
tar -xzOf "$TARBALL_ABS" package/package.json | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const p = JSON.parse(s);
    const bad = [];
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [name, spec] of Object.entries(p[field] || {})) {
        if (/^(workspace|file|link):/.test(String(spec))) bad.push(`${field}.${name}=${spec}`);
      }
    }
    if (bad.length) {
      console.error("::error::Published package would contain unresolvable local deps:");
      bad.forEach((b) => console.error("  " + b));
      console.error("The bundled CLI must have zero runtime deps — move these to devDependencies.");
      process.exit(1);
    }
    console.error("    ok: no local-protocol runtime deps");
  });
'

echo "==> clean-installing the tarball in an isolated dir (outside the workspace)"
TMP_INSTALL="$(mktemp -d)"
cd "$TMP_INSTALL"
npm init -y >/dev/null 2>&1
npm install --no-audit --no-fund "$TARBALL_ABS"

echo "==> running the installed bin"
ACTUAL_VERSION="$("$TMP_INSTALL/node_modules/.bin/burnless" --version)"
echo "    burnless --version -> $ACTUAL_VERSION"

case "$ACTUAL_VERSION" in
  *"$EXPECTED_VERSION"*)
    echo "==> PASS: burnless npm package installs cleanly and reports v$EXPECTED_VERSION"
    ;;
  *)
    echo "::error::version mismatch — expected '$EXPECTED_VERSION', got '$ACTUAL_VERSION'"
    exit 1
    ;;
esac
