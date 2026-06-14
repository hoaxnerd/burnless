# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository. Style: terse and dense — written for fast machine reading. Every line below is a stable technical fact, not status.

## Project overview

Burnless is an open-source, AI-native financial planning & analysis (FP&A) platform for startups and the people who run them. It reads real financials and turns them into forecasts, scenarios, and board-ready reports, with an AI companion that can answer questions and take actions on the model through tools. It self-hosts in one command with an embedded database (no Docker, no external Postgres required); a managed cloud edition runs the same codebase with more capabilities enabled.

Monorepo, pnpm workspaces + turbo. Node ≥ 20.9.

```
apps/web        → Next.js 15 (app router), React 19 — frontend + API routes + middleware
packages/db     → Drizzle ORM schema, queries, migrations, seed (PGlite local / Postgres cloud)
packages/engine → Pure-TS financial calc library. No DB, no I/O. Decimal.js precision.
packages/ai     → Provider-agnostic LLM layer (Anthropic / OpenAI / OpenRouter / Ollama)
packages/cli    → The `burnless` CLI (start / update / mcp serve / …) — the only public npm package
packages/mcp    → Model Context Protocol support (consume external MCPs + expose Burnless as one)
packages/types  → Shared TS types
packages/ui     → Shared React components
```

Internal workspace deps reference `workspace:*`. The `burnless` CLI is the public package; the rest are private.

## Setup commands

- Node **≥ 20.9**, pnpm.
- Install: `pnpm install`
- Run all dev servers: `pnpm dev` (web on `:3000`, auto-bumps the port if busy)
- Standalone instance: `burnless start` (binds loopback `127.0.0.1`, embedded database, onboarding wizard)

Dev database options:
- **Embedded PGlite (default).** No external service needed — works out of the box.
- **Postgres via Docker:** `pnpm docker:up` (Postgres + Redis + Mailpit), `pnpm docker:down` to stop, `pnpm docker:reset` to wipe.

Schema management:
- `pnpm db:push` — push schema to a dev DB (no migration files)
- `pnpm db:generate` — generate migration SQL into `packages/db/drizzle/` via drizzle-kit
- `pnpm db:migrate` — run pending migrations
- `pnpm db:studio` — Drizzle Studio
- `pnpm db:seed` — demo data (guarded against prod, idempotent)

Required env: `DATABASE_URL`, `AUTH_SECRET`. AI is optional (pick one provider): `AI_PROVIDER` plus the matching key (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `OPENROUTER_API_KEY`) or `OLLAMA_BASE_URL`. See `.env.example` for the full list. Env detection helpers live in `apps/web/src/lib/env.ts`.

## Build, test & lint

- `pnpm check` — type-check + lint (run before considering work done)
- `pnpm build` / `pnpm lint` / `pnpm type-check` / `pnpm test` — individual root scripts (turbo-orchestrated)
- Per-package work: `pnpm --filter @burnless/<pkg> <script>` (e.g. `pnpm --filter @burnless/db test`)
- Single test file: `pnpm --filter @burnless/web vitest run path/to/file.test.ts`
- Single test by name: `pnpm --filter @burnless/db vitest run -t "test name"`
- E2E (Playwright, in `apps/web`): `pnpm e2e` / `pnpm e2e:ui`

**Run tests per-package, not the whole suite at once.** The DB tests spin up real in-memory Postgres (PGLite) and the full web suite can time out if run all together — scope to the package or file you changed.

## Code style & conventions

