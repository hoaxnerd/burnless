#!/usr/bin/env bash
# scripts/artifact/install-acceptance.sh — S5 P5 install / npm-bootstrap / update acceptance.
#
# Proves the three real distribution routes end-to-end against a LOCALLY-STAGED release
# (dist-artifact/), in clean, isolated Docker Linux/arm64 containers. No HTTP server: the
# staged release dir is MOUNTED read-only at /releases and reached via file:///releases —
# install.sh + release.ts both accept file:// URLs.
#
# Required checks (each logs ✓ on pass; a real failure aborts non-zero and is reported):
#   1. install.sh happy path        — verify-before-unpack + symlinked launcher runs + PGLite boots
#   2. verify-before-unpack         — corrupt .sha256 → non-zero + "checksum mismatch" + nothing unpacked
#   3. npm Model-B download-on-demand — thin entry downloads+extracts on a local verb; remote verb no-download
#   4. update happy path + data survives — install 0.1.0, write sentinel, update→0.2.0, sentinel survives
#   5. idempotency                  — re-run install.sh for 0.1.0 → clean, same result
#   6. Node always-vendor           — no-node glibc container → install.sh auto-downloads pinned
#                                      Node (NOT apk), exits 0, launcher runs the CLI via it (net-gated)
#
# IDEMPOTENCY: deterministic container names (burnless-p5-<slug>), `docker rm -f` before each
# run; the cached node:22-slim base image is reused (no --pull). Re-runnable any time.
#
# Never echoes secrets (no provider keys are used here — all verbs are key-free).
#
# Usage: bash scripts/artifact/install-acceptance.sh
set -euo pipefail

REPO="$PWD"
VER="$(node -e "console.log(require('./packages/cli/package.json').version)")"
TARBALL="dist-artifact/burnless-${VER}.tar.gz"
PLATFORM="linux/arm64"           # required; matches the arm64 host (native, fast)
BASE_IMG="node:22-slim"
NONODE_IMG="debian:stable-slim"  # has NO node → exercises the detect+guide path

[ -f "$REPO/$TARBALL" ] || { echo "✗ no $TARBALL — run 'pnpm build:artifact' first"; exit 1; }
[ -f "$REPO/$TARBALL.sha256" ] || { echo "✗ no $TARBALL.sha256 — run 'pnpm build:artifact' first"; exit 1; }
docker info >/dev/null 2>&1 || { echo "✗ docker daemon not up"; exit 1; }

PASS=()           # human ✓ lines for the final summary
note() { printf '%s\n' "== $* =="; }
ok()   { printf '   ✓ %s\n' "$*"; PASS+=("$1"); }
fail() { printf '   ✗ %s\n' "$*"; exit 1; }

rm_container() { docker rm -f "$1" >/dev/null 2>&1 || true; }

# Common docker run wrapper for the staged-release mount. Args: <name> <image> <script>.
# Mounts: dist-artifact→/releases:ro, install.sh→/scripts:ro, CLI dist→/cli:ro.
# Filters the harmless `tar: Ignoring unknown extended header keyword 'LIBARCHIVE.xattr...'`
# warnings Linux tar emits when unpacking a macOS-built tarball (apple provenance xattrs) —
# they flood stderr and obscure the assertion markers, but are not errors.
run_in() {
  local name="$1" image="$2" script="$3"
  rm_container "$name"
  docker run --rm --name "$name" --platform "$PLATFORM" \
    -v "$REPO/dist-artifact:/releases:ro" \
    -v "$REPO/scripts/install.sh:/scripts/install.sh:ro" \
    -v "$REPO/packages/cli/dist:/cli:ro" \
    "$image" bash -c "$script" 2>&1 | grep -v "LIBARCHIVE.xattr" || true
}

echo "burnless P5 install acceptance — version $VER, platform $PLATFORM"
echo "staged release: $REPO/dist-artifact (mounted file:///releases)"
echo

