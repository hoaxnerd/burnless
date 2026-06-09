# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Style: caveman-compact. Skip filler. Built for AI consumption.

## Repo shape

Monorepo. pnpm workspaces + turbo. Node>=20, pnpm@10.26.1.

```
apps/web              → Next.js 15 app router, React 19, frontend + API routes + middleware
packages/db           → Drizzle ORM schema, queries, migrations, seed (postgres-js + pgvector)
packages/engine       → Pure TS financial calc lib. No DB. Decimal.js precision.
packages/ai           → Provider-agnostic LLM layer (Anthropic/OpenAI/OpenRouter/Ollama)
packages/types        → Shared TS types
packages/ui           → Shared React components
scripts/cron-worker.ts → Local cron runner (reads apps/web/vercel.json)
agents/               → product/eng role-play markdown specs (not code)
```

Workspace deps reference `workspace:*`. Never publish. All `private: true`.

## Commands

Root scripts (turbo-orchestrated):
- `pnpm dev` — all dev servers (web on :3000, auto-bumps port if busy)
- `pnpm build` / `pnpm lint` / `pnpm test` / `pnpm type-check`
- `pnpm check` — type-check + lint
- `pnpm db:push` — push schema (dev, no migration files)
- `pnpm db:generate` — generate migration SQL → `packages/db/drizzle/`
- `pnpm db:migrate` — run pending migrations
- `pnpm db:studio` — Drizzle Studio
- `pnpm db:seed` — Acme demo data (guarded vs prod, idempotent)
- `pnpm db:seed-test-accounts` — 3 fixed-UUID accounts, password `TestPass1`
- `pnpm e2e` / `pnpm e2e:ui` — Playwright (apps/web)
- `pnpm test:web` / `pnpm test:db` — per-package vitest
- `pnpm docker:up|down|dev|reset` — Postgres+Redis+SearXNG+Crawl4AI+Mailpit
- `pnpm cron:worker` — replaces Vercel Cron locally

Single test:
- `pnpm --filter @burnless/web vitest run path/to/file.test.ts`
- `pnpm --filter @burnless/db vitest run -t "test name"`
- `pnpm --filter @burnless/web test:e2e -- --grep "scenario overlay"`

Per-package work: `pnpm --filter @burnless/<pkg> <script>`.

## Big-picture architecture

### Data flow
```
DB (Postgres+Drizzle) → packages/db/queries → apps/web API routes → @burnless/engine compute
                                                                  → @burnless/ai chat/insights
                                                                  → React Server Components + SWR
```

### Three load-bearing concepts

**1. Scenarios = override overlay, not data fork.**
Real entities live in normal tables (`transactions`, `revenueStreams`, `forecastLines`, `headcountPlans`, `fundingRounds`). A scenario does NOT clone rows. It writes deltas to `scenarioOverrides` (keyed `(scenarioId, entityType, entityId)`, action ∈ create/modify/delete, data JSONB). Read path: `packages/db/src/queries/scenario-resolver.ts` → `getResolvedData()` merges base + overrides. Mutations validate dual-channel: `active-scenario-id` cookie AND `X-Scenario-Id` header must agree (else 409 ScenarioSafetyError) — see `apps/web/src/lib/scenario-middleware.ts`. **Single-source rule:** the `X-Scenario-Id` header is injected in exactly ONE place — `apiFetch` (`apps/web/src/lib/api-fetch.ts`), which derives it from the `active-scenario-id` cookie. NEVER set `X-Scenario-Id` manually in a component (e.g. from a server-rendered `scenarioId` prop or sessionStorage) — a second source drifts from the cookie (cookie deleted, scenario exited in another tab, stale SSR prop) and 409-locks the user out of editing. Guarded by `apps/web/src/__tests__/no-manual-scenario-header.test.ts`. Sibling pattern `ConfirmableError` (`apps/web/src/lib/confirmable-error.ts`) → 409 with `{ error, code, requiresConfirmation: true, details? }`; client re-submits with `?confirm=true`. First consumer: currency change after financial data exists. Promote = scenario→baseline (status `promoted`, soft-delete via `deletedAt`).

