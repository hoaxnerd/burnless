#!/usr/bin/env bash
# scripts/artifact/acceptance-env.sh — bring ONE acceptance environment up/down for the
# browser E2E (Task 10) and the matrix orchestrator (Task 11). Simulates download
# (checksum-verify) + install (extract / mount) + bootstrap + optional CLI AI creds +
# start (port-forwarded), printing a BASE_URL. Reads OPENROUTER_API_KEY from the repo .env
# for the `cli` cred-path; NEVER echoes it (env / stdin / docker -e only).
#
#   acceptance-env.sh up   <host|linux/arm64|linux/amd64> <cli|ui>
#   acceptance-env.sh down <host|linux/arm64|linux/amd64>
#
# IDEMPOTENCY (founder re-runs this at every release): `up` is safely re-runnable — it
# first tears down any prior run for the SAME env (kills the host pid + frees the port, or
# `docker rm -f` the deterministic-named container) and recreates a clean per-env run dir.
# `down` never errors if already down. Each env owns a deterministic container name
# (burnless-accept-<slug>) and a disposable run dir, so re-running never collides or
# duplicates state.
#
# Throwaway-env caveat: `--unsafe-expose` is used ONLY inside the disposable Docker
# container so the host browser can reach it via the published loopback port. It is NEVER
# the host-path default (host binds loopback directly).
set -euo pipefail

CMD="${1:?usage: acceptance-env.sh up|down <env> [cli|ui]}"
ENV_ID="${2:?env: host|linux/arm64|linux/amd64}"
CRED_PATH="${3:-ui}"

REPO="$PWD"
VER="$(node -e "console.log(require('./packages/cli/package.json').version)")"
TARBALL="dist-artifact/burnless-${VER}.tar.gz"
SLUG="$(printf '%s' "$ENV_ID" | tr '/' '-')"
RUN="dist-artifact/accept/$SLUG"
CONTAINER="burnless-accept-$SLUG"   # deterministic per-env name (idempotent docker rm -f)
case "$ENV_ID" in
  host)        HOSTPORT=2876 ;;
  linux/arm64) HOSTPORT=2877 ;;
  linux/amd64) HOSTPORT=2878 ;;
  *) echo "✗ unknown env $ENV_ID"; exit 1 ;;
esac
BASE_URL="http://127.0.0.1:$HOSTPORT"

# echoes the key to stdout for capture; callers must NOT log it.
read_openrouter_key() {
  grep -E '^OPENROUTER_API_KEY=' "$REPO/.env" | head -1 | cut -d= -f2- | tr -d '"'
}

wait_health() {
  for _ in $(seq 1 120); do
    curl -fsS "$BASE_URL/api/health" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

# --- idempotency helpers --------------------------------------------------------------

# Kill any prior host server: the recorded pid AND any straggler bound to the port.
# Runs entirely inside a guarded subshell so a killed child can never ripple a signal into
# this script (the `start` wrapper spawns a longer-lived next-server child whose process
# group is shared with the launching shell — killing it directly can otherwise tear down
# the caller). The subshell + `|| true` make the whole teardown unconditionally safe.
kill_host() {
  (
    if [ -f "$RUN/pid" ]; then
      kill "$(cat "$RUN/pid")" 2>/dev/null || true
    fi
    # Free the port regardless (a prior run may have died without cleaning its pidfile,
    # or the recorded pid was the short-lived CLI wrapper, not the listening next-server).
    local pids
    pids="$(lsof -ti "tcp:$HOSTPORT" 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      # shellcheck disable=SC2086
      kill $pids 2>/dev/null || true
      sleep 1
      pids="$(lsof -ti "tcp:$HOSTPORT" 2>/dev/null || true)"
      # shellcheck disable=SC2086
      [ -n "$pids" ] && { kill -9 $pids 2>/dev/null || true; }
    fi
  ) || true
  # Brief settle so the OS fully releases the port before we rebind.
  sleep 1
}

# Remove the deterministic-named container if present (no error if absent).
kill_container() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}

# --- up: host (direct, loopback) ------------------------------------------------------

