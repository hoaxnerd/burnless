-- Activate the diff-gate by default: the agentic surface defaults to confirm.
-- writeMode was plumbed-but-dead, so existing 'full' rows are the column default
-- nobody chose — backfill them to 'confirm'. read_only is an intentional choice,
-- preserved. New rows default to 'confirm'.
ALTER TABLE "ai_feature_flags" ALTER COLUMN "write_mode" SET DEFAULT 'confirm';
UPDATE "ai_feature_flags" SET "write_mode" = 'confirm' WHERE "write_mode" = 'full';