**2. Slot/metric registry = single source of truth for dashboard.**
`packages/engine/src/metric-registry.ts` defines all 60+ metrics: formula, deps (DAG), format, direction, tier, fallbacks. Optional `parentMetricId` (drill-down hierarchy) + `aiContext.include: 'parent_only'|'components_only'|'both'` (default `both`); helpers `getMetricChildren(slug)` / `getMetricAiInclude(slug)`. `slot-types.ts` defines stable card positions. Dashboard layout per user in `dashboardPreferences` (mode: intelligence/dynamic/custom; heroCards, slotOverrides, customMetrics JSONB). Render pipeline: `apps/web/src/lib/compute-dashboard.ts` (uses React.cache + unstable_cache w/ tags) → calls engine compute → `build-slot-metrics.ts` formats per slot → grid components. Currency-format metrics route through `@burnless/types.formatCurrency` at the caller (engine never formats currency — see Engine section).

**3. Forecast DAG.**
`forecastLines` (per account, method ∈ fixed/growth_rate/per_unit/percentage_of/custom_formula) → resolved via `packages/engine/src/dag.ts` (Kahn topo-sort, throws CircularDependencyError) → `forecastValues` (per line × month). `percentage_of` and `custom_formula` reference other lines. `formula.ts` = sandboxed mathjs, whitelisted fns, blocks `import`/`eval`/`process`/`__proto__`, supports time offset `Foo[-1]`.

### Multi-tenancy
Every business table scoped by `companyId` + indexed. Generic helpers in `packages/db/src/queries/crud.ts`: `findByIdForCompany`, `updateForCompany`, etc. API routes use `requireCompanyAccess()` → checks session + role (owner > admin > editor > viewer in `companyMembers`). Soft-delete pattern: `deletedAt IS NULL` filter (scenarios only).

### Auth
NextAuth v5 + Drizzle adapter, JWT sessions. Email/pw + GitHub + Google. 2FA: TOTP + backup codes (`apps/web/src/lib/two-factor.ts`, `/api/auth/two-factor/{setup,verify,disable,status}`). Password = bcrypt (`lib/password.ts`). Session claims: id/email/name/image/isEmailVerified.

### Middleware (`apps/web/src/middleware.ts`)
Tiered rate limit (in-mem sliding window keyed `IP:tier:pathGroup`): auth=5/min, chat=20/min, ai=10/min, import=5/min, mutation=30/min, read=100/min. CSRF via origin allowlist on mutations. Correlation ID `X-Request-Id`. Bypass: `/api/health`, NextAuth internals, webhooks.

### AI stack (`packages/ai`)
Provider abstraction: all impl `LlmProvider` (`providers/base.ts`). Factory in `providers/index.ts` resolves env: `AI_PROVIDER` ∈ anthropic|openai|openrouter|ollama. OpenRouter + Ollama reuse `OpenAIProvider` w/ custom baseUrl (no extra deps).
Tier routing (`routing.ts`): feature → tier (fast/standard/deep) → model. Fallback chains: fast→[standard,deep] etc. Per-feature override via `AI_PROVIDER_<FEATURE>` and `AI_MODEL_<PROVIDER>_<TIER>`.
Stack: `TrackedProvider → ResilientProvider → raw`. Resilience = circuit breaker (5 fails / 60s) + per-provider rate limit + exp backoff retry. Tracking emits `UsageRecord` via `onUsage()`.
Chat loop (`chat.ts`): build snapshot (`context.ts` pulls metrics, P&L, funding, scenario) → sanitize user msg (`sanitize.ts` — strips injection patterns, 10K cap) → provider.complete with tools → if `stop_reason=tool_use`, run handler, loop ≤10x.
Tools defined in `packages/ai/src/tools.ts`; server impls in `apps/web/src/lib/ai-tools/{scenarios,headcount,forecasting,revenue,analytics,web-search}.ts`. MUTATION_TOOLS set drives cache tag invalidation.
Feature gating 3-tier: master `aiFeatureFlags.masterEnabled` → per-feature toggle → data mode (full/show_cached/hide_all). Write mode: full/confirm/read_only. Resolve via `resolveFeatureStatus()`. Insight cache (`aiInsightCache`) + invalidation queue (`insightInvalidations`) — see `apps/web/src/lib/insight-invalidation.ts`, `insight-staleness.ts`.
Cost: `estimateCostMicros()` per model in micros (1 USD = 1M micros). Credits: `MICROS_PER_CREDIT=1000` → 1 credit = $0.001. `AI_CREDITS_PER_USD=1000` is display const. Plan limits in `plans.config.ts`. Per-call enforcement in `apps/web/src/lib/ai-feature-flags.ts` + `ai-usage-tracker.ts`.

