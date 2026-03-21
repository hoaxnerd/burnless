CREATE TYPE "public"."ai_tool_audit_log_status" AS ENUM('success', 'error', 'validation_error');--> statement-breakpoint
CREATE TABLE "ai_tool_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text,
	"tool_name" text NOT NULL,
	"input" jsonb NOT NULL,
	"status" "ai_tool_audit_log_status" NOT NULL,
	"result" jsonb,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_tool_audit_logs" ADD CONSTRAINT "ai_tool_audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_audit_logs" ADD CONSTRAINT "ai_tool_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_audit_logs" ADD CONSTRAINT "ai_tool_audit_logs_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_tool_audit_company_idx" ON "ai_tool_audit_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ai_tool_audit_user_idx" ON "ai_tool_audit_logs" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "ai_tool_audit_created_idx" ON "ai_tool_audit_logs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_tool_audit_tool_idx" ON "ai_tool_audit_logs" USING btree ("company_id","tool_name");