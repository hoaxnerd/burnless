-- Migration: Scenario overlay system
-- Replace partitioned scenario model (scenarioId FK on entity tables)
-- with overlay model (single scenario_overrides table stores JSON diffs).

-- Step 1: Create new enum types
CREATE TYPE "scenario_source" AS ENUM ('blank', 'ai', 'template', 'clone', 'backup');
--> statement-breakpoint
CREATE TYPE "scenario_status" AS ENUM ('active', 'promoted', 'archived');
--> statement-breakpoint
CREATE TYPE "scenario_override_action" AS ENUM ('create', 'modify', 'delete');
--> statement-breakpoint

-- Step 2: Alter scenarios table — add new columns
ALTER TABLE "scenarios" ADD COLUMN "source" "scenario_source" NOT NULL DEFAULT 'blank';
--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "status" "scenario_status" NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "color" text;
--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "source_scenario_id" text;
--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "ai_conversation_id" text;
--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "promoted_at" timestamp;
--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN "auto_delete_at" timestamp;
--> statement-breakpoint

-- Step 3: Alter scenarios table — drop old columns
ALTER TABLE "scenarios" DROP COLUMN IF EXISTS "type";
--> statement-breakpoint
ALTER TABLE "scenarios" DROP COLUMN IF EXISTS "is_default";
--> statement-breakpoint
ALTER TABLE "scenarios" DROP COLUMN IF EXISTS "is_budget";
--> statement-breakpoint
ALTER TABLE "scenarios" DROP COLUMN IF EXISTS "budget_locked_at";
--> statement-breakpoint

-- Step 4: Drop old scenario_type enum (no longer used)
DROP TYPE IF EXISTS "scenario_type";
--> statement-breakpoint