### Engine (`packages/engine`)
Pure functions, no I/O. **Currency-agnostic** (umbrella §1.6) — no `$`/`€`/symbol/locale code anywhere in `packages/engine/src/`. `formatMetricValue(value, "currency")` returns the raw number as a string; callers in the web app intercept the `currency` format case and route through `@burnless/types.formatCurrency`. Regression test: `__tests__/no-currency-in-engine.test.ts` walks the source tree and fails any reintroduction. All money via Decimal.js (20-digit, ROUND_HALF_UP), output 2-decimal numbers at boundary.
- Time series: `MonthlySeries = Map<"YYYY-MM", number>`. Helpers in `utils.ts`.
- Forecasting: `computeAllForecastLines()` — DAG-ordered.
- Revenue (`revenue.ts`): subscription (MRR + churn + expansion + price growth), one_time, usage_based, services. Returns series + `SubscriptionDetail[]`.
- Headcount (`headcount.ts`): cumulative-rounding to prevent cent drift.
- Statements (`statements.ts`): P&L, indirect cash flow (with A/R, A/P timing via DSO/DPO), balance sheet. Straight-line depreciation.
- Metrics (`metrics.ts` + `metric-registry.ts`): MRR, ARR, churn, LTV, CAC, magic number, burn, runway, etc.
- Scenarios cmp (`scenarios.ts`): diff two `ScenarioData`.
- Budget vs actuals (`budget.ts`): revenue (actual>budget=favorable), expense (actual<budget=favorable).
- Categorization (`categorization.ts`): 100+ regex rules + confidence; merchant memory via `merchantCategoryMappings`.
- Provider stubs (`payments.ts`, `bank-connectors.ts`, `integrations.ts`, `services/*`): interfaces + noop impls. Stripe + Razorpay payment, Plaid + AA bank, Crawl4AI + SearXNG search.

### DB (`packages/db`)
Singleton client (`src/index.ts`): postgres-js, pool max=10, `globalThis.__burnless_db` to survive HMR. Drizzle `postgres-js` dialect.
Schema (`src/schema.ts`) groups: auth (users/accounts/sessions/verificationTokens), tenant (companies/companyMembers/departments), GL (financialAccounts/transactions/importBatches/merchantCategoryMappings), forecast (scenarios/scenarioOverrides/forecastLines/forecastValues), revenue (revenueStreams), people (headcountPlans), funding (fundingRounds), metrics (metrics), AI (aiFeatureFlags/aiConversations/aiMessages/aiInsightCache/insightInvalidations/aiUsageLogs/aiToolAuditLogs), prefs (dashboardPreferences/userPreferences/weeklyDigests), compliance (privacyConsents/exportLogs), audit (financialAuditLogs), platform (inviteCodes/inviteCodeRedemptions).
Queries (`src/queries/`): `company.ts`, `scenario.ts`, `scenario-overrides.ts`, `scenario-resolver.ts` (override merge), `scenario-mutations.ts`, `scenario-promotion.ts`, `company-financial-data.ts` (`hasFinancialData(companyId)` — single round-trip OR-of-EXISTS across `revenue_streams`/`transactions`/`headcount_plans`/`funding_rounds`; gates currency-change confirm), `crud.ts` (generic).
Tests use **PGLite** in-mem PG. Setup at `src/__tests__/setup.ts`, factories at `src/__tests__/factories.ts` (deterministic seeded UUIDs).

