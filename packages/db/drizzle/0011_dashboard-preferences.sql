CREATE TYPE "public"."dashboard_mode" AS ENUM('intelligence', 'dynamic', 'custom');--> statement-breakpoint
CREATE TABLE "dashboard_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"mode" "dashboard_mode" DEFAULT 'dynamic' NOT NULL,
	"hero_cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secondary_metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"card_mode_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"card_scenario_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"custom_metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboard_preferences" ADD CONSTRAINT "dashboard_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_preferences" ADD CONSTRAINT "dashboard_preferences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_prefs_user_company_idx" ON "dashboard_preferences" USING btree ("user_id","company_id");