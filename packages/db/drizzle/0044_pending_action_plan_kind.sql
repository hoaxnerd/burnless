-- Add the "plan" pause kind. PG ALTER TYPE ADD VALUE cannot run inside a tx block.
ALTER TYPE "ai_pending_action_kind" ADD VALUE IF NOT EXISTS 'plan';
