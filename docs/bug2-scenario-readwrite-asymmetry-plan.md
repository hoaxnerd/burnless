# Bug 2 Fix Plan — Read/Write Scenario-Context Asymmetry (edit/delete don't reflect)

Status: **PLAN — awaiting sign-off** (do not implement yet)
Owner: TBD · Source diagnosis: `E2E-TRIAGE.md` → "BUG 2"

## 1. Root cause (confirmed + reproduced)
When **no `active-scenario-id` cookie** is set (i.e. not inside a sandbox):
- **READ** (every dashboard page): `scenario = getActiveScenario(companyId, cookie)` falls back to `getDefaultScenario` = **the first scenario row** ("Base Case"), then resolves data against it (`resolveEntities` merges that scenario's overrides). → `lib/data.ts`.
- **WRITE** (DELETE/PATCH via `apiFetch`): no cookie → no `X-Scenario-Id` header → `getActiveScenario(request)` = **null** → `scenarioUpdate`/`scenarioDelete` mutate **base tables**. → `lib/scenario-middleware.ts`, `packages/db/.../scenario-mutations.ts`.

⇒ Reads show the *default scenario's overridden* data; writes hit *base*. The moment the default scenario carries any override (user entered "Base Case" sandbox & edited, AI tool, or e2e), edit/delete stop reflecting: the write succeeds against base (often 0 rows / wrong target), `revalidateTag` fires (**AI insight timer resets**), but the read re-applies the override → **the row appears unchanged**. Reproduced live with the phantom "realtime-spec" stream (a `modify` override on Base Case for a base row that no longer exists).

## 2. Design intent vs. reality
Per CLAUDE.md the overlay model is: **base tables are canonical; scenarios are override overlays.** So the "no sandbox" view should BE base (`scenarioId = null`) for both read and write. The `getDefaultScenario` fallback (an arbitrary editable scenario standing in for base) is the defect. `resolveEntities(type, base, null)` already returns pure base — the data layer is ready.

## 3. Recommended fix — "default view = true base (null)"
Make the read path use `cookieScenarioId ?? null` everywhere, matching writes.

### 3a. Data-helper signature change (the main ripple)
Read helpers in `lib/data.ts` currently take `scenarioId` and derive `companyId` from it (`db.select companyId from scenarios where id=scenarioId`) — so they can't accept null. Change them to take `(companyId, scenarioId: string | null)`:
- `getRevenueStreams`, `getHeadcountPlans`, `getFundingRounds`, `getAccounts`, `getDepartments`, `getForecastLines`, and any sibling resolved-entity getters.
- Internally: drop the scenario→companyId lookup (callers pass companyId); pass `scenarioId` straight to `resolveEntities` (null ⇒ base).
- Keep `cachedQuery` keys/tags; add `companyId` to the key parts.

### 3b. Page changes (~14 files)
`dashboard, revenue, expenses, team, funding, funding/cap-table, data-room, reports/{pl,cf,bs,runway,bvA,metrics,board-update}`:
- Replace `const scenario = await getActiveScenario(...); if (!scenario) return <Prompt>; ...compute(company.id, scenario.id)` with:
  - `const activeScenarioId = (await getServerScenarioId()) ?? null;` (null = base)
  - compute/read with `activeScenarioId`.
  - Re-base the empty-state guard on **company/data existence**, not on "has a scenario" (the `!scenario` guard is the wrong signal in the overlay model). Decide per page: keep `SetupPrompt` for no-company; drop `ScenarioPrompt`/`NoScenarioPrompt` (or only show when truly zero data).
- `compute-dashboard`, `compute-revenue`, `compute-digest` already thread a `scenarioId`; confirm they accept null end-to-end.

### 3c. Secondary correctness fixes (cheap, do together)
- `getDefaultScenario`: add deterministic `ORDER BY created_at` (and only used for the scenarios LIST now, not for data resolution). Likely removable entirely.
- `DELETE /api/revenue-streams/[id]` (and siblings): return **404 when 0 rows** deleted (base path) so "delete nothing" is not reported as success. Mirror PATCH's existing `!row → 404`.
- Client delete handlers (e.g. `revenue-stream-breakdown.tsx handleDelete`): stop swallowing errors (`catch {}`) — surface a toast so silent failures are visible.

## 4. Ripple checklist (verify each)
- [ ] Read helpers refactor (`lib/data.ts`) + all call sites compile.
- [ ] 14 page files render base when no cookie; render the sandbox scenario when cookie set.
- [ ] `compute-dashboard` / `compute-revenue` / `compute-digest` accept null scenarioId.
- [ ] API read routes that use these helpers (`/api/metrics`, `/api/statements`, `/api/cap-table`, etc.) still pass a valid arg (companyId now).
- [ ] Scenario **enter/exit** still works (cookie set → reads+writes both use that id → overrides apply & are editable in-sandbox).
- [ ] **Promotion** (scenario→base) unaffected (still operates on explicit scenario id).
- [ ] AI tools (`lib/ai-tools/*`) that read/write with scenarioId — confirm they pass the active scenario (or null) consistently.
- [ ] Scenario isolation/overlay **e2e + unit tests** still pass (PGLite tests in `packages/db`, `scenario-*` e2e).
- [ ] No-company and zero-data empty states still render.

## 5. Verification (browser + tests)
- Reseed clean (TRUNCATE + `db:seed`) to clear e2e-pollution phantoms.
- Browser: on base (no sandbox) — delete a revenue stream → row gone immediately + DB row gone; edit a stream name → reflects immediately. Repeat for expenses, team, funding (the "site-wide" claim).
- Enter a scenario → edit → reflects in-sandbox; exit → base unchanged.
- `pnpm --filter @burnless/db test` + scenario e2e specs.

## 6. Risks
- Touch-heavy (helper signatures + 14 pages) → compile churn; mitigated by TS catching call sites.
- Empty-state guard change could regress "no data" screens — verify each page.
- If any feature *relied* on the default-scenario-as-base behavior, it flips to true base — intended, but watch dashboard numbers (should match base, not Base-Case-with-overrides).

## 7. Smaller-scope alternative (if full refactor is too much now)
Stopgap that removes the *divergence* without the helper refactor: make the default-scenario view **override-free by guaranteeing the default/baseline scenario can never hold overrides** — e.g. (a) forbid entering the baseline scenario as a sandbox, and (b) one-time clean overrides off it. This hides the symptom in normal use but does NOT fix the architectural asymmetry (writes still target base while reads target a scenario), so it's fragile. **Not recommended** except as a hotfix.

## 8. Decision needed
- Approve **Recommended fix (§3)**? Or **smaller-scope (§7)**?
- Should I reseed before/after to clear the current phantom data?