- **Decimal for all money.** Never use raw `number` arithmetic for currency inside the engine. Use the Decimal helpers (`D()`, `dAdd`, `dMul`, `dSum`, `dRound2`). Output is 2-decimal numbers at the boundary.
- **Centralized currency formatter.** Never hardcode currency symbols (`$`/`€`/`£`/`¥`/`₹`) or `new Intl.NumberFormat(..., { currency: "USD" })`. In React, use `useLocale().fmtCurrency` / `fmtCompact`. In server/non-React code, use `formatCurrency(value, currency, locale, opts?)` from `@burnless/types`. Guarded by a regression test that scans for reintroductions.
- **Companies are tenants.** Every business table is scoped by `companyId` and indexed. Always thread `companyId` through queries; use the generic helpers in `packages/db/src/queries/crud.ts` (`findByIdForCompany`, `updateForCompany`, …). API routes gate access with `requireCompanyAccess()` (role order: owner > admin > editor > viewer).
- **Scenarios are the read filter.** Don't query base tables directly when a path is scenario-aware. Use `getResolvedData()` (the override resolver) or a compute helper that already applies overrides.
- **Never set `X-Scenario-Id` manually.** That header is injected in exactly one place — `apiFetch` in `apps/web/src/lib/api-fetch.ts`, derived from the `active-scenario-id` cookie. A second source drifts from the cookie and 409-locks the user out of editing. Guarded by a regression test.
- **Cache-tag revalidation.** Mutating routes call `revalidateTag(...)`. AI-tool mutations drive this through the mutation-tool / cache-tag sets in `apps/web/src/lib/ai-tools/index.ts`.
- **Never hand-author migration SQL.** Always generate migrations through drizzle-kit (`pnpm db:generate`), then `pnpm db:migrate`. The SQL files in `packages/db/drizzle/` and the meta/snapshots under `packages/db/drizzle/meta/` are drizzle-kit-owned artifacts — do not write or edit them by hand. Hand-authoring corrupts the snapshot/journal so drizzle-kit can no longer diff or apply cleanly. Dev may use `pnpm db:push`; anything that ships uses generated migrations.
- **Migrations must be non-destructive.** User data is sacred and must survive every update. Prefer additive, idempotent-backfill migrations; never drop or rewrite user data.
- **Sanitize user input only; system prompts are trusted.** Sanitize user-supplied content before it reaches an LLM; do not sanitize internal system prompts.

## Architecture / load-bearing concepts

### Data flow

```
DB (Drizzle) → packages/db/queries → apps/web API routes → @burnless/engine compute
                                                          → @burnless/ai chat / insights
                                                          → React Server Components + SWR
```

### Scenarios = override overlay, not a data fork

Real entities live in normal tables (`transactions`, `revenueStreams`, `forecastLines`, `headcountPlans`, `fundingRounds`). A scenario does **not** clone rows — it writes deltas to `scenarioOverrides`, keyed `(scenarioId, entityType, entityId)` with an action (`create` / `modify` / `delete`) and a JSONB `data` payload. The read path (`packages/db/src/queries/scenario-resolver.ts` → `getResolvedData()`) merges base rows with overrides. Promoting a scenario applies it to baseline (status `promoted`, soft-delete via `deletedAt`).

Mutations validate dual-channel: the `active-scenario-id` cookie and the `X-Scenario-Id` header must agree, else the request is rejected with a 409 (`ScenarioSafetyError`) — see `apps/web/src/lib/scenario-middleware.ts`. A sibling pattern, `ConfirmableError` (`apps/web/src/lib/confirmable-error.ts`), returns a 409 requiring the client to re-submit with `?confirm=true` for actions that need explicit acknowledgement (e.g. changing currency after financial data exists).

### Metric / slot registry = single source of truth for the dashboard

`packages/engine/src/metric-registry.ts` defines every metric (60+): formula, dependency DAG, format, direction, tier, and fallbacks. Metrics can declare a parent (drill-down hierarchy) and an AI-context inclusion mode. `slot-types.ts` defines stable card positions. Per-user dashboard layout lives in `dashboardPreferences` (mode + hero cards + slot overrides + custom metrics, JSONB). Render pipeline: `apps/web/src/lib/compute-dashboard.ts` (React.cache + tagged cache) → engine compute → `build-slot-metrics.ts` formats per slot → grid components. **Never hardcode a dashboard card** — layout is registry- and preference-driven.

### Forecast DAG