# ---------------------------------------------------------------------------------------
# 1. install.sh happy path (verify-before-unpack → symlinked launcher → PGLite boots)
# ---------------------------------------------------------------------------------------
note "check 1: install.sh happy path (Docker $PLATFORM)"
OUT="$(run_in burnless-p5-install "$BASE_IMG" '
  set -e
  export BURNLESS_INSTALL_BASE_URL=file:///releases
  export BURNLESS_VERSION='"$VER"'
  export BURNLESS_HOME=/root/.burnless
  # install-only check: do NOT let install.sh exec the interactive launcher (blocking server).
  export BURNLESS_NO_LAUNCH=1
  NO_COLOR=1 sh /scripts/install.sh
  # launcher runs through bin/burnless → versions/current → versions/<ver>/burnless
  echo "VERSION_OUT=$(/root/.burnless/bin/burnless --version)"
  # the installed artifact actually runs: PGLite bootstrap + provider read
  export BURNLESS_DATA_DIR=/root/.burnless/data BURNLESS_CONFIG_DIR=/root/.burnless/cfg
  /root/.burnless/bin/burnless bootstrap >/dev/null
  /root/.burnless/bin/burnless provider list --json >/dev/null && echo "PROVIDER_LIST_OK=1"
')"
echo "$OUT" | grep -q "checksum verified ✓"   || { echo "$OUT"; fail "no 'checksum verified ✓'"; }
echo "$OUT" | grep -q "VERSION_OUT=$VER"       || { echo "$OUT"; fail "launcher did not print $VER via symlink chain"; }
echo "$OUT" | grep -q "PROVIDER_LIST_OK=1"     || { echo "$OUT"; fail "installed artifact failed bootstrap/provider list (PGLite)"; }
ok "install.sh: checksum verified, launcher prints $VER, PGLite bootstrap+provider list run from the installed artifact"

# ---------------------------------------------------------------------------------------
# 2. verify-before-unpack (corrupt sha → refuse, leave nothing unpacked)
# ---------------------------------------------------------------------------------------
note "check 2: verify-before-unpack (corrupt .sha256 → refuse)"
OUT="$(run_in burnless-p5-tamper "$BASE_IMG" '
  set -e
  # Copy the staged release to a WRITABLE dir and corrupt the checksum to all-zeros.
  mkdir -p /tmp/bad && cp /releases/burnless-'"$VER"'.tar.gz /tmp/bad/
  printf "%s  burnless-'"$VER"'.tar.gz\n" "$(printf "0%.0s" $(seq 1 64))" > /tmp/bad/burnless-'"$VER"'.tar.gz.sha256
  export BURNLESS_INSTALL_BASE_URL=file:///tmp/bad
  export BURNLESS_VERSION='"$VER"'
  export BURNLESS_HOME=/root/.burnless
  # install-only check (fails before the launcher hand-off anyway; set for consistency).
  export BURNLESS_NO_LAUNCH=1
  if NO_COLOR=1 sh /scripts/install.sh; then echo "INSTALL_EXIT=0"; else echo "INSTALL_EXIT=$?"; fi
  # prove NOTHING was unpacked
  if [ -d /root/.burnless/versions/'"$VER"' ]; then echo "UNPACKED=1"; else echo "UNPACKED=0"; fi
')"   # the install is EXPECTED to fail; assert on captured markers
echo "$OUT" | grep -q "checksum mismatch"  || { echo "$OUT"; fail "no 'checksum mismatch' message"; }
echo "$OUT" | grep -q "INSTALL_EXIT=0"     && { echo "$OUT"; fail "install.sh exited 0 on a corrupt checksum (must be non-zero)"; }
echo "$OUT" | grep -q "INSTALL_EXIT="      || { echo "$OUT"; fail "install.sh did not run to the exit marker"; }
echo "$OUT" | grep -q "UNPACKED=0"         || { echo "$OUT"; fail "a versions/$VER dir was created despite the checksum mismatch"; }
ok "verify-before-unpack: corrupt .sha256 → non-zero exit, 'checksum mismatch', no versions/$VER dir created"