### Web app (`apps/web/src`)
Route groups:
- `app/(dashboard)/*` — authed: dashboard, overview, revenue, expenses, team, funding, scenarios, scenarios/compare, reports/{profit-loss,cash-flow,balance-sheet,runway,budget-vs-actuals,metrics,board-update}, data-room, import, ai, settings, dashboard-shell.
- `app/api/*` — feature folders match dashboard; cron in `api/cron/{weekly-digest,data-retention}`; webhooks in `api/webhooks/[provider]`; auth in `api/auth/...`.
- Public: `/`, `/login`, `/onboarding`, `/pricing`, `/about`, `/contact`, `/security`, `/terms`, `/privacy`, `/help`.

Lib (`apps/web/src/lib/`):
- `data.ts` — server query wrappers w/ React.cache + unstable_cache (date revival needed; cache serializes Dates as ISO).
- `compute-{dashboard,expenses,revenue,digest}.ts` — server compute pipelines.
- `ai-tools/*` — server-side tool handlers (mutations invalidate cache tags).
- `feature-gate.ts` — plan limits (max scenarios, exports, etc.).
- `ai-feature-flags.ts` — per-company AI gating + credit ledger.
- `feature-flags.ts` — PostHog server-side flags.
- `scenario-middleware.ts` — dual-channel scenario validation.
- `confirmable-error.ts` — generic `ConfirmableError` + `serializeConfirmable`. Throw from a route to require `?confirm=true` retry; `withErrorHandler` maps it to a 409. Reusable across mutations needing user acknowledgement.
- `audit.ts` — fire-and-forget mutation logging.
- `rate-limit.ts` — middleware backend.
- `redis.ts` — ioredis (do NOT load in Edge runtime; vitest config externalizes it).
- `email/*` — providers: console (dev), Resend, SMTP. Mailpit in Docker captures dev SMTP at :8025.
- `pdf-export.ts`, `excel-export.ts` — jspdf + papaparse.
- `swr/*` — client data layer; `apiFetch` (`lib/api-fetch.ts`) is the sole injector of `X-Scenario-Id`, sourced from the `active-scenario-id` cookie (see scenario single-source rule in §1).
- `env.ts` — lazy-getter env (defers DATABASE_URL/AUTH_SECRET to runtime; fails fast in prod).

### Cron
Vercel: `apps/web/vercel.json` lists paths + schedules. Verified by `CRON_SECRET` bearer. Two jobs:
- `weekly-digest` — Mon 08:00 UTC. Per-company batched (N=100): metrics → AI narrative → email. Gated by `weeklyDigest` feature flag. Stored in `weeklyDigests`.
- `data-retention` — daily 03:00 UTC.
Local: `pnpm cron:worker` runs `scripts/cron-worker.ts`, parses 5-field cron, hits endpoints w/ CRON_SECRET. Bypass auth in dev: `DISABLE_CRON_AUTH=true`.

### Tests
Vitest unit (per package, `src/**/__tests__/**` + `*.test.ts`). DB tests use PGLite. Web vitest: happy-dom, externalizes ioredis. Coverage threshold 60% for web.
Playwright e2e (`apps/web/e2e/`):
- `auth.setup.ts` registers/logs-in test user → saves `e2e/.auth/user.json`.
- Authenticated project lists specific spec globs in `playwright.config.ts` projects[2].testMatch — add new authed specs there.
- Skips auth setup if no `DATABASE_URL`.
- Default `webServer`: `pnpm build && pnpm start`. Override w/ `BASE_URL=...`.

## Conventions worth knowing

