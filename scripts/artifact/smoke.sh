#!/usr/bin/env bash
# scripts/artifact/smoke.sh — verify a built fat-artifact boots PGLite + the server (the
# spec §9 / S5 P4 "2a" acceptance), running EVERY local verb from the built dist.
#
# Flow: bootstrap → bootstrap again (idempotent) → provider list (the PGLite read) →
# provider add + key set (encrypted write) → list (persisted) → start → /api/health →
# kill → start again → list (persisted across restart).
#
# Isolation: a throwaway BURNLESS_CONFIG_DIR (instance.env) AND BURNLESS_DATA_DIR (PGLite)
# so the real ~/.burnless is never touched. SECRETS_ENCRYPTION_KEY is supplied; AUTH_SECRET
# is DELIBERATELY left unset so bootstrap/start auto-provision it (exercises the first-run
# parity fix end-to-end) and the restart proves it persisted in the isolated instance.env.
#
# Usage: scripts/artifact/smoke.sh <stage-dir>   (defaults to dist-artifact/stage)
set -euo pipefail

STAGE="${1:-dist-artifact/stage}"
CLI="$STAGE/cli/index.js"
PORT="${BURNLESS_SMOKE_PORT:-2876}"

[ -f "$CLI" ] || { echo "✗ no CLI at $CLI — run pnpm build:artifact first"; exit 1; }

DATA_DIR="$(mktemp -d)"
KEY="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))')"
export BURNLESS_CONFIG_DIR="$DATA_DIR/config"   # isolates instance.env (secrets/config)
export BURNLESS_DATA_DIR="$DATA_DIR/data"       # isolates the PGLite data dir
export SECRETS_ENCRYPTION_KEY="$KEY"            # supplied; AUTH_SECRET is auto-provisioned
export BURNLESS_DEPLOYMENT="self_host"
cleanup() { rm -rf "$DATA_DIR"; }
trap cleanup EXIT

echo "== bootstrap (migrate + key + owner + company over PGLite) =="
node "$CLI" bootstrap
echo "== bootstrap again (idempotent) =="
node "$CLI" bootstrap

echo "== AUTH_SECRET auto-provisioned + persisted to instance.env =="
grep -q '^AUTH_SECRET=' "$BURNLESS_CONFIG_DIR/instance.env" \
  && echo "AUTH_SECRET persisted ✓" \
  || { echo "✗ AUTH_SECRET not persisted to instance.env"; exit 1; }

echo "== provider list (PGLite read; THE 2a smoke) =="
node "$CLI" provider list --json

echo "== provider add + key set + list (encrypted write/read round-trip) =="
node "$CLI" provider add openai-smoke --kind openai-compatible --base-url https://example.test/v1 --key-stdin <<<'sk-smoke-dummy-key'
node "$CLI" provider list --json | grep -q "openai-smoke" \
  && echo "provider persisted ✓" \
  || { echo "✗ provider not persisted after add"; exit 1; }

echo "== start → health → restart → persist =="
# NOTE: BURNLESS_SERVER_ENTRY is NOT set here — the artifact marker makes `start`'s
# prepareArtifactEnv() inject it automatically. The whole point of the artifact.
start_and_health() {
  node "$CLI" start --port "$PORT" >"$DATA_DIR/server.log" 2>&1 &
  local pid=$!
  for _ in $(seq 1 120); do
    if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
      echo "health ✓"
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      return 0
    fi
    sleep 1
  done
  echo "✗ server did not become healthy; log:"; cat "$DATA_DIR/server.log"
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  return 1
}
start_and_health
echo "== second start (data persisted across restart) =="
start_and_health
node "$CLI" provider list --json | grep -q "openai-smoke" \
  && echo "persisted across restart ✓" \
  || { echo "✗ provider not persisted across restart"; exit 1; }

echo ""
echo "✓ host smoke passed"
