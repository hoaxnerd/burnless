CREATE TYPE "public"."ai_insight_cache_type" AS ENUM('dashboard', 'revenue', 'expense', 'scenario', 'general');--> statement-breakpoint
CREATE TABLE "ai_insight_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"type" "ai_insight_cache_type" NOT NULL,
	"key" text NOT NULL,
	"content" jsonb NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_insight_cache" ADD CONSTRAINT "ai_insight_cache_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_insight_cache_company_idx" ON "ai_insight_cache" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_insight_cache_company_key_idx" ON "ai_insight_cache" USING btree ("company_id","type","key");