# ---------------------------------------------------------------------------------------
# 3. npm Model-B download-on-demand (thin entry) + remote verb no-download
# ---------------------------------------------------------------------------------------
note "check 3: npm thin entry — Model-B download-on-demand"
OUT="$(run_in burnless-p5-npm "$BASE_IMG" '
  set -e
  export BURNLESS_RELEASE_BASE_URL=file:///releases
  export BURNLESS_RELEASE_VERSION='"$VER"'
  export BURNLESS_DATA_DIR=/root/.burnless/data BURNLESS_CONFIG_DIR=/root/.burnless/cfg
  # Clean home: NO artifact pre-installed under ~/.burnless/versions
  [ -e /root/.burnless/versions ] && echo "PREEXISTING_VERSIONS=1" || echo "PREEXISTING_VERSIONS=0"
  # A LOCAL verb (health) on the thin entry → must download+verify+extract then run.
  /cli/index.thin.js health >/dev/null 2>&1 && echo "HEALTH_RAN=1" || echo "HEALTH_RAN=$?"
  [ -d /root/.burnless/versions/'"$VER"' ] && echo "DOWNLOADED=1" || echo "DOWNLOADED=0"
  # A REMOTE verb (whoami) → runs natively, NO download. Use a separate clean home to prove it.
  rm -rf /tmp/h2 && export HOME=/tmp/h2 && mkdir -p /tmp/h2
  unset BURNLESS_DATA_DIR BURNLESS_CONFIG_DIR
  /cli/index.thin.js whoami >/dev/null 2>&1; echo "WHOAMI_EXIT=$?"
  [ -e /tmp/h2/.burnless/versions ] && echo "REMOTE_DOWNLOADED=1" || echo "REMOTE_DOWNLOADED=0"
')"
echo "$OUT" | grep -q "PREEXISTING_VERSIONS=0" || { echo "$OUT"; fail "home was not clean (versions/ pre-existed)"; }
echo "$OUT" | grep -q "HEALTH_RAN=1"           || { echo "$OUT"; fail "thin entry 'health' did not run after download"; }
echo "$OUT" | grep -q "DOWNLOADED=1"           || { echo "$OUT"; fail "thin entry did not download+extract versions/$VER on first local verb"; }
echo "$OUT" | grep -q "REMOTE_DOWNLOADED=0"    || { echo "$OUT"; fail "a remote verb (whoami) triggered an artifact download"; }
ok "npm Model-B: thin 'health' downloaded+verified+extracted versions/$VER then ran; remote 'whoami' ran with NO download"

# ---------------------------------------------------------------------------------------
# 4. update happy path + data survives (decoupled from versions/)
# ---------------------------------------------------------------------------------------
note "check 4: burnless update 0.1.0 → 0.2.0 (data survives)"
# We do this inside ONE container: install 0.1.0, drop a data sentinel, stage a 0.2.0
# release (re-tag the same tarball + regenerate its sha256), then `burnless update 0.2.0`.
# update resolves versionsDir() = configDir()/versions; with HOME=/root and NO
# BURNLESS_CONFIG_DIR set it resolves ~/.burnless/versions = the install root. The data
# dir (BURNLESS_DATA_DIR) lives OUTSIDE versions/, so the flip never touches it.
OUT="$(run_in burnless-p5-update "$BASE_IMG" '
  set -e
  export BURNLESS_INSTALL_BASE_URL=file:///releases
  export BURNLESS_VERSION='"$VER"'
  export BURNLESS_HOME=/root/.burnless
  # install-only step (we drive update via the bin below): no launcher hand-off.
  export BURNLESS_NO_LAUNCH=1
  NO_COLOR=1 sh /scripts/install.sh >/dev/null
  # Realistic path: a CONFIGURED running instance is updated. The data dir + instance.env
  # live in the CANONICAL home (~/.burnless) so the post-swap `doctor` (which update runs
  # against the default home) sees the bootstrap-provisioned SECRETS_ENCRYPTION_KEY. Config
  # dir = ~/.burnless (the install root) so versionsDir() also resolves there. See the
  # PACKAGING.md "fresh-install-then-update" caveat: doctor exits non-zero until secrets are
  # provisioned, so an update run BEFORE any bootstrap/start would (correctly) roll back.
  export BURNLESS_DATA_DIR=/root/.burnless/data BURNLESS_CONFIG_DIR=/root/.burnless
  # data sentinel: a marker file under the DECOUPLED data dir (outside versions/)
  mkdir -p /root/.burnless/data
  echo "sentinel-$(date +%s)" > /root/.burnless/data/SENTINEL
  SENTINEL_BEFORE="$(cat /root/.burnless/data/SENTINEL)"
  # exercise PGLite + provision instance.env so the data dir holds a real DB + key
  /root/.burnless/bin/burnless bootstrap >/dev/null
  # stage a 0.2.0 release in a writable mirror dir (releases mount is ro): re-tag the same
  # tarball as 0.2.0 and regenerate its .sha256 (shasum-line format: "<hex>  <name>").
  mkdir -p /tmp/rel
  cp /releases/burnless-'"$VER"'.tar.gz /tmp/rel/burnless-0.2.0.tar.gz
  HEX="$(sha256sum /tmp/rel/burnless-0.2.0.tar.gz | cut -d" " -f1)"
  printf "%s  burnless-0.2.0.tar.gz\n" "$HEX" > /tmp/rel/burnless-0.2.0.tar.gz.sha256
  # update: download 0.2.0 from the local mirror, atomic flip, post-swap doctor check.
  # Run the INSTALLED launcher (HOME-based versionsDir = the install root); keep the same
  # config/data env so doctor reads the provisioned instance.env.
  BURNLESS_RELEASE_BASE_URL=file:///tmp/rel \
    /root/.burnless/bin/burnless update 0.2.0 2>&1 || echo "UPDATE_EXIT=$?"
  echo "CURRENT_LINK=$(readlink /root/.burnless/versions/current)"
  [ -d /root/.burnless/versions/'"$VER"' ] && echo "PRIOR_KEPT=1" || echo "PRIOR_KEPT=0"
  SENTINEL_AFTER="$(cat /root/.burnless/data/SENTINEL 2>/dev/null || echo MISSING)"
  [ "$SENTINEL_BEFORE" = "$SENTINEL_AFTER" ] && echo "SENTINEL_SURVIVED=1" || echo "SENTINEL_SURVIVED=0"
  # PGLite data dir still bootable after the swap (data decoupled)
  /root/.burnless/bin/burnless provider list --json >/dev/null 2>&1 && echo "PGLITE_OK=1" || echo "PGLITE_OK=0"
