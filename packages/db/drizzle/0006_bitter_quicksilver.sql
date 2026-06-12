CREATE TYPE "public"."scheduled_job_action_kind" AS ENUM('write', 'notify');--> statement-breakpoint
CREATE TYPE "public"."scheduled_job_notify_policy" AS ENUM('smart', 'failures', 'every', 'off');--> statement-breakpoint
CREATE TYPE "public"."scheduled_job_run_status" AS ENUM('running', 'success', 'failed', 'missed');--> statement-breakpoint
CREATE TYPE "public"."scheduled_job_run_trigger" AS ENUM('schedule', 'manual', 'dry_run');--> statement-breakpoint
CREATE TYPE "public"."scheduled_job_status" AS ENUM('active', 'disabled', 'auto_disabled', 'error');--> statement-breakpoint
CREATE TABLE "scheduled_job_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"scheduled_job_id" text NOT NULL,
	"company_id" text NOT NULL,
	"status" "scheduled_job_run_status" NOT NULL,
	"trigger" "scheduled_job_run_trigger" NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"duration_ms" integer,
	"tokens_used" integer,
	"summary" text,
	"output" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "scheduled_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"action_kind" "scheduled_job_action_kind" NOT NULL,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bound_connection_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"schedule" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" "scheduled_job_status" DEFAULT 'active' NOT NULL,
	"notify_policy" "scheduled_job_notify_policy" DEFAULT 'smart' NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"last_run_cursor" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "ai_tool_audit_logs" ADD COLUMN "scheduled_job_run_id" text;--> statement-breakpoint
ALTER TABLE "scheduled_job_runs" ADD CONSTRAINT "scheduled_job_runs_scheduled_job_id_scheduled_jobs_id_fk" FOREIGN KEY ("scheduled_job_id") REFERENCES "public"."scheduled_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_job_runs" ADD CONSTRAINT "scheduled_job_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_job_runs_job_idx" ON "scheduled_job_runs" USING btree ("scheduled_job_id","started_at");--> statement-breakpoint
CREATE INDEX "scheduled_job_runs_company_idx" ON "scheduled_job_runs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_company_idx" ON "scheduled_jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "scheduled_jobs_due_idx" ON "scheduled_jobs" USING btree ("enabled","next_run_at");--> statement-breakpoint
ALTER TABLE "ai_tool_audit_logs" ADD CONSTRAINT "ai_tool_audit_logs_scheduled_job_run_id_scheduled_job_runs_id_fk" FOREIGN KEY ("scheduled_job_run_id") REFERENCES "public"."scheduled_job_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_tool_audit_scheduled_job_run_idx" ON "ai_tool_audit_logs" USING btree ("scheduled_job_run_id");