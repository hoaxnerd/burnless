-- Migration: Team Phase 1 — equity_grants table
-- See docs/superpowers/plans/2026-04-30-data-entry-phase-1-team-completion.md §1.1, §1.2

CREATE TYPE "equity_grant_type" AS ENUM ('iso', 'nso', 'rsu');
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "equity_grants" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "headcount_id" text NOT NULL REFERENCES "headcount_plans"("id") ON DELETE CASCADE,
  "grant_date" timestamp NOT NULL,
  "shares" numeric(18, 4) NOT NULL,
  "strike_price" numeric(18, 4),
  "grant_type" "equity_grant_type" NOT NULL DEFAULT 'iso',
  "parameters" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "equity_grants_company_idx" ON "equity_grants" ("company_id");
--> statement-breakpoint
CREATE INDEX "equity_grants_headcount_idx" ON "equity_grants" ("headcount_id");