`forecastLines` (per account, method ∈ `fixed` / `growth_rate` / `per_unit` / `percentage_of` / `custom_formula`) are resolved by a Kahn topological sort in `packages/engine/src/dag.ts` (throws `CircularDependencyError` on a cycle) into `forecastValues` (per line × month). `percentage_of` and `custom_formula` reference other lines. The formula evaluator (`formula.ts`) is a sandboxed mathjs with a function whitelist; it blocks `import` / `eval` / `process` / `__proto__` and supports a time offset like `Foo[-1]`.

### Edition / capability model

One codebase serves both self-host and cloud — the difference is capability flags, not a fork. Deployment mode defaults to self-host (more local capabilities enabled, e.g. spawning local MCP processes); cloud mode turns those off. The mode and capability gates are read from env via helpers in `apps/web/src/lib/env.ts`. The database layer is the same in both: PGlite when self-hosted, Postgres for cloud/scale — and the **same migrations apply to both**.

### AI stack (`packages/ai`)

Provider-agnostic: every provider implements `LlmProvider` (`providers/base.ts`); a factory (`providers/index.ts`) resolves `AI_PROVIDER` ∈ `anthropic` / `openai` / `openrouter` / `ollama` (OpenRouter and Ollama reuse the OpenAI provider with a custom base URL). Tier routing (`routing.ts`) maps feature → tier (fast / standard / deep) → model, with fallback chains and per-feature/per-tier env overrides. Providers are wrapped in a resilience layer (circuit breaker + per-provider rate limit + exponential-backoff retry) and a tracking layer (emits usage records).

Chat loop (`chat.ts`): build a financial snapshot (`context.ts`) → sanitize the user message (`sanitize.ts` — strips injection patterns, caps length) → call the provider with tools → if the model requests a tool, run its handler and loop (bounded). Tools are declared in `packages/ai/src/tools.ts`; server-side handlers live in `apps/web/src/lib/ai-tools/*`, and mutating tools drive cache-tag invalidation.

Feature gating is three-tier: a master AI toggle → per-feature toggle → data mode (full / cached / hidden), with a separate write mode (full / confirm / read-only). Insights are cached with an invalidation queue. **Graceful degradation:** if no AI provider is configured the app does not crash — chat returns a friendly stub.

### Engine (`packages/engine`)

Pure functions, no I/O, **currency-agnostic** — there is no currency symbol or locale code anywhere in the engine source. `formatMetricValue(value, "currency")` returns the raw number as a string; web-app callers intercept the `currency` case and route through `@burnless/types.formatCurrency`. A regression test walks the engine source and fails any reintroduction of currency formatting. All money flows through Decimal.js (20-digit, round-half-up). Modules: forecasting (DAG-ordered), revenue (subscription/usage/one-time/services), headcount (cumulative rounding to avoid cent drift), statements (P&L, indirect cash flow, balance sheet), metrics, scenario comparison, budget-vs-actuals, transaction categorization, and provider-interface stubs for payments/banking/integrations.

### DB (`packages/db`)

Singleton client (`src/index.ts`), survives HMR via a global. Schema in `src/schema.ts`, grouped: auth, tenant, general ledger, forecast, revenue, people, funding, metrics, AI, preferences, compliance, audit, platform. Queries in `src/queries/` (company, scenario + override resolver, financial-data existence checks, generic CRUD). Tests use PGLite (real Postgres semantics in-memory) with a deterministic factory module.

### Web app (`apps/web/src`)

- `app/(dashboard)/*` — authed pages: dashboard, overview, revenue, expenses, team, funding, scenarios (+ compare), reports (P&L / cash flow / balance sheet / runway / budget-vs-actuals / metrics / board update), data-room, import, AI, settings.
- `app/api/*` — feature folders mirroring the dashboard; cron endpoints; webhooks; auth.
- Public pages: landing, login, onboarding, pricing, and the marketing/legal set.
- `lib/` — server compute pipelines (`compute-*.ts`), AI tool handlers, feature gates, scenario middleware, cache/data wrappers, email providers, export helpers.

