CREATE TYPE "public"."invite_code_type" AS ENUM('single_use', 'multi_use');--> statement-breakpoint
CREATE TABLE "invite_code_redemptions" (
	"id" text PRIMARY KEY NOT NULL,
	"invite_code_id" text NOT NULL,
	"user_id" text NOT NULL,
	"redeemed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"type" "invite_code_type" DEFAULT 'single_use' NOT NULL,
	"max_redemptions" integer DEFAULT 1 NOT NULL,
	"current_redemptions" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp,
	"free_platform_days" integer DEFAULT 30 NOT NULL,
	"ai_credits_cents" integer DEFAULT 5000 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invite_code_redemptions" ADD CONSTRAINT "invite_code_redemptions_invite_code_id_invite_codes_id_fk" FOREIGN KEY ("invite_code_id") REFERENCES "public"."invite_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_code_redemptions" ADD CONSTRAINT "invite_code_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invite_redemptions_code_idx" ON "invite_code_redemptions" USING btree ("invite_code_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_redemptions_user_code_idx" ON "invite_code_redemptions" USING btree ("invite_code_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_codes_code_idx" ON "invite_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "invite_codes_created_by_idx" ON "invite_codes" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "invite_codes_active_idx" ON "invite_codes" USING btree ("is_active");