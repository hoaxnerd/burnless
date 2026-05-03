-- Migration: Phase 1 Expenses schema additions
-- Adds expense_frequency enum, notes/vendor/department_id/frequency/is_one_time/is_recurring
-- columns + supporting indexes to forecast_lines, and vendor/notes columns to transactions.

-- NOTE: CREATE TYPE is wrapped in DO block so reruns / overlapping migrations don't fail.
DO $$ BEGIN
  CREATE TYPE "expense_frequency" AS ENUM ('monthly', 'quarterly', 'annual');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "forecast_lines" ADD COLUMN "notes" text;
--> statement-breakpoint
ALTER TABLE "forecast_lines" ADD COLUMN "vendor" text;
--> statement-breakpoint
ALTER TABLE "forecast_lines" ADD COLUMN "department_id" text;
--> statement-breakpoint
ALTER TABLE "forecast_lines" ADD COLUMN "frequency" "expense_frequency" DEFAULT 'monthly' NOT NULL;
--> statement-breakpoint
ALTER TABLE "forecast_lines" ADD COLUMN "is_one_time" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "forecast_lines" ADD COLUMN "is_recurring" boolean;
--> statement-breakpoint
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "forecast_lines_company_department_idx" ON "forecast_lines" ("company_id", "department_id");
--> statement-breakpoint
CREATE INDEX "forecast_lines_vendor_idx" ON "forecast_lines" ("company_id", "vendor");
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "vendor" text;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "notes" text;
