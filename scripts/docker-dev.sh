#!/usr/bin/env bash
# ── Burnless local dev setup ──────────────────────────────────────────────────
# Start all Docker services and the Next.js dev server.
#
# Usage:
#   ./scripts/docker-dev.sh          # Start everything (uses host Ollama)
#   ./scripts/docker-dev.sh --down   # Stop everything
#   ./scripts/docker-dev.sh --reset  # Stop, remove volumes, start fresh
#   ./scripts/docker-dev.sh --ollama # Start with Docker Ollama (no host Ollama)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[burnless]${NC} $1"; }
warn() { echo -e "${YELLOW}[burnless]${NC} $1"; }

USE_DOCKER_OLLAMA=false

# ── Handle flags ──────────────────────────────────────────────────────────────
case "${1:-}" in
  --down)
    log "Stopping Docker services..."
    docker compose --profile ollama down 2>/dev/null || docker compose down
    exit 0
    ;;
  --reset)
    warn "Removing all Docker volumes and restarting..."
    docker compose --profile ollama down -v 2>/dev/null || docker compose down -v
    ;;
  --ollama)
    USE_DOCKER_OLLAMA=true
    ;;
esac

# ── Ensure .env exists ────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  log "No .env found — copying .env.docker as .env"
  cp .env.docker .env
fi

# ── Start Docker services ────────────────────────────────────────────────────
if [ "$USE_DOCKER_OLLAMA" = true ]; then
  log "Starting Docker services (with Docker Ollama)..."
  docker compose --profile ollama up -d
else
  log "Starting Docker services (using host Ollama)..."
  docker compose up -d
fi

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
echo "  Redis:            localhost:6379"
echo "  Mailpit UI:       http://localhost:8025"
echo "  Mailpit SMTP:     localhost:1025"

# ── Check Ollama availability ────────────────────────────────────────────────
if curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
  log "Ollama is running at localhost:11434"
  MODELS=$(curl -sf http://localhost:11434/api/tags 2>/dev/null | python3 -c "import sys,json; [print(f'    - {m[\"name\"]}') for m in json.load(sys.stdin).get('models',[])]" 2>/dev/null || echo "    (couldn't list models)")
  echo "$MODELS"
else
  if [ "$USE_DOCKER_OLLAMA" = true ]; then
    warn "Docker Ollama is starting up. Models being pulled..."
    warn "Check progress: docker compose logs -f ollama-init"
  else
    warn "No Ollama detected at localhost:11434."
    warn "Install Ollama (https://ollama.com) or use: ./scripts/docker-dev.sh --ollama"
  fi
fi

echo ""
log "Start the dev server: pnpm dev"
log "Start the cron worker: npx tsx scripts/cron-worker.ts"
