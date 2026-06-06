# Scenario Feature — Full Map + Revised Fix Strategy

> Built from an exhaustive 5-part trace (activation, data model, read consumers, write consumers, tests/contracts). Every claim below is backed by `file:line` in the trace; this doc is the synthesis + decision.

## A. Mental model (how it actually works)

**Overlay model (canonical):** base tables hold the real data; a scenario is a set of deltas in `scenarioOverrides` keyed `(scenarioId, entityType, entityId)` with action `create|modify|delete`. `resolveEntities(type, base, scenarioId)` merges them. **`scenarioId = null` ⇒ pure base, no merge** (scenario-resolver.ts:37). Six types overlay: revenue_stream, headcount_plan, forecast_line, funding_round, department, financial_account (+ team child rows salary_change/bonus/equity_grant).

**Activation = dual channel, cookie-authoritative:**
- `active-scenario-id` **cookie** (shared across tabs, 30d, SameSite=Strict) — the authority.
- `active-scenario` **sessionStorage** (per-tab) — now only a name cache (the code/comments still say it's the header source; **stale comment** — `api-fetch.ts` reads the cookie).
- `apiFetch` is the **single** injector of `X-Scenario-Id`, derived from the cookie (guarded by `no-manual-scenario-header.test.ts`).
- Server mutation guard `scenario-middleware.ts getActiveScenario(request)` returns `header ?? null` and 409s if cookie/header disagree.
- Client `ScenarioProvider` reconciles cookie↔session across tabs on storage/visibility/focus; `enterScenario`/`exitScenario` set/clear both channels + `router.refresh()`.

**Promotion:** applies a scenario's overrides to base in a transaction, creates a 7-day backup scenario, sets status `promoted`. (`autoDeleteAt` is set but **never enforced** — no GC job.)

## B. The central defect (Bug 2) — read/write scenario asymmetry, CONFIRMED

When **no sandbox is active (no cookie):**
- **WRITES** → `apiFetch` sends no header → middleware returns `null` → mutate **base tables**. ✅ correct per overlay model.
- **READS (most pages)** → `getServerScenarioId()` = undefined → `getActiveScenario(companyId, undefined)` **falls back to `getDefaultScenario`** = the *first scenario row* and merges **its overrides**. ❌

⇒ If that default scenario carries any override, the page shows override-derived data that base writes can't touch. Reproduced live: entity `...400` (SaaS stream) deleted from base but a `modify` override on "Base Case" surfaces it as the phantom "realtime-spec"; deleting it runs `db.delete where id=...400` → 0 rows → `{deleted:true}` → `revalidateTag` (AI staleness timer trips) → read re-applies the override → **row persists**. Exactly the user's "timer resets, record stays, site-wide."

**Key corroboration:** the data layer, the write path, the API read routes (`/api/metrics`, `/api/statements`, `/api/cap-table`), the cap-table *page*, and `getFundingRounds(companyId, null)` **already treat null = base correctly**. There is even an existing **red TDD scaffold** `apps/web/src/__tests__/scenario-read-path.test.ts` ("EXPECTED: FAIL until the fetchers are scenario-aware") that encodes this exact target. So the fix direction is pre-sanctioned; only the page-level helpers + guards are wrong.

## C. Adjacent defects found in the same subsystem (the trace's payoff)
These share the root area; a robust fix should treat them as one cluster, not patch Bug 2 alone.

1. **Reports ignore the active scenario.** P&L, cash-flow, balance-sheet, runway, metrics, budget-vs-actuals call `getDefaultScenario(company.id)` **directly** — they show the first scenario's overrides regardless of which sandbox you're in. (Read-path bug my first plan missed.)
2. **`getAccounts` / `getDepartments` are not scenario-aware** (keyed by companyId, base-only, no `scenario-overrides` tag) although accounts/departments ARE overridable → scenario edits to them don't reflect through these cached reads.
3. **Cross-tenant leak (security):** `scenarioUpdate`/`scenarioDelete` look up the base entity by `id` only — **no `companyId` filter** (scenario-mutations.ts:136,199). A user can snapshot another company's entity into their own override's `originalData`. Affects revenue-streams/funding-rounds/headcount/accounts/forecast-lines/departments `[id]` routes.
4. **Orphan overrides never GC'd → phantoms.** Hard-deleting a base row leaves dangling `modify` overrides that `resolveEntities` resurfaces as `_override:"created"` ghosts (intentional + tested, resolver:75-79), and there's no cleanup (no FK from `entityId`). This is how "realtime-spec" exists.
5. **DELETE routes report success on 0 rows.** All entity DELETEs return `{deleted:true}` without checking rows-affected; client `handleDelete` also swallows errors (`catch {}`). Silent no-op deletes.
6. **Promotion under-invalidates cache.** `/api/scenarios/promote` only `revalidateTag("scenarios")` after writing up to 9 entity tables → dashboard/reports serve stale data for ~30s.
7. **AI tools use a different scenario source** than the UI: chat resolves scenario from the POST body (or `getDefaultScenario`), and some read tools (`analytics.ts`, `forecasting.ts`) let the **model** choose `scenarioId`. AI mutations also bypass the dual-channel guard and `trackDataMutation`. ⇒ AI can read/write a different scenario than the user is viewing; AI mutations don't trip the insight timer. (`genui-display.ts` already enforces ctx-only — the others don't.)
8. **`getDefaultScenario` has no `ORDER BY`** → nondeterministic "default."
9. **Stale docs/comments:** `scenario-middleware.ts:8`, `scenario-context.tsx:39`, `SCENARIO-AUDIT.md` still say the header comes from sessionStorage; two different `getActiveScenario` functions (data.ts vs middleware) share a name.

