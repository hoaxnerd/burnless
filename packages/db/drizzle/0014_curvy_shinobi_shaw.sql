CREATE TABLE "integration_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"integration_type" "integration_type" NOT NULL,
	"secret" text NOT NULL,
	"livemode" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_credentials_company_type_idx" ON "integration_credentials" USING btree ("company_id","integration_type");