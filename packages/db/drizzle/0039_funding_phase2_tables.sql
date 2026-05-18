-- Phase 2 D §1.1: fundingRounds extensions
ALTER TABLE "funding_rounds" ADD COLUMN IF NOT EXISTS "close_date" timestamp;
ALTER TABLE "funding_rounds" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "funding_rounds" ADD COLUMN IF NOT EXISTS "parameters" jsonb NOT NULL DEFAULT '{}'::jsonb;

-- companies.foundersOwnershipPercent for cap-table baseline
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "founders_ownership_percent"
  numeric(7,4) NOT NULL DEFAULT 100.0000;

-- Junction: investors per round (read-through-only in scenarios per §1.2)
CREATE TABLE IF NOT EXISTS "funding_round_investors" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "funding_round_id" text NOT NULL REFERENCES "funding_rounds"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "email" text,
  "amount_invested" numeric(18,2) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "funding_round_investors_round_idx"
  ON "funding_round_investors" ("funding_round_id");

-- Share classes (companyId-scoped)
CREATE TABLE IF NOT EXISTS "share_classes" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "company_id" text NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "total_authorized" numeric(18,0) NOT NULL,
  "total_issued" numeric(18,0) NOT NULL DEFAULT 0,
  "par_value" numeric(18,6) NOT NULL DEFAULT 0.000001,
  "liquidation_preference" numeric(7,4) NOT NULL DEFAULT 1.0000,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "deleted_at" timestamp
);
CREATE INDEX IF NOT EXISTS "share_classes_company_idx"
  ON "share_classes" ("company_id");

-- Option pools (companyId-scoped)
CREATE TABLE IF NOT EXISTS "option_pools" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "company_id" text NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "total_reserved" numeric(18,0) NOT NULL,
  "refresh_date" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "deleted_at" timestamp
);
CREATE INDEX IF NOT EXISTS "option_pools_company_idx"
  ON "option_pools" ("company_id");
