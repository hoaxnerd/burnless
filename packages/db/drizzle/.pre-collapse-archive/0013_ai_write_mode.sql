DO $$ BEGIN
  CREATE TYPE "ai_write_mode" AS ENUM ('full', 'confirm', 'read_only');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "ai_feature_flags" ADD COLUMN IF NOT EXISTS "write_mode" "ai_write_mode" NOT NULL DEFAULT 'full';
