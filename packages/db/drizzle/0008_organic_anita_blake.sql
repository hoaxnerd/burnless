CREATE TYPE "public"."ai_api_key_mode" AS ENUM('managed', 'user_provided', 'none');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_kind" AS ENUM('anthropic', 'openai', 'openrouter', 'ollama', 'google', 'mistral', 'groq', 'openai-compatible');--> statement-breakpoint
CREATE TYPE "public"."ai_provider_model_source" AS ENUM('fetched', 'manual', 'preset');--> statement-breakpoint
CREATE TABLE "ai_provider_models" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"model_id" text NOT NULL,
	"display_name" text,
	"context_window" integer,
	"max_output_tokens" integer,
	"supports_tools" boolean,
	"supports_images" boolean,
	"source" "ai_provider_model_source" DEFAULT 'manual' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "ai_provider_kind" NOT NULL,
	"base_url" text,
	"api_key_encrypted" text,
	"api_key_mode" "ai_api_key_mode" DEFAULT 'user_provided' NOT NULL,
	"headers" jsonb,
	"drop_params" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_provider_models" ADD CONSTRAINT "ai_provider_models_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_provider_models_provider_idx" ON "ai_provider_models" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_provider_models_provider_model_idx" ON "ai_provider_models" USING btree ("provider_id","model_id");--> statement-breakpoint
CREATE INDEX "ai_providers_company_idx" ON "ai_providers" USING btree ("company_id");