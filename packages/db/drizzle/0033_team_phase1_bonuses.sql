-- Migration: Team Phase 1 — bonuses table
-- See docs/superpowers/plans/2026-04-30-data-entry-phase-1-team-completion.md §1.1, §1.2

CREATE TYPE "bonus_type" AS ENUM ('signing', 'performance', 'retention', 'other');
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "bonuses" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "headcount_id" text NOT NULL REFERENCES "headcount_plans"("id") ON DELETE CASCADE,
  "payout_month" timestamp NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "type" "bonus_type" NOT NULL DEFAULT 'performance',
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "bonuses_company_idx" ON "bonuses" ("company_id");
--> statement-breakpoint
CREATE INDEX "bonuses_headcount_month_idx" ON "bonuses" ("headcount_id", "payout_month");
