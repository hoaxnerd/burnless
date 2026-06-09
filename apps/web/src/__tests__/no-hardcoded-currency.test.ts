import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import path from "node:path";

// Resolve repo root: vitest runs from apps/web/, so go up two levels.
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../");

/**
 * Files / directory prefixes that are allowed to contain currency symbols or
 * hardcoded dollar patterns.  Each entry must include a comment explaining WHY.
 *
 * Prefix matching is used: an entry "foo/bar/" matches any path under that dir.
 */
const ALLOWED = [
  // ── Core definitions ──────────────────────────────────────────────────────
  // Canonical CURRENCIES map defining $, €, £, ¥, ₹ as symbol values.
  "packages/types/src/index.ts",

  // ── This file ─────────────────────────────────────────────────────────────
  // Contains the regex patterns themselves — must not be flagged.
  "apps/web/src/__tests__/no-hardcoded-currency.test.ts",

  // ── Type-package tests ────────────────────────────────────────────────────
  // Pin formatter output for all supported currencies including €, £, ¥, ₹.
  "packages/types/src/__tests__/",

  // ── Locale formatter tests ────────────────────────────────────────────────
  // Task 7: tests that pin locale-aware formatter output for all currencies.
  "apps/web/src/components/locale/__tests__/",

  // ── Engine regression guard ───────────────────────────────────────────────
  // Task 6's guard — contains the [€£¥₹] regex itself.
  "packages/engine/src/__tests__/no-currency-in-engine.test.ts",

  // ── Platform-priced USD displays ──────────────────────────────────────────
  // Task 9 review: AI provider costs and AI credits are platform-wide USD prices,
  // not per-company financial data, so hardcoded USD is legitimate here.
  "apps/web/src/app/(dashboard)/settings/ai-dashboard-tab.tsx",
  "apps/web/src/app/(dashboard)/settings/invite-codes-tab.tsx",
  "apps/web/src/app/(dashboard)/settings/invite-codes-types.ts",

  // ── Landing / marketing page components ───────────────────────────────────
  // Static fictional demo values used for the marketing landing page UI.
  // Not real user financial data; these are hardcoded mock values by design.
  "apps/web/src/components/landing/",

  // ── Slider range markers in funding dilution calculator ───────────────────
  // funding-details.tsx lines 419/420/451/452: "$0", "$20M", "$100M" are
  // static bound labels on range inputs (min/max markers), not user data.
  "apps/web/src/app/(dashboard)/funding/funding-details.tsx",

  // ── CSV import parser ─────────────────────────────────────────────────────
  // import-flow.tsx line 134: /[$,€£()]/ in a regex to STRIP currency
  // characters from user-supplied CSV amounts. Not display code.
  "apps/web/src/app/(dashboard)/import/import-flow.tsx",
  // import-utils.ts: /[$,€£()]/ regex in parseAmountCell() to STRIP currency
  // glyphs from CSV cell input before numeric parsing. Sanitization, not display.
  "apps/web/src/app/(dashboard)/import/import-utils.ts",
  // Test for the strip — exercises parseAmountCell("€42") to verify glyphs are
  // stripped. Asserts on input shape, not display output.
  "apps/web/src/app/(dashboard)/import/__tests__/",

  // ── AI prompt templates ───────────────────────────────────────────────────
  // enrich/route.ts lines 144-145: "$0, $10K, $50K" are format examples inside
  // an AI prompt telling the model what shape to return, not display values.
  "apps/web/src/app/api/onboarding/enrich/route.ts",
  // route.ts line 150: comment "// $150/hr default", not display code.
  "apps/web/src/app/api/onboarding/route.ts",

  // ── Locale context JSDoc examples ─────────────────────────────────────────
  // locale-context.tsx lines 22/24: JSDoc showing "$1,234" / "₹1,23,456" as
  // format examples in documentation comments.
  "apps/web/src/components/locale/locale-context.tsx",

  // ── Chart utilities: comments & JSDoc ─────────────────────────────────────
  // chart-theme.ts line 52: JSDoc "e.g., "$1.2M", "₹10L"" in a comment.
  "apps/web/src/components/charts/chart-theme.ts",
  // chart-tooltip.tsx line 7: comment showing example format.
  "apps/web/src/components/charts/chart-tooltip.tsx",
  // chart-axis-formatter.test.ts (Plan 4 E Task 7): pins formatCompactCurrency
  // output ("$120k", "$4.0M", "$0") — fixture assertions in a test, not display code.
  // formatCompactCurrency defaults to "$" when no currency/locale is supplied.
  "apps/web/src/components/charts/__tests__/",

  // ── AI page-context sample prompts ────────────────────────────────────────
  // page-context.ts line 48: sample question "$3M raise at $12M pre" shown
  // to users as an example — not a formatted financial figure.
  "apps/web/src/components/ai/page-context.ts",

  // ── Empty-state AI hint ────────────────────────────────────────────────────
  // empty-state.tsx line 152: a static UI hint string ("$3M at $15M pre") —
  // a sample question, not a formatted financial value.
  "apps/web/src/components/ui/empty-state.tsx",

  // ── form-field prop JSDoc ─────────────────────────────────────────────────
  // form-field.tsx line 94: JSDoc `/** Currency symbol to display (e.g., "$", "₹", "€"). */`
  // — a prop documentation comment, not display code.
  "apps/web/src/components/ui/form-field.tsx",

  // ── Zod schema comments / error messages ──────────────────────────────────
  // ai-tools/types.ts: "$100B" and "$100M" in Zod .max() error strings and
  // comments explaining cap values. Not display code.
  "apps/web/src/lib/ai-tools/types.ts",

  // ── AI narrative prompt instructions ─────────────────────────────────────
  // digest-narrative.ts line 18: AI prompt format instruction "$42k",
  // telling the model what format to use. Not display code.
  "apps/web/src/lib/digest-narrative.ts",

  // ── AI plans config ───────────────────────────────────────────────────────
  // plans.config.ts: "$0", "$10", "$79" are platform-priced plan display labels
  // (USD-only platform pricing, not per-company currency). Same rationale as
  // ai-dashboard-tab.tsx (Task 9).
  "packages/ai/src/plans.config.ts",
  // routing.ts line 109: comment about token cost baseline. Not display code.
  "packages/ai/src/routing.ts",
  // page-insights.ts line 155: comment example "$1M ARR". Not display code.
  "packages/ai/src/page-insights.ts",

  // ── DB schema / seed: comments only ─────────────────────────────────────
  // schema.ts: "// $50 default" comments on integer columns.
  "packages/db/src/schema.ts",
  // seed.ts: comments describing seed data amounts.
  "packages/db/src/seed.ts",

  // ── Test files: assertions / fixtures ────────────────────────────────────
  // All __tests__ directories: contain fixture data and assertions that pin
  // formatter output (e.g., "$750k", "$5.2M") or test parseMoneyAmount inputs.
  // These legitimately contain dollar strings as expected values.
  "apps/web/src/app/(dashboard)/ai/_components/__tests__/",
  "apps/web/src/app/(dashboard)/dashboard/__tests__/",
  "apps/web/src/app/(dashboard)/data-room/__tests__/",
  // metrics-explorer-ghost.test.tsx (Phase 5 §5.7): mocks fmtCurrency as
  // `$${...}` and asserts dark metrics render "—" not "$NaN"/"$0"/"$600" —
  // fixture stubs + assertions on display output, not display code.
  "apps/web/src/app/(dashboard)/reports/metrics/__tests__/",
  "apps/web/src/app/api/chat/__tests__/",
  "apps/web/src/app/api/import/__tests__/",
  "apps/web/src/app/api/onboarding/__tests__/",
  // ── Form primitive tests ──────────────────────────────────────────────────
  // CurrencyInput.test.tsx uses `$${n}` inside a vi.mock() fmtCompact stub —
  // a fixture value in a test, not display code.
  "apps/web/src/components/forms/primitives/__tests__/",
  "apps/web/src/components/providers/__tests__/",
  "apps/web/src/components/ui/__tests__/",
  "apps/web/src/lib/__tests__/",
  "packages/ai/src/__tests__/",
  "packages/engine/src/__tests__/",

  // ── Revenue stream form tests ─────────────────────────────────────────────
  // revenue-stream-form.test.tsx uses `$${n.toFixed(2)}` inside a vi.mock()
  // fmtCurrency/fmtCompact stub — fixture values in a test, not display code.
  "apps/web/src/app/(dashboard)/revenue/__tests__/",

  // ── Team form tests (Plan 4 D Task 3) ─────────────────────────────────────
  // headcount-form.test.tsx, bonuses-list.test.tsx, salary-changes-list.test.tsx,
  // equity-grants-list.test.tsx use `$${n.toFixed(2)}` inside vi.mock()
  // fmtCurrency/fmtCompact stubs for the CurrencyInput locale-context mock.
  // Fixture values in tests, not display code.
  "apps/web/src/app/(dashboard)/team/__tests__/",

  // ── E2E (Playwright) tests ────────────────────────────────────────────────
  // E2E tests assert text visible in the browser, which includes formatted
  // currency output from formatters and AI responses. Dollar amounts here are
  // assertions, not display code.
  "apps/web/e2e/",

  // ── Onboarding agent (Plan 4 E scope) ─────────────────────────────────────
  // TODO Plan 4 E: remove after onboarding heal.ts is cleaned up.
  // heal.ts line 335 has a `$${...}M` template literal building a notes string;
  // lines 5/32 are JSDoc comments. onboarding-imports.ts lines 8/9 are JSDoc
  // comments describing old behaviour. heal.test.ts uses "$30K"/"$1.5M" as
  // cleanNumber() input fixtures. None are display code, but the production
  // template literal at heal.ts:335 should eventually use formatCurrency.
  "apps/web/src/lib/onboarding-imports.ts",
  "apps/web/src/lib/onboarding-agent/heal.ts",
  "apps/web/src/lib/onboarding-agent/__tests__/",

  // ── Onboarding wizard tests (Batch H ONB-02 / signup-name) ────────────────
  // name-fallback.test.tsx / summary-sections.test.tsx use `$${n}` inside a
  // vi.mock() fmtCurrency/fmtCompact stub — fixture values in a test, same
  // rationale as the revenue/team/forms test-dir entries above.
  "apps/web/src/app/onboarding/__tests__/",
  "apps/web/src/app/onboarding/_components/__tests__/",
  "apps/web/src/app/onboarding/_components/review/__tests__/",
  // ai-tabs-render.test.tsx (Batch H SET-07) uses `$${n}` in a vi.mock() stub.
  "apps/web/src/app/(dashboard)/settings/__tests__/",

  // ── Regex backreferences ($1/$2), NOT currency ────────────────────────────
  // These lines contain String.replace() backreference templates ("$1 $2" /
  // "$1") which the $<digit> matcher flags as false positives. Not display code:
  // data-diff-view/permission-card/diff-gate run the same camelCase splitter
  // `.replace(/([a-z0-9])([A-Z])/g, "$1 $2")`; the two guard walkers strip
  // comments with `.replace(/(^|[^:])\/\/.../g, "$1")`.
  "apps/web/src/components/scenarios/data-diff-view.tsx",
  "apps/web/src/app/(dashboard)/ai/_components/permission-card.tsx",
  "apps/web/src/app/(dashboard)/ai/_components/generative/diff-gate.tsx",
  "apps/web/src/__tests__/component-reachability.test.ts",
  "apps/web/src/__tests__/no-console-in-production.test.ts",
];

