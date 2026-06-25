CREATE TABLE "memory" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"user_id" text,
	"domain" text NOT NULL,
	"kind" text NOT NULL,
	"tier" text NOT NULL,
	"label" text,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"metadata" jsonb,
	"read_only" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory" ADD CONSTRAINT "memory_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory" ADD CONSTRAINT "memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_company_idx" ON "memory" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "memory_company_domain_kind_idx" ON "memory" USING btree ("company_id","domain","kind");--> statement-breakpoint
CREATE INDEX "memory_company_tier_idx" ON "memory" USING btree ("company_id","tier");