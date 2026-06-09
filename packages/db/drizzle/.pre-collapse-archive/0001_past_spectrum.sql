CREATE TYPE "public"."ai_data_mode" AS ENUM('full', 'show_cached', 'hide_all');--> statement-breakpoint
CREATE TABLE "ai_feature_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"master_enabled" boolean DEFAULT true NOT NULL,
	"data_mode" "ai_data_mode" DEFAULT 'full' NOT NULL,
	"features" jsonb DEFAULT '{"onboarding":true,"chat":true,"insights":true,"uiPersonalization":true,"autoCategorization":true}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_feature_flags" ADD CONSTRAINT "ai_feature_flags_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_feature_flags_company_idx" ON "ai_feature_flags" USING btree ("company_id");