up_host() {
  kill_host
  rm -rf "$RUN"; mkdir -p "$RUN/root"

  echo "== verify checksum (simulated download integrity) =="
  ( cd dist-artifact && shasum -a 256 -c "burnless-${VER}.tar.gz.sha256" )

  echo "== install (extract into clean per-env root) =="
  tar -xzf "$TARBALL" -C "$RUN/root"
  local CLI="$RUN/root/cli/index.js"

  # Isolated, throwaway data + config dirs. SECRETS_ENCRYPTION_KEY + AUTH_SECRET are
  # auto-provisioned by bootstrap into instance.env (BURNLESS_CONFIG_DIR) and persist
  # across restart — do NOT pre-set them (real first-run parity).
  export BURNLESS_DATA_DIR="$RUN/data"
  export BURNLESS_CONFIG_DIR="$RUN/config"
  export BURNLESS_DEPLOYMENT="self_host"

  echo "== bootstrap + 2a read-check =="
  node "$CLI" bootstrap
  node "$CLI" provider list --json >/dev/null

  if [ "$CRED_PATH" = "cli" ]; then
    echo "== CLI AI creds (OpenRouter; key from .env, not echoed) =="
    # The provider/key verbs need SECRETS_ENCRYPTION_KEY to encrypt the stored key, but
    # (unlike start/bootstrap) they do not source instance.env. bootstrap just provisioned
    # it there — load it so the encrypted write succeeds. (UI cred-path runs inside the
    # server, which already loads instance.env, so this is cli-path only.)
    set -a; . "$BURNLESS_CONFIG_DIR/instance.env"; set +a
    local K; K="$(read_openrouter_key)"
    [ -n "$K" ] || { echo "✗ OPENROUTER_API_KEY missing in .env"; exit 1; }
    node "$CLI" provider add openrouter --kind openrouter --base-url https://openrouter.ai/api/v1 --key-stdin <<<"$K"
    node "$CLI" model add openrouter openai/gpt-4o-mini
    node "$CLI" model default openrouter openai/gpt-4o-mini
    node "$CLI" provider default openrouter
    unset K
  fi

  echo "== start (host, loopback; marker auto-injects server entry) =="
  # Fully detach: close stdin, redirect out/err to the log, nohup + disown so the server
  # outlives this script and does NOT share its controlling terminal / fds. The recorded
  # pid is the CLI wrapper; the listening next-server is its child — `down`/`kill_host`
  # free the port by pid AND by port, covering both.
  nohup node "$CLI" start --port "$HOSTPORT" >"$RUN/server.log" 2>&1 </dev/null &
  echo $! >"$RUN/pid"
  disown 2>/dev/null || true
  wait_health || { echo "✗ unhealthy; log:"; cat "$RUN/server.log"; exit 1; }
  echo "BASE_URL=$BASE_URL"
}

# --- up: docker (Linux, -d + published loopback port) ---------------------------------

up_docker() {
  local platform="$1"
  kill_container
  rm -rf "$RUN"; mkdir -p "$RUN"

  echo "== verify checksum (simulated download integrity) =="
  ( cd dist-artifact && shasum -a 256 -c "burnless-${VER}.tar.gz.sha256" )

  # Build the optional -e for the key (passed via env, NOT argv-visible to `ps` inside).
  local KEYENV=()
  if [ "$CRED_PATH" = "cli" ]; then
    local K; K="$(read_openrouter_key)"
    [ -n "$K" ] || { echo "✗ OPENROUTER_API_KEY missing in .env"; exit 1; }
    KEYENV=(-e "OPENROUTER_API_KEY=$K"); unset K
  fi

  # Deterministic --name + reuse the already-pulled base image (no --pull). The entrypoint
  # extracts the mounted tarball, bootstraps (auto-provisions keys into /config),
  # optionally adds CLI creds, then starts exposed on 0.0.0.0 (loopback-published only).
  echo "== run container ($CONTAINER, $platform) =="
  docker run -d --name "$CONTAINER" --platform "$platform" \
    -p "127.0.0.1:$HOSTPORT:$HOSTPORT" \
    -e BURNLESS_DEPLOYMENT=self_host -e "BURNLESS_CRED_PATH=$CRED_PATH" -e "PORTV=$HOSTPORT" \
    ${KEYENV[@]+"${KEYENV[@]}"} \
    -v "$REPO/$TARBALL:/burnless.tgz:ro" \
    node:22-slim bash -c '
      set -e
      apt-get update -qq >/dev/null && apt-get install -y -qq curl >/dev/null
      mkdir -p /app && tar -xzf /burnless.tgz -C /app
      export BURNLESS_DATA_DIR=/data BURNLESS_CONFIG_DIR=/config
      node /app/cli/index.js bootstrap
      node /app/cli/index.js provider list --json >/dev/null
      if [ "$BURNLESS_CRED_PATH" = "cli" ]; then
        # provider/key verbs need SECRETS_ENCRYPTION_KEY (auto-provisioned into instance.env
        # by bootstrap) but do not source it themselves — load it for the encrypted write.
        set -a; . /config/instance.env; set +a
        printf "%s" "$OPENROUTER_API_KEY" | node /app/cli/index.js provider add openrouter --kind openrouter --base-url https://openrouter.ai/api/v1 --key-stdin
        node /app/cli/index.js model add openrouter openai/gpt-4o-mini
        node /app/cli/index.js model default openrouter openai/gpt-4o-mini
        node /app/cli/index.js provider default openrouter
      fi
      exec node /app/cli/index.js start --host 0.0.0.0 --port "$PORTV" --unsafe-expose
    ' >/dev/null

  wait_health || {
    echo "✗ unhealthy; docker logs ($CONTAINER):"
    docker logs "$CONTAINER" 2>&1 | tail -50
    exit 1
  }
  echo "BASE_URL=$BASE_URL"
}

# --- dispatch -------------------------------------------------------------------------

case "$CMD" in
  up)
    case "$ENV_ID" in
      host)    up_host ;;
      linux/*) up_docker "$ENV_ID" ;;
    esac
    ;;
  down)
    case "$ENV_ID" in
      host)    kill_host ;;
      linux/*) kill_container ;;
    esac
    rm -rf "$RUN"
    echo "down: $ENV_ID"
    ;;
  *) echo "✗ unknown command $CMD"; exit 1 ;;
esac
