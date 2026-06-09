-- Audit status for a plan-mode tool execution (diff computed, not yet committed).
--
-- NOTE: PG ALTER TYPE ADD VALUE cannot run inside a transaction block.
-- drizzle-kit generate is currently blocked by pre-existing malformed snapshot
-- meta; this migration is hand-authored. It is idempotent (IF NOT EXISTS) and
-- applied by the PGLite test runner and dev db:push.
ALTER TYPE "ai_tool_audit_log_status" ADD VALUE IF NOT EXISTS 'pending_apply';
