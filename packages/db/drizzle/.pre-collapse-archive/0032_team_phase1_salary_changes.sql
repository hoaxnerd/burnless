-- Migration: Team Phase 1 — salary_changes table
-- See docs/superpowers/plans/2026-04-30-data-entry-phase-1-team-completion.md §1.1, §1.2

CREATE TABLE IF NOT EXISTS "salary_changes" (
  "id" text PRIMARY KEY NOT NULL,
  "company_id" text NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "headcount_id" text NOT NULL REFERENCES "headcount_plans"("id") ON DELETE CASCADE,
  "effective_date" timestamp NOT NULL,
  "new_salary" numeric(12, 2) NOT NULL,
  "reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "salary_changes_company_idx" ON "salary_changes" ("company_id");
--> statement-breakpoint
CREATE INDEX "salary_changes_headcount_date_idx" ON "salary_changes" ("headcount_id", "effective_date");
