ALTER TABLE "ai_insight_cache" ADD COLUMN "stale_at" timestamp;
ALTER TABLE "ai_insight_cache" ADD COLUMN "stale_reason" text;
