CREATE TYPE "public"."mcp_auth_type" AS ENUM('oauth', 'pat', 'none');--> statement-breakpoint
CREATE TYPE "public"."mcp_connection_status" AS ENUM('pending', 'connected', 'needs_auth', 'error', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."mcp_owner_scope" AS ENUM('company', 'personal');--> statement-breakpoint
CREATE TYPE "public"."mcp_tool_perm" AS ENUM('read', 'write', 'delete');--> statement-breakpoint
CREATE TYPE "public"."mcp_transport" AS ENUM('streamable_http', 'stdio');--> statement-breakpoint
CREATE TABLE "mcp_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"owner_scope" "mcp_owner_scope" DEFAULT 'company' NOT NULL,
	"owner_user_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"transport" "mcp_transport" NOT NULL,
	"endpoint" text NOT NULL,
	"args" jsonb,
	"env" jsonb,
	"auth_type" "mcp_auth_type" DEFAULT 'none' NOT NULL,
	"status" "mcp_connection_status" DEFAULT 'pending' NOT NULL,
	"capabilities" jsonb,
	"last_error" text,
	"last_connected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"mcp_connection_id" text NOT NULL,
	"auth_type" "mcp_auth_type" NOT NULL,
	"secret" text,
	"client_registration" jsonb,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_tool_prefs" (
	"id" text PRIMARY KEY NOT NULL,
	"mcp_connection_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"perm_class_override" "mcp_tool_perm",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_tool_audit_logs" ADD COLUMN "mcp_connection_id" text;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "disabled_mcp_connections" jsonb;--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_connections" ADD CONSTRAINT "mcp_connections_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_credentials" ADD CONSTRAINT "mcp_credentials_mcp_connection_id_mcp_connections_id_fk" FOREIGN KEY ("mcp_connection_id") REFERENCES "public"."mcp_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_tool_prefs" ADD CONSTRAINT "mcp_tool_prefs_mcp_connection_id_mcp_connections_id_fk" FOREIGN KEY ("mcp_connection_id") REFERENCES "public"."mcp_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_connections_company_idx" ON "mcp_connections" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "mcp_connections_owner_idx" ON "mcp_connections" USING btree ("company_id","owner_scope","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_connections_company_name_idx" ON "mcp_connections" USING btree ("company_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_connections_company_slug_idx" ON "mcp_connections" USING btree ("company_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_credentials_connection_idx" ON "mcp_credentials" USING btree ("mcp_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_tool_prefs_connection_tool_idx" ON "mcp_tool_prefs" USING btree ("mcp_connection_id","tool_name");--> statement-breakpoint
ALTER TABLE "ai_tool_audit_logs" ADD CONSTRAINT "ai_tool_audit_logs_mcp_connection_id_mcp_connections_id_fk" FOREIGN KEY ("mcp_connection_id") REFERENCES "public"."mcp_connections"("id") ON DELETE set null ON UPDATE no action;