')"
echo "$OUT" | grep -q "CURRENT_LINK=0.2.0"   || { echo "$OUT"; fail "versions/current was not flipped to 0.2.0"; }
echo "$OUT" | grep -q "SENTINEL_SURVIVED=1"  || { echo "$OUT"; fail "data sentinel did NOT survive the update (data decoupling broken)"; }
echo "$OUT" | grep -q "PRIOR_KEPT=1"         || { echo "$OUT"; fail "prior version dir was deleted (rollback would be impossible)"; }
echo "$OUT" | grep -q "PGLITE_OK=1"          || { echo "$OUT"; fail "PGLite data dir not usable after update"; }
ok "update: current → 0.2.0, prior $VER kept, data sentinel + PGLite survived (data decoupled from versions/)"

# ---------------------------------------------------------------------------------------
# 5. idempotency (re-run install for the same version → clean, same result)
# ---------------------------------------------------------------------------------------
note "check 5: install.sh idempotency (re-run same version)"
OUT="$(run_in burnless-p5-idem "$BASE_IMG" '
  set -e
  export BURNLESS_INSTALL_BASE_URL=file:///releases BURNLESS_VERSION='"$VER"' BURNLESS_HOME=/root/.burnless
  # install-only check (both runs): no launcher hand-off so we can inspect the tree.
  export BURNLESS_NO_LAUNCH=1
  NO_COLOR=1 sh /scripts/install.sh >/dev/null
  V1="$(/root/.burnless/bin/burnless --version)"
  # second run in the SAME home
  NO_COLOR=1 sh /scripts/install.sh >/dev/null; echo "RERUN_EXIT=$?"
  V2="$(/root/.burnless/bin/burnless --version)"
  [ "$V1" = "$V2" ] && echo "SAME_VERSION=1" || echo "SAME_VERSION=0"
  # exactly one version dir, current still valid, launcher still runs
  echo "VERSION_DIRS=$(ls -1 /root/.burnless/versions | grep -v current | wc -l | tr -d " ")"
  [ "$(readlink /root/.burnless/versions/current)" = "'"$VER"'" ] && echo "CURRENT_OK=1" || echo "CURRENT_OK=0"
')"
echo "$OUT" | grep -q "RERUN_EXIT=0"    || { echo "$OUT"; fail "second install.sh run did not exit 0"; }
echo "$OUT" | grep -q "SAME_VERSION=1"  || { echo "$OUT"; fail "re-run produced a different version"; }
echo "$OUT" | grep -q "VERSION_DIRS=1"  || { echo "$OUT"; fail "re-run left duplicate version dirs"; }
echo "$OUT" | grep -q "CURRENT_OK=1"    || { echo "$OUT"; fail "current symlink broken after re-run"; }
ok "idempotency: re-run install.sh for $VER → exit 0, same version, single version dir, current intact"