## D. Verdict on the original plan
**Direction = correct and confirmed** (null=base for reads to match writes; data layer already supports it; red tests already encode it). **But it was too narrow.** The robust, scalable fix is to make scenario-id resolution a **single source of truth shared by reads, writes, and AI**, fix the **two extra read-path bugs** (reports; accounts/departments), and close the **adjacent footguns** (security, orphan GC, 0-row deletes, promotion cache, AI scenario source) as one coherent change — otherwise the same class of "view ≠ truth" bug keeps recurring.

## E. Revised strategy (scalable & robust)

**E1. Single source of truth for the active scenario id (read + write + AI).**
- One server helper `getActiveScenarioId(): Promise<string | null>` = cookie value or `null` (NO default-scenario fallback). Used by every page and read route.
- Writes already use `header ?? null`; keep. AI: always use the chat's active scenario (ctx), never model-chosen; ideally derive from the same cookie path.
- Net invariant: **with no sandbox, everything (read/write/AI) resolves to base (null); with a sandbox, everything resolves to that one id.** Reads == writes, always.

**E2. Make the read helpers null/base-capable (mirror `getFundingRounds`).**
- `getRevenueStreams`, `getForecastLines`, `getHeadcountPlans` → `(companyId, scenarioId: string|null)`; drop the scenario→companyId lookup; pass null straight to `resolveEntities`.
- `getAccounts`, `getDepartments` → become scenario-aware (resolve overrides, add `scenario-overrides` tag) so scenario edits reflect.
- `computeDashboardData/Revenue/Expenses` → accept `scenarioId: string|null`.

**E3. Fix the pages.**
- All dashboard + **report** pages: use `getActiveScenarioId()` (cookie→null), pass through. Reports stop using `getDefaultScenario`.
- Replace `if (!scenario) return <Prompt>` guards with company/data-existence checks (base view must render with null). Keep `getDefaultScenario` only for the scenarios *list* (with `ORDER BY created_at`), not for data resolution.

**E4. Close the footguns (same PR or fast-follow):**
- Add `companyId` filter to base lookups in scenarioUpdate/scenarioDelete (security).
- DELETE routes: 404 when 0 rows; client surfaces errors (no silent `catch {}`).
- Orphan-override cleanup: when a base row is hard-deleted, delete its overrides across scenarios (cheap, in `scenarioDelete(null)` path) — kills phantoms at the source.
- Promotion: `revalidateTag` all affected entity tags.
- `getDefaultScenario`: `ORDER BY created_at` (or delete it from the data path).
- Refresh stale comments/docs.

**E5. Verification.**
- Turn the red `scenario-read-path.test.ts` green; keep all existing PGLite scenario tests (resolver/mutations/promotion/overrides) green.
- Add tests: reports respect active scenario; accounts/departments scenario-aware; cross-tenant lookup denied; DELETE 0-rows→404; orphan overrides removed on base delete.
- Browser (clean reseed): on base — delete/edit reflect immediately across revenue/expenses/team/funding; enter scenario — edits reflect in-sandbox; exit — base unchanged; reports follow the active scenario.
- Full `pnpm test` + scenario e2e specs.

## F. Risks
- Touch-heavy (helpers + ~14 pages + reports + AI tools). TS catches call-site breaks.
- Behavior change: the default view becomes **true base** (no first-scenario overrides). Intended, but dashboards may shift if a seed/AI ever wrote overrides to the default scenario. Reseed to a clean baseline before final verification.
- Empty-state guard changes risk regressing "no data" screens — verify each page.
- AI scenario-source change must not break chat that legitimately targets a chosen scenario for *comparison* reads (keep an explicit, audited path for that).

## G. Decision needed
1. Scope: **(i) Bug 2 core only** (E1–E3), **(ii) core + footguns** (E1–E5, recommended for "scalable & robust"), or **(iii) phased** (core now; security + orphan-GC + promotion-cache + AI-source as fast-follows).
2. Should the **security** item (C3, cross-tenant `originalData` leak) be pulled forward as urgent regardless of scope?
3. Reseed clean before implementing/verifying?