- **Decimal everywhere financial.** Don't use raw `number` math for money inside engine; use `D()/dAdd/dMul/dSum/dRound2`.
- **Companies are tenants.** Always thread `companyId` through queries; use `crud.ts` helpers when generic.
- **Scenarios are the read filter.** Don't query base tables directly when scenario-aware; use `getResolvedData()` or compute helpers that already apply overrides.
- **Cache tags.** Mutating routes call `revalidateTag(...)`. AI tool mutations: `MUTATION_TOOLS` set in `lib/ai-tools/index.ts` drives this.
- **Date revival.** `unstable_cache` JSON-stringifies; revive with helper in `data.ts`.
- **AI graceful degradation.** No AI provider configured ≠ crash; chat returns a friendly stub.
- **Inputs sanitized; system prompts trusted.** Sanitize user content only.
- **🚫 NEVER hand-author / arbitrary migration SQL. ALWAYS generate migrations through drizzle-kit (`db:generate`).** Migrations are `db:push` for dev (no files), `db:generate` → `db:migrate` for prod. The SQL files in `packages/db/drizzle/` and `drizzle/meta/{_journal.json,NNNN_snapshot.json}` are drizzle-kit-owned artifacts — do not write or edit them by hand. Hand-authoring leaks (no snapshot → `generate` can't diff; filename-number collisions → out-of-order/duplicate migrations; journal drift → `db:migrate` silently skips them). If `db:generate` is "blocked by malformed meta," **FIX the meta/snapshots so drizzle-kit works again — do NOT work around it by hand-writing `ALTER` SQL.** History note: the prior hand-authored migrations (`0043`–`0049`) plus the corrupt meta (29 missing snapshots, the `0017`/`0018`/`0041` duplicate-id chain, and `0041`/`0042` malformed) made `db:generate` impossible to repair incrementally. Phase 0 therefore **collapsed the entire migration history into a single clean drizzle-generated baseline** (`packages/db/drizzle/0000_eager_blockbuster.sql`, all 43 tables); the old SQL + meta are archived under `packages/db/drizzle/.pre-collapse-archive/` for provenance. `db:generate` and `db:migrate` are clean again (re-running `db:generate` yields an empty diff). Prod (already at the old `0049`) reconciles the baseline as already-applied — the baseline is byte-identical to the live schema. Keep `db:push` (dev) and migration files in sync before shipping.
- **No mocks for DB tests.** PGLite real Postgres semantics.

### Data-entry umbrella contracts (Phase 0–3 cumulative)

> Source spec: `docs/superpowers/specs/2026-04-24-data-entry-umbrella-design.md`. Each contract below is a code-true distillation of an umbrella §1.x rule. When you touch a surface governed by one of these, tag the change with the contract it depends on (e.g. `// Phase 2 D §1.4 D6`) so future readers can trace back.

- **Currency formatter is centralized.** React: `useLocale().fmtCurrency` / `fmtCompact`. Server / non-React utility: `formatCurrency(value, currency, locale, opts?)` from `@burnless/types`. Never hardcode `$`/`€`/`£`/`¥`/`₹` or `new Intl.NumberFormat(..., { currency: "USD" })`. Regression-guarded by `apps/web/src/__tests__/no-hardcoded-currency.test.ts` (with allowlist for AI-provider USD pricing, JSDoc/comments, fixtures, marketing pages — see file for the explained list).
- **Currency change requires confirm after financial data.** `companies.currency` is Zod-validated against `CURRENCY_CODES` whitelist (10 codes in `@burnless/types`). `PATCH /api/company` calls `hasFinancialData(companyId)`; if true and `?confirm=true` is missing, throws `ConfirmableError("CURRENCY_CHANGE_REQUIRES_CONFIRMATION", { from, to })` → 409. UI (`settings/page.tsx`) catches the 409 and shows a generic confirm dialog using the existing `Modal` primitive; on Confirm retries with `?confirm=true`, on Cancel reverts the dropdown to `loadedCurrency`. Server-side reads should guard with `isValidCurrency(company.currency) ? company.currency : "USD"` before passing to formatters (rows persisted before the whitelist landed could hold any text).
- **`roundType` is immutable after creation (Phase 2 D).** `fundingRounds.roundType` is set once on insert; the edit form renders a read-only badge (`"<Type> (immutable)"`) instead of a `<select>`. API `PATCH /api/funding-rounds/[id]` silently strips `roundType` from the update payload — never overwrites it. Reason: downstream cash-flow, cap-table, and interest calculations depend on the type being stable.
- **Runway and burn pick up interest + principal (Phase 2 D §D6).** `metrics.ts:netBurnRate` = `max(0, totalExpenses + interestExpense − totalRevenue)` — interest is an operating expense (P&L line), so it sits inside burn. `metrics.ts:cashRunwayMonths` = `cashPosition / (netBurnRate + principalPayments)` — principal is a contractual cash outflow that drains runway but is NOT operating, so it is added only to the runway denominator, not to burn. Both `interestExpense` and `principalPayments` arrive as `MonthlySeries` from `computeFundingImpact()` in `packages/engine/src/funding.ts`; the engine routes interest through `metricsInput.interestExpense` and principal through `metricsInput.principalPayments` (see `compute-dashboard.ts:330-331`).
- **Cap-table is scenario-aware and cache-tagged `cap-table` (Phase 2 D + Phase 3 F doc fix).** `/funding/cap-table` is server-rendered via `unstable_cache` with `tags: ["cap-table"]` (a single tag, not a per-company tuple; the cache key already includes companyId). It IS scenario-aware — `compute-cap-table.ts:39` calls `resolveEntities("funding_round", baseRounds, scenarioId)`. Mutations to `fundingRounds`, `equityGrants`, `shareClasses`, or `optionPools` must call `revalidateTag("cap-table")` — the `MUTATION_CACHE_TAGS` set in `lib/ai-tools/index.ts` covers the AI-tool path.
- **Grant match-shortfall warnings are surfaced as data, displayed on the page (Phase 2 D §D5).** The engine `computeFundingImpact()` returns `warnings: GrantMatchWarning[]` alongside cash flows — a structured payload that names the milestone and the shortfall amount. Today the funding page reads the warning chip from its own client-side check against expense totals; the engine warning array exists for AI-tool consumers (`mark_grant_milestone_hit` surfaces it in its response payload). Do not gate disbursement on the warning — milestones disburse per user-marked `hitDate` regardless, per §D5.
- **Cap-table single-pool constraint (Phase 3 F §F5).** `compute-cap-table.ts` currently supports a single option pool only — `equityGrants` has no `optionPoolId` column, so multi-pool grant attribution is impossible without a schema change. The code throws explicitly if a second pool exists via the exported `buildOptionPoolsWithGranted` helper. Adding multi-pool support means adding the column + migrating attribution in one change.
- **Metric format token is `"percent"` everywhere (Phase 3 F §F1).** `MetricFormat` is a closed union — `"percent"` is the only percentage token (the `"percentage"` variant Phase 2 D briefly introduced is gone). `packages/engine/src/__tests__/metric-registry-consistency.test.ts` guards the union + asserts every parent metric declares `aiContext` explicitly.
- **Form-primitives kit lives at `apps/web/src/components/forms/primitives/` (Phase 3 F §1.7).** Four primitives: `<DateRangePicker>`, `<CurrencyInput>`, `<PercentageInput>`, `<NumberInput>`. All accept `{ required?, disabled?, hint? }` in addition to `value`/`onChange`/`label`. Promotion rule: a UI element graduates here only after ≥2 production call sites across distinct sub-projects. See the README in that directory for the current state.
- **`generateCashFlow` takes `fundingImpact` only (Phase 4 E §J).** The legacy `fundingInflows` parameter was removed; the `fundingImpact` 5th argument (Phase 2 D contract) is now the single funding-cash-flow input.
- **All derived/display financial math routes through engine helpers (Phase 5 §#3).** No page/component/lib computes financial figures inline — even `rate * 100`. Use `pctChange` / `ratioChange` (MoM change), `pctOfTotal` (share of total), `ratioToPct` (0-1 → 0-100 display), `annualize` (monthly → annual), `dSum` (precise sums), and `computeDilution` (interactive raise modeling) — all from `@burnless/engine`. Guarded by `apps/web/src/__tests__/no-inline-financial-calc.test.ts` (forbids inline MoM-percent idioms and `Number(...amount)` reduce-sums; geometry like bar widths/arc degrees and AI-cost-micros analytics are allowlisted). Gross vs net burn are distinct: `burnRate` ("Gross Burn") = expenses + interest; `netBurnRate` ("Net Burn") = `max(0, gross − revenue)`. Both are core, AI-selectable registry metrics — never hardcode a dashboard card; layout is registry + `dashboardPreferences` driven.
- **`financialAccounts.coversHeadcount` prevents salary double-count (Phase 5 §#5).** When true, transactions on the account ARE personnel cost the headcount plan also models. Only `compute-dashboard.ts` blends transaction actuals with headcount-plan cost, so only it reconciles: it collects months with personnel actuals on flagged accounts and calls `reconcileHeadcountWithActuals(headcountCosts.totalCost, personnelActualMonths)` to zero the plan cost in those months (actuals win in closed months; the plan drives forecast months). No-op for headcount-plan-only companies (empty set). `api/metrics`, `api/scenarios/compare`, `api/statements` are forecast+headcount only (no actuals) so they do NOT reconcile — note this also means those routes diverge from the dashboard for companies with actuals on accounts lacking forecast lines (pre-existing, separate issue). Onboarding ("Salaries & Payroll") and the demo seed ("Salaries & Wages") set the flag true; existing rows default false (no UI toggle yet — set via `PATCH /api/accounts` `updateAccountSchema`). The `coversHeadcount` column is part of the collapsed `0000_eager_blockbuster.sql` baseline (Phase 0) — `db:generate`/`db:migrate` are clean; no migration caveat remains.
- **Dashboard horizon — Phase B (carry-forward, implemented).** Headline KPIs read at the **real current calendar month** (`compute-dashboard.ts` `currentMonth = todayMonth`, with `prevMonth = previousMonthKey(currentMonth)` — both returned from `DashboardData` so pages consume `data.currentMonth`/`data.prevMonth` instead of recomputing `monthKey(new Date())`). The thin-category problem (transaction-only accounts — COGS, salary accounts without a forecast line — reading 0 past the last imported month, producing Gross Margin 100% / thin expenses) is fixed by **carry-forward**: in the actual-only account loop, each account's actuals are extended across the horizon via engine `projectActualsForward(actuals, horizonMonths, trailingMonths=3)` — months after the last actual get the **trailing-3-month average**; actual months and pre-first-actual months are untouched; the input is not mutated. **`coversHeadcount` accounts are excluded** from carry-forward (the headcount plan already projects those months; carrying the actuals forward would double-count against the reconciled plan cost — see Phase 5 §#5). Accounts *with* a forecast line are unaffected (the forecast already projects them). Approach chosen over the earlier "Phase A snap" (`currentMonth = min(today, lastActualMonth)`) because snapping pushes **projection-based** metrics (MRR, headcount, revenue) back to an earlier, smaller month — understating today's reality — whereas carry-forward keeps "today" correct while filling only the thin transaction categories. Guards: engine `__tests__/project-actuals-forward.test.ts`; integration `apps/web/src/lib/__tests__/compute-dashboard-carry-forward.test.ts` (asserts actual-only carry + `coversHeadcount` exclusion). Note: for companies whose expense/COGS transactions are *miscategorized* (e.g. all booked to the revenue account), carry-forward cannot synthesize COGS that was never recorded — that is a data-categorization issue, not a horizon issue.

## Env vars (see `.env.example` / `.env.docker`)

Required: `DATABASE_URL`, `AUTH_SECRET`.
AI (pick one): `AI_PROVIDER` + matching key (`ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`OPENROUTER_API_KEY`) or `OLLAMA_BASE_URL`. Optional per-tier overrides `AI_MODEL_<PROVIDER>_<TIER>` and per-feature `AI_PROVIDER_<FEATURE>`.
OAuth: `AUTH_GITHUB_{ID,SECRET}`, `AUTH_GOOGLE_{ID,SECRET}`.
Billing: `STRIPE_SECRET_KEY` / `RAZORPAY_*`.
Ops: `CRON_SECRET`, `SENTRY_DSN`, `NEXT_PUBLIC_APP_URL`, `ALLOWED_ORIGINS`.
Detection helpers in `lib/env.ts`: `hasAiProvider`, `hasStripe`, `hasRazorpay`, `hasBilling`.

## Top-level docs (informational; may drift from code — verify)

`PRODUCT-BRIEF.md`, `PRODUCT-VISION.md`, `DASHBOARD-SPEC.md`, `AI-COMPANION-STRATEGY.md`, `INTEGRATION-ARCHITECTURE.md`, `UX-STANDARDS.md`, `DEPLOY.md`/`DEPLOYMENT.md`, `LOCAL.md`, `MARKET-RESEARCH.md`, `test-accounts.md`. Treat as intent, not spec — code is truth.
