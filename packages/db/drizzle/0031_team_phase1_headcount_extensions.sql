-- Migration: Team Phase 1 — companies.benefits_rates + headcount_plans extensions
-- See docs/superpowers/plans/2026-04-30-data-entry-phase-1-team-completion.md §1.1, §1.4

-- Step 1: New enum for headcount employee_type
CREATE TYPE "headcount_employee_type" AS ENUM ('full_time', 'part_time', 'contractor');
--> statement-breakpoint

-- Step 2: companies.benefits_rates JSONB (default '{}')
ALTER TABLE "companies"
  ADD COLUMN "benefits_rates" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint

-- Step 3: headcount_plans — add new columns
ALTER TABLE "headcount_plans" ADD COLUMN "name" text;
--> statement-breakpoint
ALTER TABLE "headcount_plans"
  ADD COLUMN "employee_type" "headcount_employee_type" NOT NULL DEFAULT 'full_time';
--> statement-breakpoint
ALTER TABLE "headcount_plans"
  ADD COLUMN "hourly_rate" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "headcount_plans"
  ADD COLUMN "hours_per_week" numeric(5, 2);
--> statement-breakpoint
ALTER TABLE "headcount_plans"
  ADD COLUMN "parameters" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint

-- Step 4: Widen count from integer to numeric(5,2) for fractional FTE
ALTER TABLE "headcount_plans"
  ALTER COLUMN "count" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "headcount_plans"
  ALTER COLUMN "count" TYPE numeric(5, 2) USING "count"::numeric(5, 2);
--> statement-breakpoint
ALTER TABLE "headcount_plans"
  ALTER COLUMN "count" SET DEFAULT '1.00';
--> statement-breakpoint
ALTER TABLE "headcount_plans"
  ALTER COLUMN "count" SET NOT NULL;
