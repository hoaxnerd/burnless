CREATE TYPE "public"."account_category" AS ENUM('revenue', 'cogs', 'operating_expense', 'other_income', 'other_expense', 'asset', 'liability', 'equity');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('income', 'expense', 'asset', 'liability', 'equity');--> statement-breakpoint
CREATE TYPE "public"."ai_data_mode" AS ENUM('full', 'show_cached', 'hide_all');--> statement-breakpoint
CREATE TYPE "public"."ai_insight_cache_type" AS ENUM('dashboard', 'revenue', 'expense', 'scenario', 'funding', 'team', 'reports', 'general');--> statement-breakpoint
CREATE TYPE "public"."ai_message_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."ai_pending_action_kind" AS ENUM('permission', 'input', 'plan');--> statement-breakpoint
CREATE TYPE "public"."ai_permission_mode" AS ENUM('ask', 'session', 'always');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_audit_log_status" AS ENUM('success', 'error', 'validation_error', 'pending_apply');--> statement-breakpoint
CREATE TYPE "public"."ai_tool_permission_decision" AS ENUM('auto', 'granted_once', 'granted_session', 'denied');--> statement-breakpoint
CREATE TYPE "public"."ai_write_mode" AS ENUM('full', 'confirm', 'read_only');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'import', 'rollback');--> statement-breakpoint
CREATE TYPE "public"."audit_entity_type" AS ENUM('transaction', 'financial_account', 'scenario', 'forecast_line', 'forecast_value', 'headcount_plan', 'revenue_stream', 'funding_round', 'import_batch', 'department', 'metric', 'salary_change', 'bonus', 'equity_grant', 'funding_round_investor', 'share_class', 'option_pool');--> statement-breakpoint
CREATE TYPE "public"."bonus_type" AS ENUM('signing', 'performance', 'retention', 'other');--> statement-breakpoint
CREATE TYPE "public"."business_model" AS ENUM('saas', 'marketplace', 'ecommerce', 'services', 'hardware', 'other');--> statement-breakpoint
CREATE TYPE "public"."company_stage" AS ENUM('pre_seed', 'seed', 'series_a', 'series_b', 'series_c_plus', 'bootstrapped');--> statement-breakpoint
CREATE TYPE "public"."consent_purpose" AS ENUM('data_processing', 'ai_features', 'marketing', 'analytics');--> statement-breakpoint
CREATE TYPE "public"."dashboard_mode" AS ENUM('intelligence', 'dynamic', 'custom');--> statement-breakpoint
CREATE TYPE "public"."data_region" AS ENUM('us-east', 'eu-west', 'ap-south');--> statement-breakpoint
CREATE TYPE "public"."equity_grant_type" AS ENUM('iso', 'nso', 'rsu');--> statement-breakpoint
CREATE TYPE "public"."expense_frequency" AS ENUM('monthly', 'quarterly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."forecast_method" AS ENUM('fixed', 'growth_rate', 'per_unit', 'percentage_of', 'custom_formula');--> statement-breakpoint
CREATE TYPE "public"."funding_round_type" AS ENUM('pre_seed', 'seed', 'series_a', 'series_b', 'series_c_plus', 'debt', 'grant', 'safe', 'convertible');--> statement-breakpoint
CREATE TYPE "public"."headcount_employee_type" AS ENUM('full_time', 'part_time', 'contractor');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('pending', 'processing', 'completed', 'rolled_back', 'failed');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('active', 'disconnected', 'error');--> statement-breakpoint
CREATE TYPE "public"."integration_type" AS ENUM('quickbooks', 'xero', 'freshbooks', 'plaid', 'mercury', 'gusto', 'stripe');--> statement-breakpoint
CREATE TYPE "public"."invite_code_type" AS ENUM('single_use', 'multi_use');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."metric_category" AS ENUM('financial', 'saas', 'growth', 'efficiency', 'custom');--> statement-breakpoint
CREATE TYPE "public"."quick_action_mode" AS ENUM('intelligence', 'dynamic', 'custom');--> statement-breakpoint
CREATE TYPE "public"."revenue_stream_type" AS ENUM('subscription', 'one_time', 'usage_based', 'services', 'marketplace', 'ecommerce', 'hardware');--> statement-breakpoint
CREATE TYPE "public"."scenario_override_action" AS ENUM('create', 'modify', 'delete');--> statement-breakpoint
CREATE TYPE "public"."scenario_source" AS ENUM('blank', 'ai', 'template', 'clone', 'backup');--> statement-breakpoint
CREATE TYPE "public"."scenario_status" AS ENUM('active', 'promoted', 'archived');--> statement-breakpoint
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
	"session_grants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_feature_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"master_enabled" boolean DEFAULT true NOT NULL,
	"data_mode" "ai_data_mode" DEFAULT 'full' NOT NULL,
	"monthly_budget_cents" integer DEFAULT 5000 NOT NULL,
	"features" jsonb DEFAULT '{"onboarding":true,"chat":true,"insights":true,"uiPersonalization":true,"autoCategorization":true,"weeklyDigest":true}'::jsonb NOT NULL,
	"write_mode" "ai_write_mode" DEFAULT 'confirm' NOT NULL,
	"companion_name" text DEFAULT 'Companion' NOT NULL,
	"byok_enabled" boolean DEFAULT false NOT NULL,
	"ai_provider" text,
	"ai_api_key" text,
	"ai_model" text,
	"ai_base_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_insight_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"type" "ai_insight_cache_type" NOT NULL,
	"key" text NOT NULL,
	"content" jsonb NOT NULL,
	"expires_at" timestamp,
	"stale_at" timestamp,
	"stale_reason" text,
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
CREATE TABLE "ai_pending_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"pause_id" text NOT NULL,
	"kind" "ai_pending_action_kind" DEFAULT 'permission' NOT NULL,
	"scenario_id" text NOT NULL,
	"write_scenario_id" text,
	"assistant_blocks" jsonb NOT NULL,
	"completed_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pending" jsonb NOT NULL,
	"timeline" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ai_permission_defaults" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"read_mode" "ai_permission_mode" DEFAULT 'always' NOT NULL,
	"write_mode" "ai_permission_mode" DEFAULT 'ask' NOT NULL,
	"delete_mode" "ai_permission_mode" DEFAULT 'ask' NOT NULL,
	"web_search_mode" "ai_permission_mode" DEFAULT 'always' NOT NULL,
	"browser_use_mode" "ai_permission_mode" DEFAULT 'ask' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_tool_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text,
	"tool_name" text NOT NULL,
	"input" jsonb NOT NULL,
	"status" "ai_tool_audit_log_status" NOT NULL,
	"permission_decision" "ai_tool_permission_decision",
	"result" jsonb,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"feature" text NOT NULL,
	"tier" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"estimated_cost_micros" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bonuses" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"headcount_id" text NOT NULL,
	"payout_month" timestamp NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"type" "bonus_type" DEFAULT 'performance' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"locale" text DEFAULT 'en-US' NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"region" "data_region" DEFAULT 'us-east' NOT NULL,
	"owner_id" text NOT NULL,
	"billing_provider" text,
	"billing_customer_id" text,
	"billing_subscription_id" text,
	"billing_plan" text DEFAULT 'free',
	"benefits_rates" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"founders_ownership_percent" numeric(7, 4) DEFAULT '100.0000' NOT NULL,
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
CREATE TABLE "dashboard_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"mode" "dashboard_mode" DEFAULT 'dynamic' NOT NULL,
	"hero_cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secondary_metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"card_mode_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"card_scenario_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"custom_slug_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"slot_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"layout" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"closed_widgets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"page_layouts" jsonb DEFAULT '{}'::jsonb NOT NULL,
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
CREATE TABLE "equity_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"headcount_id" text NOT NULL,
	"grant_date" timestamp NOT NULL,
	"shares" numeric(18, 4) NOT NULL,
	"strike_price" numeric(18, 4),
	"grant_type" "equity_grant_type" DEFAULT 'iso' NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"user_id" text NOT NULL,
	"export_type" text NOT NULL,
	"format" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
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
	"covers_headcount" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"user_id" text NOT NULL,
	"entity_type" "audit_entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"changes" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"account_id" text NOT NULL,
	"method" "forecast_method" DEFAULT 'fixed' NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"notes" text,
	"vendor" text,
	"subcategory" text,
	"department_id" text,
	"frequency" "expense_frequency" DEFAULT 'monthly' NOT NULL,
	"is_one_time" boolean DEFAULT false NOT NULL,
	"is_recurring" boolean,
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
CREATE TABLE "funding_round_investors" (
	"id" text PRIMARY KEY NOT NULL,
	"funding_round_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"amount_invested" numeric(18, 2) NOT NULL,
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
	"dilution_percent" numeric(7, 4),
	"is_projected" boolean DEFAULT false NOT NULL,
	"close_date" timestamp,
	"notes" text,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "headcount_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"department_id" text NOT NULL,
	"title" text NOT NULL,
	"name" text,
	"employee_type" "headcount_employee_type" DEFAULT 'full_time' NOT NULL,
	"count" numeric(5, 2) DEFAULT '1.00' NOT NULL,
	"salary" numeric(12, 2) NOT NULL,
	"hourly_rate" numeric(12, 2),
	"hours_per_week" numeric(5, 2),
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"benefits_rate" numeric(5, 4) DEFAULT '0.20' NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"file_name" text NOT NULL,
	"status" "import_batch_status" DEFAULT 'pending' NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"account_id" text,
	"column_mapping" jsonb,
	"errors" jsonb,
	"metadata" jsonb,
	"rolled_back_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insight_invalidations" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"insight_type" text NOT NULL,
	"mutation_source" text NOT NULL,
	"first_invalidated_at" timestamp DEFAULT now() NOT NULL,
	"last_mutation_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "merchant_category_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"merchant_pattern" text NOT NULL,
	"account_id" text NOT NULL,
	"category" "account_category" NOT NULL,
	"subcategory" text NOT NULL,
	"source" text DEFAULT 'user_override' NOT NULL,
	"override_count" integer DEFAULT 1 NOT NULL,
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
CREATE TABLE "option_pools" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"total_reserved" numeric(18, 0) NOT NULL,
	"refresh_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
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
CREATE TABLE "revenue_streams" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "revenue_stream_type" DEFAULT 'subscription' NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"start_date" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"headcount_id" text NOT NULL,
	"effective_date" timestamp NOT NULL,
	"new_salary" numeric(12, 2) NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" "scenario_override_action" NOT NULL,
	"data" jsonb,
	"original_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source" "scenario_source" DEFAULT 'blank' NOT NULL,
	"status" "scenario_status" DEFAULT 'active' NOT NULL,
	"color" text,
	"source_scenario_id" text,
	"ai_conversation_id" text,
	"promoted_at" timestamp,
	"auto_delete_at" timestamp,
	"deleted_at" timestamp,
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
CREATE TABLE "share_classes" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"total_authorized" numeric(18, 0) NOT NULL,
	"total_issued" numeric(18, 0) DEFAULT '0' NOT NULL,
	"par_value" numeric(18, 6) DEFAULT '0.000001' NOT NULL,
	"liquidation_preference" numeric(7, 4) DEFAULT '1.0000' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"account_id" text NOT NULL,
	"date" timestamp NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"description" text,
	"vendor" text,
	"notes" text,
	"source" "transaction_source" DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"import_batch_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"sidebar_order" jsonb,
	"quick_action_mode" "quick_action_mode" DEFAULT 'dynamic' NOT NULL,
	"quick_action_mode_overrides" jsonb,
	"custom_quick_actions" jsonb,
	"sidebar_collapsed" boolean DEFAULT false NOT NULL,
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
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"two_factor_secret" text,
	"two_factor_backup_codes" text,
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
CREATE TABLE "weekly_digests" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"week_start" timestamp NOT NULL,
	"metrics" jsonb NOT NULL,
	"narrative" text,
	"deterministic_summary" text NOT NULL,
	"email_sent_at" timestamp,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_feature_flags" ADD CONSTRAINT "ai_feature_flags_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insight_cache" ADD CONSTRAINT "ai_insight_cache_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_pending_actions" ADD CONSTRAINT "ai_pending_actions_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_permission_defaults" ADD CONSTRAINT "ai_permission_defaults_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_permission_defaults" ADD CONSTRAINT "ai_permission_defaults_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_audit_logs" ADD CONSTRAINT "ai_tool_audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_audit_logs" ADD CONSTRAINT "ai_tool_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_audit_logs" ADD CONSTRAINT "ai_tool_audit_logs_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_headcount_id_headcount_plans_id_fk" FOREIGN KEY ("headcount_id") REFERENCES "public"."headcount_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_preferences" ADD CONSTRAINT "dashboard_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_preferences" ADD CONSTRAINT "dashboard_preferences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equity_grants" ADD CONSTRAINT "equity_grants_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equity_grants" ADD CONSTRAINT "equity_grants_headcount_id_headcount_plans_id_fk" FOREIGN KEY ("headcount_id") REFERENCES "public"."headcount_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_logs" ADD CONSTRAINT "export_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_logs" ADD CONSTRAINT "export_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_audit_logs" ADD CONSTRAINT "financial_audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_audit_logs" ADD CONSTRAINT "financial_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_values" ADD CONSTRAINT "forecast_values_forecast_line_id_forecast_lines_id_fk" FOREIGN KEY ("forecast_line_id") REFERENCES "public"."forecast_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_round_investors" ADD CONSTRAINT "funding_round_investors_funding_round_id_funding_rounds_id_fk" FOREIGN KEY ("funding_round_id") REFERENCES "public"."funding_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_rounds" ADD CONSTRAINT "funding_rounds_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "headcount_plans" ADD CONSTRAINT "headcount_plans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "headcount_plans" ADD CONSTRAINT "headcount_plans_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_invalidations" ADD CONSTRAINT "insight_invalidations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_code_redemptions" ADD CONSTRAINT "invite_code_redemptions_invite_code_id_invite_codes_id_fk" FOREIGN KEY ("invite_code_id") REFERENCES "public"."invite_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_code_redemptions" ADD CONSTRAINT "invite_code_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_category_mappings" ADD CONSTRAINT "merchant_category_mappings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_category_mappings" ADD CONSTRAINT "merchant_category_mappings_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_pools" ADD CONSTRAINT "option_pools_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_consents" ADD CONSTRAINT "privacy_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_streams" ADD CONSTRAINT "revenue_streams_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_changes" ADD CONSTRAINT "salary_changes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_changes" ADD CONSTRAINT "salary_changes_headcount_id_headcount_plans_id_fk" FOREIGN KEY ("headcount_id") REFERENCES "public"."headcount_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_overrides" ADD CONSTRAINT "scenario_overrides_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_classes" ADD CONSTRAINT "share_classes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_digests" ADD CONSTRAINT "weekly_digests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_conversations_company_idx" ON "ai_conversations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ai_conversations_company_user_idx" ON "ai_conversations" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_feature_flags_company_idx" ON "ai_feature_flags" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ai_insight_cache_company_idx" ON "ai_insight_cache" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_insight_cache_company_key_idx" ON "ai_insight_cache" USING btree ("company_id","type","key");--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_created_idx" ON "ai_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_pending_actions_conversation_idx" ON "ai_pending_actions" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_pending_actions_active_idx" ON "ai_pending_actions" USING btree ("conversation_id") WHERE "ai_pending_actions"."resolved_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_permission_defaults_user_company_idx" ON "ai_permission_defaults" USING btree ("user_id","company_id");--> statement-breakpoint
CREATE INDEX "ai_tool_audit_company_idx" ON "ai_tool_audit_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ai_tool_audit_user_idx" ON "ai_tool_audit_logs" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "ai_tool_audit_created_idx" ON "ai_tool_audit_logs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_tool_audit_tool_idx" ON "ai_tool_audit_logs" USING btree ("company_id","tool_name");--> statement-breakpoint
CREATE INDEX "ai_tool_audit_conversation_idx" ON "ai_tool_audit_logs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "ai_usage_company_idx" ON "ai_usage_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "ai_usage_feature_idx" ON "ai_usage_logs" USING btree ("company_id","feature");--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage_logs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "bonuses_company_idx" ON "bonuses" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "bonuses_headcount_month_idx" ON "bonuses" USING btree ("headcount_id","payout_month");--> statement-breakpoint
CREATE UNIQUE INDEX "company_member_unique" ON "company_members" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "company_member_user_idx" ON "company_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_prefs_user_company_idx" ON "dashboard_preferences" USING btree ("user_id","company_id");--> statement-breakpoint
CREATE INDEX "departments_company_idx" ON "departments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "equity_grants_company_idx" ON "equity_grants" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "equity_grants_headcount_idx" ON "equity_grants" USING btree ("headcount_id");--> statement-breakpoint
CREATE INDEX "export_logs_company_idx" ON "export_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "export_logs_company_created_idx" ON "export_logs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "export_logs_user_idx" ON "export_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "financial_accounts_company_idx" ON "financial_accounts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "financial_accounts_parent_idx" ON "financial_accounts" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "financial_audit_company_idx" ON "financial_audit_logs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "financial_audit_entity_idx" ON "financial_audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "financial_audit_user_idx" ON "financial_audit_logs" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "financial_audit_created_idx" ON "financial_audit_logs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "forecast_lines_company_idx" ON "forecast_lines" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "forecast_lines_company_account_idx" ON "forecast_lines" USING btree ("company_id","account_id");--> statement-breakpoint
CREATE INDEX "forecast_lines_company_department_idx" ON "forecast_lines" USING btree ("company_id","department_id");--> statement-breakpoint
CREATE INDEX "forecast_lines_vendor_idx" ON "forecast_lines" USING btree ("company_id","vendor");--> statement-breakpoint
CREATE INDEX "forecast_values_line_idx" ON "forecast_values" USING btree ("forecast_line_id");--> statement-breakpoint
CREATE INDEX "forecast_values_month_idx" ON "forecast_values" USING btree ("month");--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_values_line_month_idx" ON "forecast_values" USING btree ("forecast_line_id","month");--> statement-breakpoint
CREATE INDEX "funding_round_investors_round_idx" ON "funding_round_investors" USING btree ("funding_round_id");--> statement-breakpoint
CREATE INDEX "funding_rounds_company_idx" ON "funding_rounds" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "headcount_plans_company_idx" ON "headcount_plans" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "headcount_plans_department_idx" ON "headcount_plans" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "import_batches_company_idx" ON "import_batches" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "import_batches_account_idx" ON "import_batches" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "insight_invalidations_company_type_idx" ON "insight_invalidations" USING btree ("company_id","insight_type");--> statement-breakpoint
CREATE INDEX "insight_invalidations_pending_idx" ON "insight_invalidations" USING btree ("processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_company_type_idx" ON "integrations" USING btree ("company_id","type");--> statement-breakpoint
CREATE INDEX "invite_redemptions_code_idx" ON "invite_code_redemptions" USING btree ("invite_code_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_redemptions_user_code_idx" ON "invite_code_redemptions" USING btree ("invite_code_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_codes_code_idx" ON "invite_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "invite_codes_created_by_idx" ON "invite_codes" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "invite_codes_active_idx" ON "invite_codes" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "merchant_mappings_company_idx" ON "merchant_category_mappings" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "merchant_mappings_pattern_idx" ON "merchant_category_mappings" USING btree ("merchant_pattern");--> statement-breakpoint
CREATE INDEX "merchant_mappings_account_idx" ON "merchant_category_mappings" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_mappings_company_pattern_idx" ON "merchant_category_mappings" USING btree ("company_id","merchant_pattern");--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_company_slug_idx" ON "metrics" USING btree ("company_id","slug");--> statement-breakpoint
CREATE INDEX "option_pools_company_idx" ON "option_pools" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "privacy_consents_user_idx" ON "privacy_consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "privacy_consents_user_purpose_idx" ON "privacy_consents" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "revenue_streams_company_idx" ON "revenue_streams" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "revenue_streams_active_idx" ON "revenue_streams" USING btree ("company_id","start_date","end_date");--> statement-breakpoint
CREATE INDEX "salary_changes_company_idx" ON "salary_changes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "salary_changes_headcount_date_idx" ON "salary_changes" USING btree ("headcount_id","effective_date");--> statement-breakpoint
CREATE UNIQUE INDEX "scenario_overrides_unique" ON "scenario_overrides" USING btree ("scenario_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "scenario_overrides_scenario_type" ON "scenario_overrides" USING btree ("scenario_id","entity_type");--> statement-breakpoint
CREATE INDEX "scenarios_company_idx" ON "scenarios" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "share_classes_company_idx" ON "share_classes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "transactions_company_date_idx" ON "transactions" USING btree ("company_id","date");--> statement-breakpoint
CREATE INDEX "transactions_account_idx" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_external_id_idx" ON "transactions" USING btree ("company_id","external_id");--> statement-breakpoint
CREATE INDEX "transactions_batch_idx" ON "transactions" USING btree ("import_batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_preferences_user_company_idx" ON "user_preferences" USING btree ("user_id","company_id");--> statement-breakpoint
CREATE INDEX "weekly_digests_company_idx" ON "weekly_digests" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_digests_company_week_idx" ON "weekly_digests" USING btree ("company_id","week_start");