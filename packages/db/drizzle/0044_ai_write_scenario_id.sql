-- AI-01: base-view AI writes must hit base tables, not the Base-Case overlay.
-- Adds a nullable write-target column distinct from scenario_id (the read-context
-- scenario persisted for resume). NULL = base view → the tool handler writes to
-- base tables; a non-null id targets that scenario's overlay.
--
-- NOTE: drizzle-kit generate is blocked by pre-existing malformed snapshot meta
-- (0017/0018 collision, 0041/0042 malformed), so this is hand-authored. Idempotent
-- (IF NOT EXISTS); applied by the PGLite test runner + dev db:push. Reconcile the
-- drizzle journal/meta before relying on prod db:migrate.
ALTER TABLE "ai_pending_actions" ADD COLUMN IF NOT EXISTS "write_scenario_id" text;
