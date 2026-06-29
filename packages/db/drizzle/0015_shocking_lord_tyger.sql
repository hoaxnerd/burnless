CREATE TABLE "competitor_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"competitor_id" text NOT NULL,
	"source_id" text NOT NULL,
	"snapshot_id" text NOT NULL,
	"company_id" text NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"change_type" text NOT NULL,
	"summary" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"severity" text DEFAULT 'info' NOT NULL,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"competitor_id" text NOT NULL,
	"source_id" text NOT NULL,
	"company_id" text NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"raw" text NOT NULL,
	"raw_hash" text NOT NULL,
	"structured" jsonb NOT NULL,
	"structured_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"competitor_id" text NOT NULL,
	"company_id" text NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"interval_hours" integer DEFAULT 168 NOT NULL,
	"last_run_at" timestamp,
	"last_status" text,
	"health_state" text DEFAULT 'ok' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competitor_changes" ADD CONSTRAINT "competitor_changes_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_changes" ADD CONSTRAINT "competitor_changes_source_id_competitor_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."competitor_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_changes" ADD CONSTRAINT "competitor_changes_snapshot_id_competitor_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."competitor_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_changes" ADD CONSTRAINT "competitor_changes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_snapshots" ADD CONSTRAINT "competitor_snapshots_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_snapshots" ADD CONSTRAINT "competitor_snapshots_source_id_competitor_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."competitor_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_snapshots" ADD CONSTRAINT "competitor_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_sources" ADD CONSTRAINT "competitor_sources_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_sources" ADD CONSTRAINT "competitor_sources_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competitor_changes_company_idx" ON "competitor_changes" USING btree ("company_id","detected_at");--> statement-breakpoint
CREATE INDEX "competitor_changes_competitor_idx" ON "competitor_changes" USING btree ("competitor_id");--> statement-breakpoint
CREATE INDEX "competitor_snapshots_source_idx" ON "competitor_snapshots" USING btree ("source_id","captured_at");--> statement-breakpoint
CREATE INDEX "competitor_sources_company_idx" ON "competitor_sources" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "competitor_sources_competitor_idx" ON "competitor_sources" USING btree ("competitor_id");--> statement-breakpoint
CREATE INDEX "competitors_company_idx" ON "competitors" USING btree ("company_id");