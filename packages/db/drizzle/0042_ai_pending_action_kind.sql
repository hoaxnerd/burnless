-- Add the pending-action kind discriminator (permission | input) for generative-UI input pauses.
CREATE TYPE "public"."ai_pending_action_kind" AS enum('permission', 'input');
--> statement-breakpoint
ALTER TABLE "ai_pending_actions" ADD COLUMN "kind" "ai_pending_action_kind" DEFAULT 'permission' NOT NULL;