### Auth & middleware

NextAuth v5 + Drizzle adapter, JWT sessions. Email/password + GitHub + Google, plus TOTP 2FA with backup codes; passwords are bcrypt. Middleware (`apps/web/src/middleware.ts`) applies a tiered in-memory sliding-window rate limit, CSRF origin allowlisting on mutations, and a correlation ID per request; health, auth internals, and webhooks bypass it.

## Testing

- **Vitest** for unit tests, per package (`src/**/__tests__/**` and `*.test.ts`).
- **DB tests use PGLite — no mocks.** Real Postgres semantics in-memory; do not mock the database. Setup and deterministic factories live under `packages/db/src/__tests__/`.
- **Test both editions.** Behavior can differ between self-host and cloud capability modes — verify changes that touch capability gating in both.
- **Playwright e2e** lives in `apps/web/e2e/`. An auth-setup spec registers/logs in a test user and saves the session; new authenticated specs must be registered in the authenticated project's `testMatch` in `playwright.config.ts`. E2E skips auth setup when no `DATABASE_URL` is present.
- Web vitest runs on happy-dom and externalizes the Redis client; coverage threshold for web is 60%.

## Security considerations

- **Trust boundary.** Sanitize user-supplied content before it reaches an LLM; system prompts are trusted and must not be sanitized.
- **Scenario dual-channel safety.** Mutations require the `active-scenario-id` cookie and `X-Scenario-Id` header to agree, or they fail with a 409 (`ScenarioSafetyError`). Never inject the header from a second source (see conventions).
- **Secrets at rest.** `SECRETS_ENCRYPTION_KEY` (32-byte base64) encrypts external connection credentials at rest. It is enforced lazily — only required when a credential is saved or read. Tokens the platform issues itself are hashed (SHA-256), not encrypted.
- **Authorization on every mutation.** Gate all company-scoped mutations behind `requireCompanyAccess()` (session + role check). Respect deployment-mode capability gates (e.g. local-process features are off in cloud mode).
- **Rate limiting & CSRF.** Enforced in middleware; don't bypass them for new mutating routes.

## Commit & PR guidelines

- Use **Conventional Commits** (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, …).
- Run `pnpm check` (type-check + lint) and the relevant tests before opening a PR.
- Keep PRs reasonably scoped and focused on one change.
- See `CONTRIBUTING.md` for the full contribution process.

## Gotchas

- **Date revival.** Server data wrappers use `unstable_cache`, which JSON-stringifies values — `Date`s come back as ISO strings. Revive them with the helper in `apps/web/src/lib/data.ts` rather than assuming live `Date` objects.
- **The engine never formats currency.** It returns raw numbers for the `currency` format; formatting happens at the web-app boundary (see Engine and Code style).
- **Dashboard carry-forward.** Headline KPIs read at the real current calendar month. Transaction-only accounts (no forecast line) would otherwise read 0 past the last imported month and distort metrics; the dashboard compute extends each such account's actuals across the horizon using a trailing-average projection. Accounts flagged `coversHeadcount` are excluded from carry-forward (the headcount plan already projects them).
- **`coversHeadcount` double-count guard.** When `financialAccounts.coversHeadcount` is true, transactions on that account are personnel cost the headcount plan also models. Only the dashboard compute blends transaction actuals with headcount-plan cost, so only it reconciles them (actuals win in closed months; the plan drives forecast months). Routes that are forecast+headcount only do not reconcile — keep that in mind when comparing figures across surfaces.
- **AI graceful degradation.** No configured AI provider is not a crash — chat falls back to a friendly stub.

---

This file follows the [AGENTS.md standard](https://agents.md). `CLAUDE.md` is a symlink to this file, so editors that auto-load a `CLAUDE.md` pick up the same guide.

**Keep this guide current as the architecture changes — update `AGENTS.md` in the same PR that changes the behavior it documents.**
