CREATE TYPE "public"."account_category" AS ENUM('revenue', 'cogs', 'operating_expense', 'other_income', 'other_expense', 'asset', 'liability', 'equity');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('income', 'expense', 'asset', 'liability', 'equity');--> statement-breakpoint
CREATE TYPE "public"."ai_message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."business_model" AS ENUM('saas', 'marketplace', 'ecommerce', 'services', 'hardware', 'other');--> statement-breakpoint
CREATE TYPE "public"."company_stage" AS ENUM('pre_seed', 'seed', 'series_a', 'series_b', 'series_c_plus', 'bootstrapped');--> statement-breakpoint
CREATE TYPE "public"."forecast_method" AS ENUM('fixed', 'growth_rate', 'per_unit', 'percentage_of', 'custom_formula');--> statement-breakpoint
CREATE TYPE "public"."funding_round_type" AS ENUM('pre_seed', 'seed', 'series_a', 'series_b', 'series_c_plus', 'debt', 'grant');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('active', 'disconnected', 'error');--> statement-breakpoint
CREATE TYPE "public"."integration_type" AS ENUM('quickbooks', 'xero', 'freshbooks', 'plaid', 'mercury', 'gusto', 'stripe');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."metric_category" AS ENUM('financial', 'saas', 'growth', 'efficiency', 'custom');--> statement-breakpoint
CREATE TYPE "public"."revenue_stream_type" AS ENUM('subscription', 'one_time', 'usage_based', 'services');--> statement-breakpoint
CREATE TYPE "public"."scenario_type" AS ENUM('base', 'best', 'worst', 'custom');--> statement-breakpoint
CREATE TYPE "public"."transaction_source" AS ENUM('manual', 'import', 'integration', 'forecast');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" "ai_message_role" NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"stage" "company_stage" DEFAULT 'pre_seed' NOT NULL,
	"business_model" "business_model" DEFAULT 'saas' NOT NULL,
	"industry" text,
	"founded_date" timestamp,
	"fiscal_year_end" integer DEFAULT 12 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"owner_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_plan" text DEFAULT 'free',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_members" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"category" "account_category" NOT NULL,
	"parent_id" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"account_id" text NOT NULL,
	"method" "forecast_method" DEFAULT 'fixed' NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_values" (
	"id" text PRIMARY KEY NOT NULL,
	"forecast_line_id" text NOT NULL,
	"month" timestamp NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"is_override" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "funding_round_type" NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"date" timestamp NOT NULL,
	"pre_money_valuation" numeric(18, 2),
	"dilution_percent" numeric(5, 4),
	"is_projected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "headcount_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"department_id" text NOT NULL,
	"title" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"salary" numeric(12, 2) NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"benefits_rate" numeric(5, 4) DEFAULT '0.20' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"type" "integration_type" NOT NULL,
	"status" "integration_status" DEFAULT 'active' NOT NULL,
	"last_sync_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"formula" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"category" "metric_category" DEFAULT 'financial' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenue_streams" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "revenue_stream_type" DEFAULT 'subscription' NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "scenario_type" DEFAULT 'base' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_budget" boolean DEFAULT false NOT NULL,
	"budget_locked_at" timestamp,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"account_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"description" text,
	"source" "transaction_source" DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"password_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_values" ADD CONSTRAINT "forecast_values_forecast_line_id_forecast_lines_id_fk" FOREIGN KEY ("forecast_line_id") REFERENCES "public"."forecast_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_rounds" ADD CONSTRAINT "funding_rounds_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "headcount_plans" ADD CONSTRAINT "headcount_plans_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "headcount_plans" ADD CONSTRAINT "headcount_plans_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_streams" ADD CONSTRAINT "revenue_streams_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversations_company_idx" ON "ai_conversations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_idx" ON "ai_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_member_unique" ON "company_members" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "financial_accounts_company_idx" ON "financial_accounts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "forecast_lines_scenario_idx" ON "forecast_lines" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "forecast_values_line_idx" ON "forecast_values" USING btree ("forecast_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_values_line_month_idx" ON "forecast_values" USING btree ("forecast_line_id","month");--> statement-breakpoint
CREATE INDEX "funding_rounds_company_idx" ON "funding_rounds" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "headcount_plans_scenario_idx" ON "headcount_plans" USING btree ("scenario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_company_type_idx" ON "integrations" USING btree ("company_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_company_slug_idx" ON "metrics" USING btree ("company_id","slug");--> statement-breakpoint
CREATE INDEX "revenue_streams_scenario_idx" ON "revenue_streams" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "scenarios_company_idx" ON "scenarios" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "transactions_company_date_idx" ON "transactions" USING btree ("company_id","date");--> statement-breakpoint
CREATE INDEX "transactions_account_idx" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_external_id_idx" ON "transactions" USING btree ("company_id","external_id");