-- Create AI Permission Enums
CREATE TYPE "public"."ai_permission_mode" AS enum('ask', 'session', 'always');
--> statement-breakpoint
CREATE TYPE "public"."ai_tool_permission_decision" AS enum('auto', 'granted_once', 'granted_session', 'denied');
--> statement-breakpoint
-- Add sessionGrants to aiConversations
ALTER TABLE "ai_conversations" ADD COLUMN "session_grants" jsonb DEFAULT '{}' NOT NULL;
--> statement-breakpoint
-- Add permissionDecision to aiToolAuditLogs
ALTER TABLE "ai_tool_audit_logs" ADD COLUMN "permission_decision" "ai_tool_permission_decision";
--> statement-breakpoint
-- Create aiPermissionDefaults table
CREATE TABLE IF NOT EXISTS "ai_permission_defaults" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"read_mode" "ai_permission_mode" DEFAULT 'always' NOT NULL,
	"write_mode" "ai_permission_mode" DEFAULT 'ask' NOT NULL,
	"delete_mode" "ai_permission_mode" DEFAULT 'ask' NOT NULL,
	"web_search_mode" "ai_permission_mode" DEFAULT 'always' NOT NULL,
	"browser_use_mode" "ai_permission_mode" DEFAULT 'ask' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_permission_defaults_user_id_companies_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade,
	CONSTRAINT "ai_permission_defaults_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_permission_defaults_user_company_idx" ON "ai_permission_defaults" ("user_id","company_id");
--> statement-breakpoint
-- Create aiPendingActions table
CREATE TABLE IF NOT EXISTS "ai_pending_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"pause_id" text NOT NULL,
	"scenario_id" text NOT NULL,
	"assistant_blocks" jsonb NOT NULL,
	"completed_results" jsonb DEFAULT '[]' NOT NULL,
	"pending" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	CONSTRAINT "ai_pending_actions_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_pending_actions_conversation_idx" ON "ai_pending_actions" ("conversation_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_pending_actions_active_idx" ON "ai_pending_actions" ("conversation_id") WHERE "resolved_at" IS NULL;
