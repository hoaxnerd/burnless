CREATE TYPE "public"."consent_purpose" AS ENUM('data_processing', 'ai_features', 'marketing', 'analytics');--> statement-breakpoint
CREATE TABLE "privacy_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"purpose" "consent_purpose" NOT NULL,
	"granted" boolean NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "privacy_consents" ADD CONSTRAINT "privacy_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_consents_user_idx" ON "privacy_consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "privacy_consents_user_purpose_idx" ON "privacy_consents" USING btree ("user_id","purpose");