-- Worklog Plan 5: persist the accumulated worklog timeline on a paused turn so a
-- reload (and the post-resume `done`) can reconstruct the full plan→gate→result
-- run, not just the post-Apply result. Plain nullable column; back-compat (old
-- rows stay NULL → client falls back to attachGate).
ALTER TABLE "ai_pending_actions" ADD COLUMN IF NOT EXISTS "timeline" jsonb;
