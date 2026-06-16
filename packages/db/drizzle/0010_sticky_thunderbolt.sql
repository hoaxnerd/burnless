CREATE TYPE "public"."ai_turn_event_type" AS ENUM('user_message', 'assistant_step', 'tool_result', 'scenario', 'gate', 'turn_done', 'turn_error');--> statement-breakpoint
CREATE TABLE "ai_turn_events" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"seq" integer NOT NULL,
	"turn_id" text NOT NULL,
	"type" "ai_turn_event_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_turn_events" ADD CONSTRAINT "ai_turn_events_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_turn_events_conversation_seq_idx" ON "ai_turn_events" USING btree ("conversation_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_turn_events_open_gate_idx" ON "ai_turn_events" USING btree ("conversation_id") WHERE "ai_turn_events"."type" = 'gate' AND "ai_turn_events"."resolved_at" IS NULL;