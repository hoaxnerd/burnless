-- Migration: Drop forecast_lines unique (company_id, account_id) constraint
-- Phase 1 §1.5 makes each forecast line an independent expense (vendor/notes/
-- department/frequency/isOneTime), so multiple lines per account are expected.
-- The unique index from earlier migrations blocks the consolidated form whenever
-- an account already has a forecast line. Replace with a non-unique index so
-- the (company_id, account_id) lookup pattern stays cheap.

DROP INDEX IF EXISTS "forecast_lines_company_account_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "forecast_lines_company_account_idx" ON "forecast_lines" ("company_id", "account_id");
