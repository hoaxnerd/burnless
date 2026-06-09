CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'import', 'rollback');--> statement-breakpoint
CREATE TYPE "public"."audit_entity_type" AS ENUM('transaction', 'financial_account', 'scenario', 'forecast_line', 'forecast_value', 'headcount_plan', 'revenue_stream', 'funding_round', 'import_batch', 'department', 'metric');--> statement-breakpoint
CREATE TABLE "financial_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"user_id" text NOT NULL,
	"entity_type" "audit_entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"changes" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_audit_logs" ADD CONSTRAINT "financial_audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_audit_logs" ADD CONSTRAINT "financial_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_audit_company_idx" ON "financial_audit_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "financial_audit_entity_idx" ON "financial_audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "financial_audit_user_idx" ON "financial_audit_logs" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "financial_audit_created_idx" ON "financial_audit_logs" USING btree ("company_id","created_at");