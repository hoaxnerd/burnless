/**
 * Heal raw LLM JSON into a strict OnboardingAgentResult.
 *
 * The agent is prompted for a specific schema but LLM output drifts: keys come
 * back snake_case or singular, enums get paraphrased, amounts arrive as "$1.5M"
 * strings, dates as "May 2024", etc. This module is the single place where we
 * coerce that drift back to the canonical shape — everything else downstream
 * may assume the result is well-typed.
 */

import type {
  BusinessModel,
  Department,
  EmployeeType,
  ExpenseCategory,
  ExpenseDraft,
  FundingRoundDraft,
  FundingType,
  HeadcountRoleDraft,
  OnboardingAgentResult,
  RevenueStreamDraft,
  RevenueType,
  Stage,
} from "./types";

const DEFAULT_YEAR = "2026";

/** Today as YYYY-MM-DD in the server's TZ. Phase 4 E §J: replaces the
 * hardcoded '2026-06-01' default that made every AI-suggested date land
 * in June regardless of when onboarding ran. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Primitive coercion ──────────────────────────────────────────────────────

/**
 * Parse "1.5M", "$2,000", "30K", or a raw number into an integer.
 * Returns 0 if no digits can be found.
 */
export function cleanNumber(val: unknown): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (val == null) return 0;
  const str = String(val).toLowerCase().replace(/[^0-9.kmb]/g, "");
  if (!str) return 0;
  let multiplier = 1;
  if (str.endsWith("k")) multiplier = 1_000;
  else if (str.endsWith("m")) multiplier = 1_000_000;
  else if (str.endsWith("b")) multiplier = 1_000_000_000;
  const num = parseFloat(str);
  return Number.isNaN(num) ? 0 : Math.round(num * multiplier);
}

const MONTH_TOKENS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Coerce a freeform date string into ISO YYYY-MM-DD. Accepts:
 *   - "2024-05-15" → unchanged
 *   - "2024"       → "2024-01-01"
 *   - "May 2024"   → "2024-05-01"
 *   - anything else → "${defaultYear}-01-01"
 */
