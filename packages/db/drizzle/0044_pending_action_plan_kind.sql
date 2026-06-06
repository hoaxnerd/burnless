-- Add the "plan" pause kind to ai_pending_action_kind (worklog: agentic Gate→Stream).
-- A turn can now pause for plan approval (kind:"plan") in addition to permission/input.
--
-- NOTE: PG ALTER TYPE ADD VALUE cannot run inside a transaction block, and
-- drizzle-kit generate is currently blocked by pre-existing malformed snapshot
-- meta (0017/0018 collision, 0041/0042 malformed), so this migration is
-- hand-authored. It is idempotent (IF NOT EXISTS) and applied by the PGLite test
-- runner and dev db:push; reconcile the drizzle journal/meta separately before
-- relying on prod db:migrate.
ALTER TYPE "ai_pending_action_kind" ADD VALUE IF NOT EXISTS 'plan';
