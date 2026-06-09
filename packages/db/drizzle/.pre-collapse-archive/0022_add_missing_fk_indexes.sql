-- Add missing indexes on frequently-queried foreign key columns.
-- These were identified by the system architecture audit (BUR-291).

-- Auth tables: critical for session/account lookups
CREATE INDEX IF NOT EXISTS "accounts_user_idx" ON "accounts" ("user_id");
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" ("user_id");

-- AI conversations: API filters on (company_id, user_id) for chat history
CREATE INDEX IF NOT EXISTS "ai_conversations_company_user_idx" ON "ai_conversations" ("company_id", "user_id");

-- Import batches: queried by account during import flows
CREATE INDEX IF NOT EXISTS "import_batches_account_idx" ON "import_batches" ("account_id");

-- Headcount plans: department-level queries for org planning
CREATE INDEX IF NOT EXISTS "headcount_plans_department_idx" ON "headcount_plans" ("department_id");

-- AI tool audit: conversation-level audit log lookups
CREATE INDEX IF NOT EXISTS "ai_tool_audit_conversation_idx" ON "ai_tool_audit_logs" ("conversation_id");

-- Export logs: user export history
CREATE INDEX IF NOT EXISTS "export_logs_user_idx" ON "export_logs" ("user_id");

-- Merchant mappings: account-level category mapping queries
CREATE INDEX IF NOT EXISTS "merchant_mappings_account_idx" ON "merchant_category_mappings" ("account_id");
