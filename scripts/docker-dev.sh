#!/usr/bin/env bash
# ── Burnless local dev setup ──────────────────────────────────────────────────
# Start all Docker services and the Next.js dev server.
#
# Usage:
#   ./scripts/docker-dev.sh          # Start everything
#   ./scripts/docker-dev.sh --down   # Stop everything
#   ./scripts/docker-dev.sh --reset  # Stop, remove volumes, start fresh
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
log "Starting Docker services..."
docker compose up -d

# ── Wait for PostgreSQL ──────────────────────────────────────────────────────
log "Waiting for PostgreSQL..."
until docker compose exec postgres pg_isready -U burnless -q 2>/dev/null; do
  sleep 1
done
log "PostgreSQL is ready."

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
echo "  App:          http://localhost:3000"
echo "  PostgreSQL:   localhost:5432"
echo "  Redis:        localhost:6379"
echo "  Ollama API:   http://localhost:11434"
echo "  MeiliSearch:  http://localhost:7700"
echo "  Crawl4AI:     http://localhost:11235"
echo "  Mailpit UI:   http://localhost:8025"
echo "  Mailpit SMTP: localhost:1025"
echo ""

# ── Check Ollama model ───────────────────────────────────────────────────────
if docker compose exec ollama ollama list 2>/dev/null | grep -q "gemma3:12b"; then
  log "Ollama model gemma3:12b is ready."
else
  warn "Ollama model gemma3:12b is being pulled (may take a few minutes)."
  warn "Check progress: docker compose logs -f ollama-init"
fi

echo ""
log "Start the dev server: pnpm dev"
log "Start the cron worker: npx tsx scripts/cron-worker.ts"