# ---------------------------------------------------------------------------------------
# 6. Node always-vendor: no-node glibc host → install.sh auto-provisions pinned Node
# ---------------------------------------------------------------------------------------
# New (P3) behavior: install.sh ALWAYS provisions our pinned Node — no --with-node flag, no
# "needs Node >= 20.9" guide/fail. On a glibc Linux host with no node it DOWNLOADS the pinned
# v22.14.0 tarball (verify-before-unpack) into ~/.burnless/runtime/bin/node, NOT apk. The
# download path needs nodejs.org reachable from inside the container; probe first and, if it
# is unreachable, log an HONEST skip (host-validated in Task 7) rather than failing.
note "check 6: Node always-vendor — no-node glibc host auto-provisions pinned Node (network-gated)"
if docker run --rm --platform "$PLATFORM" "$NONODE_IMG" bash -c \
     'command -v curl >/dev/null 2>&1 || (apt-get update -qq >/dev/null && apt-get install -y -qq curl >/dev/null); curl -fsSL -o /dev/null --max-time 15 https://nodejs.org/dist/index.json' >/dev/null 2>&1; then
  OUT="$(run_in burnless-p5-nonode "$NONODE_IMG" '
    set -e
    command -v node >/dev/null 2>&1 && echo "HAS_NODE=1" || echo "HAS_NODE=0"
    apt-get update -qq >/dev/null && apt-get install -y -qq curl tar >/dev/null
    export BURNLESS_INSTALL_BASE_URL=file:///releases BURNLESS_VERSION='"$VER"' BURNLESS_HOME=/root/.burnless
    # BURNLESS_NO_LAUNCH=1 → install runs to completion but does NOT exec burnless.
    if BURNLESS_NO_LAUNCH=1 NO_COLOR=1 sh /scripts/install.sh 2>&1; then echo "INSTALL_EXIT=0"; else echo "INSTALL_EXIT=$?"; fi
    # pinned Node was DOWNLOADED into runtime/bin/node (glibc host = download path, not apk)
    "/root/.burnless/runtime/bin/node" -v && echo "RUNTIME_NODE_OK=1"
    # the installed launcher runs the CLI via that provisioned node
    echo "VERSION_OUT=$(/root/.burnless/bin/burnless --version)" && echo "LAUNCHER_VIA_RUNTIME_OK=1"
  ')"
  echo "$OUT" | grep -q "HAS_NODE=0"                || { echo "$OUT"; fail "no-node container unexpectedly has node"; }
  echo "$OUT" | grep -q "INSTALL_EXIT=0"            || { echo "$OUT"; fail "install.sh did not auto-provision (must exit 0, not guide/fail)"; }
  echo "$OUT" | grep -q "RUNTIME_NODE_OK=1"         || { echo "$OUT"; fail "pinned Node not downloaded to runtime/bin/node"; }
  echo "$OUT" | grep -q "VERSION_OUT=$VER"          || { echo "$OUT"; fail "launcher did not print $VER via the provisioned node"; }
  echo "$OUT" | grep -q "LAUNCHER_VIA_RUNTIME_OK=1" || { echo "$OUT"; fail "launcher did not run the CLI via the provisioned runtime node"; }
  ok "Node always-vendor: no-node glibc host → install.sh exit 0, pinned Node downloaded to runtime/bin/node, launcher runs CLI ($VER) via it"
else
  printf '   ⚠ SKIP Node always-vendor: nodejs.org unreachable from the container (host-validated in Task 7)\n'
  PASS+=("Node always-vendor SKIPPED (nodejs.org unreachable; host-validated in Task 7)")
fi

# ---------------------------------------------------------------------------------------
echo
echo "✓✓ install acceptance passed (platform $PLATFORM):"
for line in "${PASS[@]}"; do printf '   • %s\n' "$line"; done
echo
echo "Note: linux/amd64 was NOT run (optional/best-effort under slow qemu); the artifact is"
echo "platform-agnostic (system-Node + pure JS/WASM) and the P4 full matrix already covers amd64."
