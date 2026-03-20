CREATE TYPE "public"."data_region" AS ENUM('us-east', 'eu-west', 'ap-south');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('pending', 'processing', 'completed', 'rolled_back', 'failed');--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"file_name" text NOT NULL,
	"status" "import_batch_status" DEFAULT 'pending' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"account_id" text,
	"column_mapping" jsonb,
	"errors" jsonb,
	"metadata" jsonb,
	"rolled_back_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "locale" text DEFAULT 'en-US' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "timezone" text DEFAULT 'America/New_York' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "region" "data_region" DEFAULT 'us-east' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "import_batch_id" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batches_company_idx" ON "import_batches" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "transactions_batch_idx" ON "transactions" USING btree ("import_batch_id");