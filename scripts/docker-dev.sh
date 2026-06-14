#!/usr/bin/env bash
# ── Burnless local dev setup ──────────────────────────────────────────────────
# Starts the dev Postgres (with pgvector), runs migrations, and prints next steps.
# AI uses your HOST Ollama at localhost:11434 (or set a cloud provider key in .env).
# Email uses the console provider in dev (logged to stdout — no SMTP service).
#
# Usage:
#   ./scripts/docker-dev.sh          # Start Postgres + migrate
#   ./scripts/docker-dev.sh --down   # Stop everything
#   ./scripts/docker-dev.sh --reset  # Stop, remove volumes, start fresh
#
# NOTE: standalone self-host needs NO Docker at all (embedded PGLite). This script
# is for monorepo development against a real Postgres.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[burnless]${NC} $1"; }
warn() { echo -e "${YELLOW}[burnless]${NC} $1"; }

# ── Handle flags ──────────────────────────────────────────────────────────────
case "${1:-}" in
  --down)
    log "Stopping Docker services..."
    docker compose down
    exit 0
    ;;
  --reset)
    warn "Removing all Docker volumes and restarting..."
    docker compose down -v
    ;;
esac

# ── Ensure .env exists ────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  log "No .env found — copying .env.docker as .env"
  cp .env.docker .env
fi

# ── Start Docker services ────────────────────────────────────────────────────
log "Starting Docker services (Postgres)..."
docker compose up -d

# ── Wait for PostgreSQL ──────────────────────────────────────────────────────
log "Waiting for PostgreSQL + pgvector..."
until docker compose exec postgres pg_isready -U burnless -q 2>/dev/null; do
  sleep 1
done
log "PostgreSQL is ready."

# ── Enable pgvector extension ────────────────────────────────────────────────
log "Enabling pgvector extension..."
docker compose exec postgres psql -U burnless -d burnless -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true

# ── Install dependencies ─────────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  log "Installing dependencies..."
  pnpm install
fi

# ── Run database migrations ──────────────────────────────────────────────────
log "Running database migrations..."
pnpm db:push

# ── Print service URLs ───────────────────────────────────────────────────────
echo ""
log "All services running:"
echo "  App:              http://localhost:3000"
echo "  PostgreSQL:       localhost:5432  (+ pgvector)"
echo "  Redis (optional): docker compose --profile cloud up -d  (cloud rate-limiter only)"
echo "  Email:            console provider (logged to stdout)"

# ── Check Ollama availability ────────────────────────────────────────────────
if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
  log "Ollama is running at localhost:11434"
  MODELS=$(curl -sf http://localhost:11434/api/tags 2>/dev/null | python3 -c "import sys,json; [print(f'    - {m[\"name\"]}') for m in json.load(sys.stdin).get('models',[])]" 2>/dev/null || echo "    (couldn't list models)")
  echo "$MODELS"
else
  warn "No Ollama detected at localhost:11434."
  warn "Install Ollama (https://ollama.com) and run: ollama pull gemma3:12b — or set a cloud provider key in .env."
fi

echo ""
log "Start the dev server: pnpm dev"
log "Start the cron worker: npx tsx scripts/cron-worker.ts"
