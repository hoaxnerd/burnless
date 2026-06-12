ALTER TABLE "ai_conversations" ADD COLUMN "session_disabled_tools" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "disabled_builtin_tools" jsonb;