-- Explicit per-line expense category override (set in the expense form).
-- NULL = derive automatically. Non-null wins over deriveSubcategory().
--
-- NOTE: drizzle-kit generate is blocked by pre-existing malformed snapshot meta
-- (0017/0018 collision, 0041/0042 malformed), so this is hand-authored. Idempotent
-- (IF NOT EXISTS); applied by the PGLite test runner + dev db:push. Reconcile the
-- drizzle journal/meta before relying on prod db:migrate.
ALTER TABLE "forecast_lines" ADD COLUMN IF NOT EXISTS "subcategory" text;