export function cleanDate(value: unknown, defaultYear: string = DEFAULT_YEAR): string {
  if (value == null) return `${defaultYear}-01-01`;
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (/^\d{4}$/.test(str)) return `${str}-01-01`;

  const yearMatch = str.match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : defaultYear;

  const lower = str.toLowerCase();
  const monthIdx = MONTH_TOKENS.findIndex((m) => lower.includes(m));
  const month = monthIdx !== -1 ? String(monthIdx + 1).padStart(2, "0") : "01";
  return `${year}-${month}-01`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

// ── Enum mapping ────────────────────────────────────────────────────────────

function mapStage(raw: unknown): Stage {
  const stage = String(raw ?? "").toLowerCase();
  if (stage.includes("pre-seed") || stage.includes("pre_seed") || stage.includes("preseed")) return "Pre-seed";
  if (stage.includes("series a") || stage.includes("series_a")) return "Series A";
  if (
    stage.includes("series b") ||
    stage.includes("series_b") ||
    stage.includes("series c") ||
    stage.includes("series_c") ||
    stage.includes("series d") ||
    stage.includes("series_d")
  ) {
    return "Series B+";
  }
  if (stage.includes("bootstrap")) return "Bootstrapped";
  return "Seed";
}

function mapBusinessModel(raw: unknown): BusinessModel {
  const model = String(raw ?? "").toLowerCase();
  if (model.includes("saas") || model.includes("software")) return "SaaS";
  if (model.includes("marketplace")) return "Marketplace";
  if (model.includes("commerce") || model.includes("retail")) return "E-commerce";
  if (model.includes("service") || model.includes("agency") || model.includes("consulting")) return "Services";
  if (model.includes("hardware") || model.includes("physical")) return "Hardware";
  return "Other";
}

function mapFundingType(name: string): FundingType {
  const lower = name.toLowerCase();
  if (lower.includes("pre-seed") || lower.includes("pre_seed") || lower.includes("preseed")) return "pre_seed";
  if (lower.includes("series a") || lower.includes("series_a")) return "series_a";
  if (lower.includes("series b") || lower.includes("series_b")) return "series_b";
  if (
    lower.includes("series c") ||
    lower.includes("series_c") ||
    lower.includes("series d") ||
    lower.includes("series_d") ||
    lower.includes("series_c_plus")
  ) {
    return "series_c_plus";
  }
  if (lower.includes("debt") || lower.includes("loan")) return "debt";
  if (lower.includes("grant") || lower.includes("subsidy")) return "grant";
  return "seed";
}

function mapDepartment(raw: unknown): Department {
  const dept = String(raw ?? "").toLowerCase();
  if (dept.includes("eng") || dept.includes("dev") || dept.includes("tech") || dept.includes("product") || dept.includes("design")) {
    return "Engineering";
  }
  if (dept.includes("sal") || dept.includes("biz") || dept.includes("business dev")) return "Sales";
  if (dept.includes("mark") || dept.includes("growth") || dept.includes("pr")) return "Marketing";
  if (dept.includes("oper") || dept.includes("supp") || dept.includes("cust")) return "Operations";
  return "General & Admin";
}

function mapEmployeeType(raw: unknown): EmployeeType {
  const type = String(raw ?? "").toLowerCase();
  if (type.includes("part")) return "part_time";
  if (type.includes("contract")) return "contractor";
  return "full_time";
}

function mapExpenseCategory(raw: unknown): ExpenseCategory {
  const cat = String(raw ?? "").toLowerCase();
  if (cat.includes("cloud") || cat.includes("infra") || cat.includes("server") || cat.includes("aws") || cat.includes("host")) {
    return "Cloud Infrastructure";
  }
  if (cat.includes("market") || cat.includes("ad") || cat.includes("promo") || cat.includes("pr")) return "Marketing";
  if (cat.includes("office") || cat.includes("rent") || cat.includes("travel") || cat.includes("admin")) return "Office & Admin";
  return "Software & Tools";
}

function mapRevenueType(raw: unknown): RevenueType {
  const type = String(raw ?? "").toLowerCase();
  if (type.includes("one")) return "one_time";
  if (type.includes("usage")) return "usage_based";
  if (type.includes("service") || type.includes("consult")) return "services";
  if (type.includes("market")) return "marketplace";
  if (type.includes("eco") || type.includes("retail")) return "ecommerce";
  if (type.includes("hard")) return "hardware";
  return "subscription";
}

// ── Per-section healing ─────────────────────────────────────────────────────

function healFounders(raw: unknown): string[] {
  if (typeof raw === "string") {
    return raw
      .split(/, | and /)
      .map((f) => f.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f): string => {
      if (typeof f === "string") return f;
      const rec = asRecord(f);
      if (rec) return pickString(rec, "name", "founder");
      return "";
    })
    .filter(Boolean);
}

function healFundingRound(raw: Record<string, unknown>): FundingRoundDraft {
  const name = pickString(raw, "name", "round") || "Funding Round";
  const valuation = raw.valuation;
  const valuationLabel = typeof valuation === "string" || typeof valuation === "number"
    ? `Valuation: ${valuation}`
    : "";
  const explicitNotes = typeof raw.notes === "string" ? raw.notes : "";
  return {
    name,
    type: mapFundingType(name),
    amount: cleanNumber(raw.amount) || 1_000_000,
    date: cleanDate(raw.date ?? raw.year),
    preMoneyValuation:
      cleanNumber(raw.preMoneyValuation ?? raw.pre_money_valuation ?? raw.valuation) || null,
    dilutionPercent: cleanNumber(raw.dilutionPercent ?? raw.dilution) || null,
    notes: explicitNotes || valuationLabel,
  };
}

function healHeadcountRole(raw: Record<string, unknown>): HeadcountRoleDraft {
  return {
    title: pickString(raw, "title", "role") || "Software Engineer",
    department: mapDepartment(raw.department ?? raw.dept),
    employeeType: mapEmployeeType(raw.employeeType ?? raw.type),
    salary: cleanNumber(raw.salary) || 120_000,
    // Phase 4 E §J: fall back to today when startDate is absent so AI-suggested
    // hires don't silently land on 2026-01-01. cleanDate passes ISO through.
    startDate: cleanDate(raw.startDate ?? raw.start_date ?? todayIso()),
  };
}

// Phase 4 E §J: heal returns [] when the agent provides nothing — empty
// review step is honest, fallbacks were silently lying like 5f7f7da's
// auto-revenue-stream did. Constants retained for reference; unreached.
const FALLBACK_HEADCOUNT_STAGE: HeadcountRoleDraft[] = [
  { title: "CTO / Co-Founder", department: "Engineering", employeeType: "full_time", salary: 140_000, startDate: todayIso() },
  { title: "Lead Engineer", department: "Engineering", employeeType: "full_time", salary: 130_000, startDate: todayIso() },
  { title: "Product Designer", department: "Engineering", employeeType: "full_time", salary: 110_000, startDate: todayIso() },
  { title: "Account Executive", department: "Sales", employeeType: "full_time", salary: 80_000, startDate: todayIso() },
  { title: "Growth Marketer", department: "Marketing", employeeType: "full_time", salary: 90_000, startDate: todayIso() },
];

const FALLBACK_HEADCOUNT_MINIMAL: HeadcountRoleDraft[] = [
  { title: "Software Engineer", department: "Engineering", employeeType: "full_time", salary: 120_000, startDate: todayIso() },
  { title: "Product Manager", department: "Engineering", employeeType: "full_time", salary: 110_000, startDate: todayIso() },
];

function healHeadcount(raw: unknown): HeadcountRoleDraft[] {
  if (Array.isArray(raw)) {
    return raw
      .map((h) => asRecord(h))
      .filter((rec): rec is Record<string, unknown> => rec !== null)
      .map(healHeadcountRole);
  }
  // Number-shaped input ("headcount: 5") or absent → return empty; the
  // review step will show an honest empty state. (Phase 4 E §J)
  return [];
}

function healExpense(raw: unknown): ExpenseDraft | null {
  if (typeof raw === "string") {
    return {
      name: raw,
      category: mapExpenseCategory(raw),
      amount: 2_500,
      startDate: todayIso(),
      isRecurring: true,
    };
  }
  const rec = asRecord(raw);
  if (!rec) return null;
  return {
    name: pickString(rec, "name", "vendor") || "Office Supplies",
    category: mapExpenseCategory(rec.category ?? rec.cat ?? rec.name),
    amount: cleanNumber(rec.amount) || 1_500,
    startDate: cleanDate(rec.startDate ?? rec.start_date ?? todayIso()),
    isRecurring: rec.isRecurring !== undefined ? Boolean(rec.isRecurring) : true,
  };
}

const FALLBACK_EXPENSES: ExpenseDraft[] = [
  { name: "AWS Cloud Infrastructure", category: "Cloud Infrastructure", amount: 2_000, startDate: todayIso(), isRecurring: true },
  { name: "Google Workspace & Slack", category: "Software & Tools", amount: 500, startDate: todayIso(), isRecurring: true },
  { name: "Marketing & Ads", category: "Marketing", amount: 1_500, startDate: todayIso(), isRecurring: true },
];

function healExpenses(raw: unknown): ExpenseDraft[] {
  if (!Array.isArray(raw)) return []; // Phase 4 E §J: honest empty, not fake defaults
  return raw
    .map(healExpense)
    .filter((e): e is ExpenseDraft => e !== null);
}

function healRevenueStream(raw: unknown): RevenueStreamDraft | null {
  if (typeof raw === "string") {
    return {
      name: raw,
      type: "subscription",
      amount: 49,
      quantity: 100,
      startDate: todayIso(),
      notes: "",
    };
  }
  const rec = asRecord(raw);
  if (!rec) return null;
  return {
    name: pickString(rec, "name", "stream") || "Subscription Revenue",
    type: mapRevenueType(rec.type),
    amount: cleanNumber(rec.amount) || 49,
    quantity: cleanNumber(rec.quantity) || 100,
    startDate: cleanDate(rec.startDate ?? rec.start_date ?? todayIso()),
    notes: typeof rec.notes === "string" ? rec.notes : "",
  };
}

function fallbackRevenueFromArr(raw: Record<string, unknown>): RevenueStreamDraft[] {
  const estimated = asRecord(raw.estimated_revenue);
  const annual =
    cleanNumber(raw.annual_revenue) ||
    cleanNumber(raw.estimated_revenue) ||
    (estimated ? cleanNumber(estimated["2025"] ?? estimated["2024"] ?? estimated["2023"]) : 0);

  if (annual <= 0) {
    return [
      {
        name: "Pro SaaS Subscription",
        type: "subscription",
        amount: 49,
        quantity: 150,
        startDate: todayIso(),
        notes: "Default estimate",
      },
    ];
  }

  const monthlyRev = Math.round(annual / 12);
  return [
    {
      name: "SaaS Subscription Revenue",
      type: "subscription",
      amount: 100,
      quantity: Math.max(1, Math.round(monthlyRev / 100)),
      startDate: todayIso(),
      notes: `Based on estimated ARR of $${(annual / 1_000_000).toFixed(1)}M`,
    },
  ];
}

function healRevenueStreams(raw: Record<string, unknown>): RevenueStreamDraft[] {
  const candidate = raw.revenueStreams ?? raw.revenue_streams ?? raw.revenue;
  if (Array.isArray(candidate)) {
    // Phase 4 E §J: if the agent explicitly gave us an array (even empty),
    // respect it — empty is honest. Only fall back when no key was present.
    return candidate
      .map(healRevenueStream)
      .filter((r): r is RevenueStreamDraft => r !== null);
  }
  return fallbackRevenueFromArr(raw);
}

// ── Public entrypoint ───────────────────────────────────────────────────────

export function healOnboardingResult(raw: unknown): OnboardingAgentResult {
  const rec = asRecord(raw) ?? {};
  const rawFundingRounds = rec.fundingRounds ?? rec.funding_rounds ?? rec.funding_history ?? rec.funding ?? [];

  return {
    companyName: pickString(rec, "companyName", "company_name", "name") || "My Company",
    stage: mapStage(rec.stage),
    businessModel: mapBusinessModel(rec.businessModel ?? rec.business_model),
    industry: pickString(rec, "industry", "vertical") || "Software & SaaS",
    founders: healFounders(rec.founders),
    fundingRounds: Array.isArray(rawFundingRounds)
      ? rawFundingRounds
          .map((r) => asRecord(r))
          .filter((r): r is Record<string, unknown> => r !== null)
          .map(healFundingRound)
      : [],
    headcount: healHeadcount(rec.headcount ?? rec.headcount_plan ?? rec.headcount_suggestions),
    expenses: healExpenses(rec.expenses ?? rec.operating_expenses ?? rec.estimated_monthly_expenses),
    revenueStreams: healRevenueStreams(rec),
  };
}
