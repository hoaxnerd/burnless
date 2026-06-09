CREATE TYPE "public"."ai_write_mode" AS ENUM('full', 'confirm', 'read_only');--> statement-breakpoint
CREATE TABLE "insight_invalidations" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"insight_type" text NOT NULL,
	"mutation_source" text NOT NULL,
	"first_invalidated_at" timestamp DEFAULT now() NOT NULL,
	"last_mutation_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_feature_flags" ADD COLUMN "write_mode" "ai_write_mode" DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "dashboard_preferences" ADD COLUMN "layout" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "quick_action_mode_overrides" jsonb;--> statement-breakpoint
ALTER TABLE "insight_invalidations" ADD CONSTRAINT "insight_invalidations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "insight_invalidations_company_type_idx" ON "insight_invalidations" USING btree ("company_id","insight_type");--> statement-breakpoint
CREATE INDEX "insight_invalidations_pending_idx" ON "insight_invalidations" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "company_member_user_idx" ON "company_members" USING btree ("user_id");