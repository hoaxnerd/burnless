-- Migration: Phase 1 Revenue schema additions
-- Adds marketplace/ecommerce/hardware enum values to revenue_stream_type
-- and startDate/endDate columns + active index to revenue_streams.

-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction in Postgres.
-- Each statement is separated by a statement-breakpoint so the runner executes
-- them individually (Drizzle's PGLite test runner splits on this marker).

ALTER TYPE "revenue_stream_type" ADD VALUE 'marketplace';
--> statement-breakpoint
ALTER TYPE "revenue_stream_type" ADD VALUE 'ecommerce';
--> statement-breakpoint
ALTER TYPE "revenue_stream_type" ADD VALUE 'hardware';
--> statement-breakpoint
ALTER TABLE "revenue_streams" ADD COLUMN "start_date" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "revenue_streams" ADD COLUMN "end_date" timestamp;
--> statement-breakpoint
CREATE INDEX "revenue_streams_active_idx" ON "revenue_streams" ("company_id", "start_date", "end_date");