-- Step 5: Create scenario_overrides table
CREATE TABLE IF NOT EXISTS "scenario_overrides" (
  "id" text PRIMARY KEY NOT NULL,
  "scenario_id" text NOT NULL REFERENCES "scenarios"("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "action" "scenario_override_action" NOT NULL,
  "data" jsonb,
  "original_data" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_overrides_unique" ON "scenario_overrides" ("scenario_id", "entity_type", "entity_id");
--> statement-breakpoint
CREATE INDEX "scenario_overrides_scenario_type" ON "scenario_overrides" ("scenario_id", "entity_type");
--> statement-breakpoint

-- Step 6: Add company_id to forecast_lines (nullable initially)
ALTER TABLE "forecast_lines" ADD COLUMN "company_id" text;
--> statement-breakpoint

-- Populate company_id from scenarios.company_id via JOIN on scenario_id
UPDATE "forecast_lines" fl
SET "company_id" = s."company_id"
FROM "scenarios" s
WHERE fl."scenario_id" = s."id";
--> statement-breakpoint

-- Set company_id to NOT NULL
ALTER TABLE "forecast_lines" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint

-- Add FK constraint to companies
ALTER TABLE "forecast_lines"
  ADD CONSTRAINT "forecast_lines_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- Step 7: Add company_id to revenue_streams (nullable initially)
ALTER TABLE "revenue_streams" ADD COLUMN "company_id" text;
--> statement-breakpoint

-- Populate company_id from scenarios.company_id via JOIN on scenario_id
UPDATE "revenue_streams" rs
SET "company_id" = s."company_id"
FROM "scenarios" s
WHERE rs."scenario_id" = s."id";
--> statement-breakpoint

-- Set company_id to NOT NULL
ALTER TABLE "revenue_streams" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint

-- Add FK constraint to companies
ALTER TABLE "revenue_streams"
  ADD CONSTRAINT "revenue_streams_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- Step 8: Add company_id to headcount_plans (nullable initially)
ALTER TABLE "headcount_plans" ADD COLUMN "company_id" text;
--> statement-breakpoint

-- Populate company_id from scenarios.company_id via JOIN on scenario_id
UPDATE "headcount_plans" hp
SET "company_id" = s."company_id"
FROM "scenarios" s
WHERE hp."scenario_id" = s."id";
--> statement-breakpoint

-- Set company_id to NOT NULL
ALTER TABLE "headcount_plans" ALTER COLUMN "company_id" SET NOT NULL;
--> statement-breakpoint

-- Add FK constraint to companies
ALTER TABLE "headcount_plans"
  ADD CONSTRAINT "headcount_plans_company_id_companies_id_fk"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- Step 9: Data migration — move non-default scenario data to override rows.
-- For each non-default scenario, insert override rows for its forecast_lines,
-- revenue_streams, and headcount_plans as "create" actions (the scenario added them).
-- Default scenario data stays as the base rows.

-- Forecast lines from non-default scenarios → overrides
INSERT INTO "scenario_overrides" ("id", "scenario_id", "entity_type", "entity_id", "action", "data", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  fl."scenario_id",
  'forecast_line',
  fl."id",
  'create',
  jsonb_build_object(
    'accountId', fl."account_id",
    'method', fl."method",
    'parameters', fl."parameters",
    'startDate', fl."start_date",
    'endDate', fl."end_date"
  ),
  fl."created_at",
  fl."updated_at"
FROM "forecast_lines" fl
INNER JOIN "scenarios" s ON fl."scenario_id" = s."id"
WHERE s."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "scenarios" def
    WHERE def."company_id" = s."company_id"
      AND def."id" = s."id"
      AND def."name" = 'Base'
  );
--> statement-breakpoint

-- Revenue streams from non-default scenarios → overrides
INSERT INTO "scenario_overrides" ("id", "scenario_id", "entity_type", "entity_id", "action", "data", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  rs."scenario_id",
  'revenue_stream',
  rs."id",
  'create',
  jsonb_build_object(
    'name', rs."name",
    'type', rs."type",
    'parameters', rs."parameters"
  ),
  rs."created_at",
  rs."updated_at"
FROM "revenue_streams" rs
INNER JOIN "scenarios" s ON rs."scenario_id" = s."id"
WHERE s."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "scenarios" def
    WHERE def."company_id" = s."company_id"
      AND def."id" = s."id"
      AND def."name" = 'Base'
  );
--> statement-breakpoint

-- Headcount plans from non-default scenarios → overrides
INSERT INTO "scenario_overrides" ("id", "scenario_id", "entity_type", "entity_id", "action", "data", "created_at", "updated_at")
SELECT
  gen_random_uuid()::text,
  hp."scenario_id",
  'headcount_plan',
  hp."id",
  'create',
  jsonb_build_object(
    'departmentId', hp."department_id",
    'title', hp."title",
    'count', hp."count",
    'salary', hp."salary",
    'startDate', hp."start_date",
    'endDate', hp."end_date",
    'benefitsRate', hp."benefits_rate"
  ),
  hp."created_at",
  hp."updated_at"
FROM "headcount_plans" hp
INNER JOIN "scenarios" s ON hp."scenario_id" = s."id"
WHERE s."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "scenarios" def
    WHERE def."company_id" = s."company_id"
      AND def."id" = s."id"
      AND def."name" = 'Base'
  );
--> statement-breakpoint

-- Delete non-default-scenario rows from entity tables (now captured in overrides)
DELETE FROM "forecast_lines" fl
USING "scenarios" s
WHERE fl."scenario_id" = s."id"
  AND s."name" != 'Base';
--> statement-breakpoint

DELETE FROM "revenue_streams" rs
USING "scenarios" s
WHERE rs."scenario_id" = s."id"
  AND s."name" != 'Base';
--> statement-breakpoint

DELETE FROM "headcount_plans" hp
USING "scenarios" s
WHERE hp."scenario_id" = s."id"
  AND s."name" != 'Base';
--> statement-breakpoint

-- Step 10: Replace forecast_lines index and drop scenario_id columns
DROP INDEX IF EXISTS "forecast_lines_scenario_account_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "forecast_lines_scenario_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_lines_company_account_idx" ON "forecast_lines" ("company_id", "account_id");
--> statement-breakpoint
CREATE INDEX "forecast_lines_company_idx" ON "forecast_lines" ("company_id");
--> statement-breakpoint

-- Drop scenario_id from forecast_lines
ALTER TABLE "forecast_lines" DROP COLUMN IF EXISTS "scenario_id";
--> statement-breakpoint

-- Drop scenario indexes and scenario_id from revenue_streams
DROP INDEX IF EXISTS "revenue_streams_scenario_idx";
--> statement-breakpoint
CREATE INDEX "revenue_streams_company_idx" ON "revenue_streams" ("company_id");
--> statement-breakpoint
ALTER TABLE "revenue_streams" DROP COLUMN IF EXISTS "scenario_id";
--> statement-breakpoint

-- Drop scenario indexes and scenario_id from headcount_plans
DROP INDEX IF EXISTS "headcount_plans_scenario_idx";
--> statement-breakpoint
CREATE INDEX "headcount_plans_company_idx" ON "headcount_plans" ("company_id");
--> statement-breakpoint
ALTER TABLE "headcount_plans" DROP COLUMN IF EXISTS "scenario_id";
