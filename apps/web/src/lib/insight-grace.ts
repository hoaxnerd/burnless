/**
 * Insight auto-regen grace period — the sliding window after a financial data change
 * before insights auto-regenerate.
 *
 * Lives in its own leaf module (NO imports) so CLIENT components can read the constant
 * without pulling in `data-mutation-tracker` → `redis` (ioredis, Node-only). Importing
 * the tracker into the client bundle breaks the build with "Can't resolve 'dns'"
 * (see CLAUDE.md: do NOT load redis in the Edge/client runtime).
 */
export const MUTATION_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes
