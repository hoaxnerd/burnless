#!/usr/bin/env bash
# scripts/artifact/acceptance-matrix.sh — full-matrix E2E: host + linux/arm64 + linux/amd64.
# Per env: up (verify→install→bootstrap→[cli creds]→start) → browser E2E (Task 10) → down.
#
# COVERAGE-GUARANTEED randomization: each env is assigned a (cred-path ∈ {cli,ui},
# action ∈ {chat,revenue,settings}) such that BOTH cred-paths appear ≥1 and the three
# actions spread across the envs. The chosen plan + seed are printed; seedable via
# BURNLESS_ACCEPT_SEED for reproducibility.
#
# Requires a prior `pnpm build:artifact` (a staged + tarballed artifact). Reads
# OPENROUTER_API_KEY from .env (the chat action does a real round-trip); the founder
# rotates the key after. The key is NEVER echoed.
#
# linux/amd64 runs under qemu emulation (slow). It is BEST-EFFORT in constrained
# sandboxes: set BURNLESS_SKIP_AMD64=1 to skip JUST amd64 — the run then clearly LOGS
# that amd64 was skipped + why (it never silently claims a pass). host + linux/arm64
# always run fully. The founder re-runs the complete matrix at release.
set -euo pipefail

STAGE="${BURNLESS_ARTIFACT_STAGE:-dist-artifact/stage}"
[ -d "$STAGE" ] || { echo "✗ no stage — run pnpm build:artifact first"; exit 1; }
OPENROUTER_API_KEY="$(grep -E '^OPENROUTER_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d '"')"
[ -n "$OPENROUTER_API_KEY" ] || { echo "✗ OPENROUTER_API_KEY missing in .env"; exit 1; }
export OPENROUTER_API_KEY
# Use the web package's Playwright binary explicitly: the `test` runner lives in
# `@playwright/test` (installed under apps/web), while a bare `npx playwright` from the repo
# root can resolve `playwright-core`'s CLI, which has no `test` command ("unknown command
# 'test'"). Invoke the binary directly (not via `pnpm exec`, which would cwd into apps/web
# and double the repo-relative config path) so it runs from the repo root and the
# `apps/web/...` config path resolves.
PW="apps/web/node_modules/.bin/playwright"
[ -x "$PW" ] || { echo "✗ $PW missing — run pnpm install"; exit 1; }
"$PW" install chromium >/dev/null 2>&1 || true

SEED="${BURNLESS_ACCEPT_SEED:-$RANDOM}"
echo "matrix seed: $SEED   (override with BURNLESS_ACCEPT_SEED=<n> to reproduce)"
# Deterministic-from-seed assignment with guaranteed coverage:
#   cred-paths: a permutation of (cli ui ui) → always ≥1 cli AND ≥1 ui across the 3 envs.
#   actions:    a permutation of (chat revenue settings) → all three spread, ≥1 chat.
# Portable to bash 3.2 (macOS default — no `mapfile`/`readarray`): read newline-separated
# awk output into an array via a `while read` loop.
read_into() { # read_into ARRNAME < <(producer)
  local __name="$1" __line
  eval "$__name=()"
  while IFS= read -r __line; do
    eval "$__name+=(\"\$__line\")"
  done
}
shuffle() { # shuffle <seed> ; reads items on stdin, prints a seeded permutation
  awk -v s="$1" 'BEGIN{srand(s)} {a[NR]=$0} END{for(i=NR;i>1;i--){j=int(rand()*i)+1; t=a[i];a[i]=a[j];a[j]=t} for(i=1;i<=NR;i++)print a[i]}'
}
read_into CREDS < <(printf 'cli\nui\nui\n' | shuffle "$SEED")
read_into ACTS  < <(printf 'chat\nrevenue\nsettings\n' | shuffle "$((SEED+1))")

ENVS=("host" "linux/arm64" "linux/amd64")
docker info >/dev/null 2>&1 || { echo "✗ Docker daemon down — needed for the Linux matrix"; exit 1; }

echo ""
echo "matrix plan:"
for i in "${!ENVS[@]}"; do
  printf '   %-12s cred=%-3s action=%s\n' "${ENVS[$i]}" "${CREDS[$i]}" "${ACTS[$i]}"
done

SKIP_AMD64="${BURNLESS_SKIP_AMD64:-0}"
PASS=()
SKIPPED=()
for i in "${!ENVS[@]}"; do
  ENV_ID="${ENVS[$i]}"; CRED="${CREDS[$i]}"; ACTION="${ACTS[$i]}"

  if [ "$ENV_ID" = "linux/amd64" ] && [ "$SKIP_AMD64" = "1" ]; then
    echo ""
    echo "########## $ENV_ID — SKIPPED ##########"
    echo "⊘ linux/amd64 skipped: BURNLESS_SKIP_AMD64=1 (qemu emulation impractically slow in"
    echo "  this sandbox). NOT claimed as passed. Founder re-runs the full matrix at release."
    SKIPPED+=("$ENV_ID:$CRED:$ACTION (BURNLESS_SKIP_AMD64=1, qemu too slow)")
    continue
  fi

  echo ""
  echo "########## $ENV_ID  cred=$CRED  action=$ACTION ##########"
  BASE="$(bash scripts/artifact/acceptance-env.sh up "$ENV_ID" "$CRED" | sed -n 's/^BASE_URL=//p')"
  [ -n "$BASE" ] || { echo "✗ $ENV_ID failed to come up"; bash scripts/artifact/acceptance-env.sh down "$ENV_ID"; exit 1; }
  if BASE_URL="$BASE" BURNLESS_CRED_PATH="$CRED" BURNLESS_E2E_ACTION="$ACTION" \
       "$PW" test --config apps/web/playwright.artifact.config.ts; then
    PASS+=("$ENV_ID:$CRED:$ACTION ✓")
  else
    echo "✗ E2E failed on $ENV_ID"; bash scripts/artifact/acceptance-env.sh down "$ENV_ID"; exit 1
  fi
  bash scripts/artifact/acceptance-env.sh down "$ENV_ID"
done

echo ""
echo "✓✓ full-matrix E2E passed:"; printf '   %s\n' "${PASS[@]}"
if [ "${#SKIPPED[@]}" -gt 0 ]; then
  echo ""
  echo "⊘ skipped (NOT passed — re-run at release):"; printf '   %s\n' "${SKIPPED[@]}"
fi
