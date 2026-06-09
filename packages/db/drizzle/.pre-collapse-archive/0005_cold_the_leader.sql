CREATE TABLE "ai_usage_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"feature" text NOT NULL,
	"tier" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"estimated_cost_micros" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_category_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"merchant_pattern" text NOT NULL,
	"account_id" text NOT NULL,
	"category" "account_category" NOT NULL,
	"subcategory" text NOT NULL,
	"source" text DEFAULT 'user_override' NOT NULL,
	"override_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_digests" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"week_start" timestamp NOT NULL,
	"metrics" jsonb NOT NULL,
	"narrative" text,
	"deterministic_summary" text NOT NULL,
	"email_sent_at" timestamp,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "ai_messages_conversation_idx";--> statement-breakpoint
ALTER TABLE "ai_feature_flags" ALTER COLUMN "features" SET DEFAULT '{"onboarding":true,"chat":true,"insights":true,"uiPersonalization":true,"autoCategorization":true,"weeklyDigest":true}'::jsonb;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "billing_provider" text;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_category_mappings" ADD CONSTRAINT "merchant_category_mappings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_category_mappings" ADD CONSTRAINT "merchant_category_mappings_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_digests" ADD CONSTRAINT "weekly_digests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_company_idx" ON "ai_usage_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ai_usage_feature_idx" ON "ai_usage_logs" USING btree ("company_id","feature");--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage_logs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "merchant_mappings_company_idx" ON "merchant_category_mappings" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "merchant_mappings_pattern_idx" ON "merchant_category_mappings" USING btree ("merchant_pattern");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_mappings_company_pattern_idx" ON "merchant_category_mappings" USING btree ("company_id","merchant_pattern");--> statement-breakpoint
CREATE INDEX "weekly_digests_company_idx" ON "weekly_digests" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_digests_company_week_idx" ON "weekly_digests" USING btree ("company_id","week_start");--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_created_idx" ON "ai_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "financial_accounts_parent_idx" ON "financial_accounts" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_lines_scenario_account_idx" ON "forecast_lines" USING btree ("scenario_id","account_id");--> statement-breakpoint
CREATE INDEX "forecast_values_month_idx" ON "forecast_values" USING btree ("month");