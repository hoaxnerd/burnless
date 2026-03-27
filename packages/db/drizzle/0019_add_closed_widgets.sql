ALTER TABLE "dashboard_preferences" ADD COLUMN "closed_widgets" jsonb DEFAULT '[]'::jsonb NOT NULL;
