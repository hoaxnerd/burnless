ALTER TABLE "dashboard_preferences" ADD COLUMN IF NOT EXISTS "slot_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;
