ALTER TABLE "dashboard_preferences" ADD COLUMN "custom_slug_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;