/**
 * Returns true if a grep result line (format: "relative-path:lineno:content")
 * is covered by the allowlist. Prefix matching handles both exact file paths
 * and directory prefixes.
 */
function isAllowed(line: string): boolean {
  return ALLOWED.some((prefix) => line.startsWith(prefix));
}

describe("no-hardcoded-currency", () => {
  it("has no hardcoded `$<value>` template interpolations in string sources", () => {
    // Grep for any $ character across .ts/.tsx files, then JS-side filter for:
    //   1. `$${}` — dollar sign immediately before a template interpolation (`\$\$\{`)
    //   2. `$<digit>` — dollar sign immediately before a digit (e.g., "$42", "$1.5M")
    // Excludes `.d.ts` files to avoid noise from declaration files.
    const raw = execSync(
      "grep -rEn '\\$' apps packages --include='*.ts' --include='*.tsx' || true",
      { encoding: "utf8", cwd: REPO_ROOT, maxBuffer: 50 * 1024 * 1024 }
    );

    const HARDCODED_DOLLAR = /\$\$\{|\$\d/;
    const offenders = raw
      .split("\n")
      .filter(Boolean)
      .filter((line) => !line.includes(".d.ts:"))
      .filter((line) => HARDCODED_DOLLAR.test(line))
      .filter((line) => !isAllowed(line));

    expect(offenders, `Hardcoded $ patterns found:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("has no non-dollar currency symbols in source", () => {
    const raw = execSync(
      "grep -rEn '[€£¥₹]' apps packages --include='*.ts' --include='*.tsx' || true",
      { encoding: "utf8", cwd: REPO_ROOT, maxBuffer: 50 * 1024 * 1024 }
    );

    const offenders = raw
      .split("\n")
      .filter(Boolean)
      .filter((line) => !line.includes(".d.ts:"))
      .filter((line) => !isAllowed(line));

    expect(offenders, `Non-dollar currency symbols found:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("has no `new Intl.NumberFormat(..., { currency: 'XXX' })` with hardcoded code", () => {
    const raw = execSync(
      `grep -rEn 'new Intl\\.NumberFormat\\([^)]*currency:\\s*"[A-Z]{3}"' apps packages --include='*.ts' --include='*.tsx' || true`,
      { encoding: "utf8", cwd: REPO_ROOT, maxBuffer: 50 * 1024 * 1024 }
    );

    const offenders = raw
      .split("\n")
      .filter(Boolean)
      .filter((line) => !line.includes(".d.ts:"))
      .filter((line) => !isAllowed(line));

    expect(offenders, `Hardcoded Intl.NumberFormat currency codes found:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("has no `formatCurrency(v, 'XXX', ...)` with hardcoded ISO currency code", () => {
    // Catches the exact pattern Plan 4 C spent 7 tasks fixing, which the previous
    // regex gap silently missed: formatCurrency(value, "USD", ...) etc.
    const raw = execSync(
      `grep -rEn 'formatCurrency\\s*\\([^,)]+,\\s*"[A-Z]{3}"' apps packages --include='*.ts' --include='*.tsx' || true`,
      { encoding: "utf8", cwd: REPO_ROOT, maxBuffer: 50 * 1024 * 1024 }
    );

    const offenders = raw
      .split("\n")
      .filter(Boolean)
      .filter((line) => !line.includes(".d.ts:"))
      .filter((line) => !isAllowed(line));

    expect(offenders, `Hardcoded formatCurrency ISO codes found:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("has no `formatCompactAmount(v, 'XXX')` with hardcoded ISO currency code", () => {
    // Catches the compact-amount variant of the same pattern.
    const raw = execSync(
      `grep -rEn 'formatCompactAmount\\s*\\([^,)]+,\\s*"[A-Z]{3}"' apps packages --include='*.ts' --include='*.tsx' || true`,
      { encoding: "utf8", cwd: REPO_ROOT, maxBuffer: 50 * 1024 * 1024 }
    );

    const offenders = raw
      .split("\n")
      .filter(Boolean)
      .filter((line) => !line.includes(".d.ts:"))
      .filter((line) => !isAllowed(line));

    expect(offenders, `Hardcoded formatCompactAmount ISO codes found:\n${offenders.join("\n")}`).toEqual([]);
  });
});
