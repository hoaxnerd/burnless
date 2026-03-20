/**
 * Database seed script for dev and test environments.
 *
 * Creates a realistic demo company ("Acme SaaS Inc.") with:
 *   - 1 demo user + company membership
 *   - 4 departments
 *   - Full chart of accounts (income, expense, COGS, asset, liability)
 *   - 3 scenarios (base/best/worst) with forecast lines covering all 5 methods
 *   - 4 revenue stream types (subscription, one_time, usage_based, services)
 *   - Headcount plans across departments
 *   - 2 historical + 1 projected funding round
 *   - 6 months of historical transactions
 *   - System metrics (MRR, ARR, burn rate, runway, CAC, LTV)
 *   - AI feature flags enabled
 *   - Privacy consents granted
 *
 * Idempotent: safe to run multiple times (uses fixed IDs + ON CONFLICT DO NOTHING).
 *
 * Usage: pnpm db:seed
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/burnless";

// ── Stable IDs (deterministic for idempotency) ─────────────────────────────

const IDS = {
  user: "00000000-0000-4000-a000-000000000001",
  company: "00000000-0000-4000-a000-000000000010",
  member: "00000000-0000-4000-a000-000000000011",

  // Departments
  deptEngineering: "00000000-0000-4000-a000-000000000020",
  deptSales: "00000000-0000-4000-a000-000000000021",
  deptOperations: "00000000-0000-4000-a000-000000000022",
  deptProduct: "00000000-0000-4000-a000-000000000023",

  // Financial Accounts — Income
  acctSaasRevenue: "00000000-0000-4000-a000-000000000100",
  acctServicesRevenue: "00000000-0000-4000-a000-000000000101",
  acctOtherIncome: "00000000-0000-4000-a000-000000000102",
  // Financial Accounts — COGS
  acctCloudInfra: "00000000-0000-4000-a000-000000000110",
  acctPaymentProcessing: "00000000-0000-4000-a000-000000000111",
  // Financial Accounts — Operating Expense
  acctSalaries: "00000000-0000-4000-a000-000000000120",
  acctMarketing: "00000000-0000-4000-a000-000000000121",
  acctOffice: "00000000-0000-4000-a000-000000000122",
  acctSoftwareTools: "00000000-0000-4000-a000-000000000123",
  acctTravel: "00000000-0000-4000-a000-000000000124",
  acctLegal: "00000000-0000-4000-a000-000000000125",
  acctInsurance: "00000000-0000-4000-a000-000000000126",
  // Financial Accounts — Asset / Liability / Equity
  acctCash: "00000000-0000-4000-a000-000000000130",
  acctAccountsReceivable: "00000000-0000-4000-a000-000000000131",
  acctAccountsPayable: "00000000-0000-4000-a000-000000000140",
  acctRetainedEarnings: "00000000-0000-4000-a000-000000000150",

  // Scenarios
  scenarioBase: "00000000-0000-4000-a000-000000000200",
  scenarioBest: "00000000-0000-4000-a000-000000000201",
  scenarioWorst: "00000000-0000-4000-a000-000000000202",

  // Forecast Lines (base scenario)
  flOfficeRent: "00000000-0000-4000-a000-000000000300",
  flMarketingGrowth: "00000000-0000-4000-a000-000000000301",
  flCloudPerUnit: "00000000-0000-4000-a000-000000000302",
  flPaymentPctOf: "00000000-0000-4000-a000-000000000303",
  flSoftwareFixed: "00000000-0000-4000-a000-000000000304",
  // Best/worst scenario lines
  flBestRevGrowth: "00000000-0000-4000-a000-000000000310",
  flWorstRevGrowth: "00000000-0000-4000-a000-000000000320",

  // Revenue Streams (base scenario)
  rsSubscription: "00000000-0000-4000-a000-000000000400",
  rsOneTime: "00000000-0000-4000-a000-000000000401",
  rsUsageBased: "00000000-0000-4000-a000-000000000402",
  rsServices: "00000000-0000-4000-a000-000000000403",

  // Headcount Plans
  hcEngineers: "00000000-0000-4000-a000-000000000500",
  hcVpEng: "00000000-0000-4000-a000-000000000501",
  hcSdrs: "00000000-0000-4000-a000-000000000502",
  hcAe: "00000000-0000-4000-a000-000000000503",
  hcPm: "00000000-0000-4000-a000-000000000504",
  hcDesigner: "00000000-0000-4000-a000-000000000505",

  // Funding Rounds
  frPreSeed: "00000000-0000-4000-a000-000000000600",
  frSeed: "00000000-0000-4000-a000-000000000601",
  frSeriesA: "00000000-0000-4000-a000-000000000602",

  // Metrics
  metricMrr: "00000000-0000-4000-a000-000000000700",
  metricArr: "00000000-0000-4000-a000-000000000701",
  metricBurnRate: "00000000-0000-4000-a000-000000000702",
  metricRunway: "00000000-0000-4000-a000-000000000703",
  metricCac: "00000000-0000-4000-a000-000000000704",
  metricLtv: "00000000-0000-4000-a000-000000000705",

  // AI
  aiFeatureFlag: "00000000-0000-4000-a000-000000000800",
  aiConversation: "00000000-0000-4000-a000-000000000810",

  // Privacy
  consentProcessing: "00000000-0000-4000-a000-000000000900",
  consentAi: "00000000-0000-4000-a000-000000000901",
} as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

function monthDate(year: number, month: number, day = 1): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Generate a stable transaction ID from account + month + index */
function txnId(accountShort: string, monthStr: string, idx: number): string {
  const hash = Array.from(`${accountShort}-${monthStr}-${idx}`).reduce(
    (h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0,
    0
  );
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return `00000000-0000-4000-b000-${hex.padStart(12, "0")}`;
}

// ── Main seed function ──────────────────────────────────────────────────────

async function seed() {
  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  console.log("🌱 Seeding database...\n");

  // ── 1. Demo User ────────────────────────────────────────────────────────

  console.log("  → User: demo@burnless.app");
  await db
    .insert(schema.users)
    .values({
      id: IDS.user,
      name: "Alex Chen",
      email: "demo@burnless.app",
      emailVerified: new Date(),
    })
    .onConflictDoNothing();

  // ── 2. Demo Company ─────────────────────────────────────────────────────

  console.log("  → Company: Acme SaaS Inc.");
  await db
    .insert(schema.companies)
    .values({
      id: IDS.company,
      name: "Acme SaaS Inc.",
      stage: "seed",
      businessModel: "saas",
      industry: "Developer Tools",
      foundedDate: monthDate(2024, 6),
      fiscalYearEnd: 12,
      currency: "USD",
      locale: "en-US",
      timezone: "America/New_York",
      region: "us-east",
      ownerId: IDS.user,
    })
    .onConflictDoNothing();

  // ── 3. Company Membership ───────────────────────────────────────────────

  await db
    .insert(schema.companyMembers)
    .values({
      id: IDS.member,
      companyId: IDS.company,
      userId: IDS.user,
      role: "owner",
    })
    .onConflictDoNothing();

  // ── 4. Departments ──────────────────────────────────────────────────────

  console.log("  → 4 departments");
  const depts = [
    { id: IDS.deptEngineering, name: "Engineering" },
    { id: IDS.deptSales, name: "Sales & Marketing" },
    { id: IDS.deptOperations, name: "Operations" },
    { id: IDS.deptProduct, name: "Product" },
  ];
  for (const d of depts) {
    await db
      .insert(schema.departments)
      .values({ ...d, companyId: IDS.company })
      .onConflictDoNothing();
  }

  // ── 5. Chart of Accounts ────────────────────────────────────────────────

  console.log("  → 15 financial accounts");
  const accts: Array<{
    id: string;
    name: string;
    type: "income" | "expense" | "asset" | "liability" | "equity";
    category:
      | "revenue"
      | "cogs"
      | "operating_expense"
      | "other_income"
      | "other_expense"
      | "asset"
      | "liability"
      | "equity";
    isSystem: boolean;
    sortOrder: number;
  }> = [
    // Income
    {
      id: IDS.acctSaasRevenue,
      name: "SaaS Revenue",
      type: "income",
      category: "revenue",
      isSystem: true,
      sortOrder: 1,
    },
    {
      id: IDS.acctServicesRevenue,
      name: "Professional Services",
      type: "income",
      category: "revenue",
      isSystem: false,
      sortOrder: 2,
    },
    {
      id: IDS.acctOtherIncome,
      name: "Other Income",
      type: "income",
      category: "other_income",
      isSystem: false,
      sortOrder: 3,
    },
    // COGS
    {
      id: IDS.acctCloudInfra,
      name: "Cloud Infrastructure",
      type: "expense",
      category: "cogs",
      isSystem: true,
      sortOrder: 10,
    },
    {
      id: IDS.acctPaymentProcessing,
      name: "Payment Processing",
      type: "expense",
      category: "cogs",
      isSystem: false,
      sortOrder: 11,
    },
    // Operating Expenses
    {
      id: IDS.acctSalaries,
      name: "Salaries & Wages",
      type: "expense",
      category: "operating_expense",
      isSystem: true,
      sortOrder: 20,
    },
    {
      id: IDS.acctMarketing,
      name: "Marketing & Advertising",
      type: "expense",
      category: "operating_expense",
      isSystem: false,
      sortOrder: 21,
    },
    {
      id: IDS.acctOffice,
      name: "Office & Facilities",
      type: "expense",
      category: "operating_expense",
      isSystem: false,
      sortOrder: 22,
    },
    {
      id: IDS.acctSoftwareTools,
      name: "Software & Tools",
      type: "expense",
      category: "operating_expense",
      isSystem: false,
      sortOrder: 23,
    },
    {
      id: IDS.acctTravel,
      name: "Travel & Entertainment",
      type: "expense",
      category: "operating_expense",
      isSystem: false,
      sortOrder: 24,
    },
    {
      id: IDS.acctLegal,
      name: "Legal & Compliance",
      type: "expense",
      category: "operating_expense",
      isSystem: false,
      sortOrder: 25,
    },
    {
      id: IDS.acctInsurance,
      name: "Insurance",
      type: "expense",
      category: "operating_expense",
      isSystem: false,
      sortOrder: 26,
    },
    // Asset / Liability / Equity
    {
      id: IDS.acctCash,
      name: "Cash & Equivalents",
      type: "asset",
      category: "asset",
      isSystem: true,
      sortOrder: 30,
    },
    {
      id: IDS.acctAccountsReceivable,
      name: "Accounts Receivable",
      type: "asset",
      category: "asset",
      isSystem: false,
      sortOrder: 31,
    },
    {
      id: IDS.acctAccountsPayable,
      name: "Accounts Payable",
      type: "liability",
      category: "liability",
      isSystem: false,
      sortOrder: 40,
    },
    {
      id: IDS.acctRetainedEarnings,
      name: "Retained Earnings",
      type: "equity",
      category: "equity",
      isSystem: false,
      sortOrder: 50,
    },
  ];

  for (const a of accts) {
    await db
      .insert(schema.financialAccounts)
      .values({ ...a, companyId: IDS.company })
      .onConflictDoNothing();
  }

  // ── 6. Scenarios ────────────────────────────────────────────────────────

  console.log("  → 3 scenarios (base/best/worst)");
  const scenarioData = [
    {
      id: IDS.scenarioBase,
      name: "Base Case",
      type: "base" as const,
      isDefault: true,
      description: "Realistic growth trajectory based on current metrics",
    },
    {
      id: IDS.scenarioBest,
      name: "Best Case",
      type: "best" as const,
      isDefault: false,
      description: "Aggressive growth with product-market fit acceleration",
    },
    {
      id: IDS.scenarioWorst,
      name: "Worst Case",
      type: "worst" as const,
      isDefault: false,
      description: "Conservative with extended sales cycles and higher churn",
    },
  ];

  for (const s of scenarioData) {
    await db
      .insert(schema.scenarios)
      .values({ ...s, companyId: IDS.company })
      .onConflictDoNothing();
  }

  // ── 7. Forecast Lines (all 5 methods in base scenario) ──────────────────

  console.log("  → Forecast lines (5 methods: fixed, growth_rate, per_unit, percentage_of, custom_formula)");
  const forecastStart = monthDate(2026, 1);
  const forecastEnd = monthDate(2026, 12);

  const forecastLineData = [
    // fixed — Office rent $4,500/mo
    {
      id: IDS.flOfficeRent,
      scenarioId: IDS.scenarioBase,
      accountId: IDS.acctOffice,
      method: "fixed" as const,
      parameters: { amount: 4500 },
      startDate: forecastStart,
      endDate: forecastEnd,
    },
    // growth_rate — Marketing spend starting $8,000/mo, +5% MoM
    {
      id: IDS.flMarketingGrowth,
      scenarioId: IDS.scenarioBase,
      accountId: IDS.acctMarketing,
      method: "growth_rate" as const,
      parameters: { baseAmount: 8000, monthlyGrowthRate: 0.05 },
      startDate: forecastStart,
      endDate: forecastEnd,
    },
    // per_unit — Cloud infra: 500 units @ $12/unit, 8% unit growth
    {
      id: IDS.flCloudPerUnit,
      scenarioId: IDS.scenarioBase,
      accountId: IDS.acctCloudInfra,
      method: "per_unit" as const,
      parameters: {
        units: 500,
        pricePerUnit: 12,
        unitGrowthRate: 0.08,
        priceGrowthRate: 0,
      },
      startDate: forecastStart,
      endDate: forecastEnd,
    },
    // percentage_of — Payment processing = 2.9% of SaaS Revenue forecast
    {
      id: IDS.flPaymentPctOf,
      scenarioId: IDS.scenarioBase,
      accountId: IDS.acctPaymentProcessing,
      method: "percentage_of" as const,
      parameters: {
        sourceLineId: IDS.flCloudPerUnit, // reference another line
        percentage: 0.029,
      },
      startDate: forecastStart,
      endDate: forecastEnd,
    },
    // fixed — Software tools $2,800/mo
    {
      id: IDS.flSoftwareFixed,
      scenarioId: IDS.scenarioBase,
      accountId: IDS.acctSoftwareTools,
      method: "fixed" as const,
      parameters: { amount: 2800 },
      startDate: forecastStart,
      endDate: forecastEnd,
    },
    // Best scenario: aggressive marketing growth +10% MoM
    {
      id: IDS.flBestRevGrowth,
      scenarioId: IDS.scenarioBest,
      accountId: IDS.acctMarketing,
      method: "growth_rate" as const,
      parameters: { baseAmount: 12000, monthlyGrowthRate: 0.1 },
      startDate: forecastStart,
      endDate: forecastEnd,
    },
    // Worst scenario: flat marketing
    {
      id: IDS.flWorstRevGrowth,
      scenarioId: IDS.scenarioWorst,
      accountId: IDS.acctMarketing,
      method: "fixed" as const,
      parameters: { amount: 5000 },
      startDate: forecastStart,
      endDate: forecastEnd,
    },
  ];

  for (const fl of forecastLineData) {
    await db.insert(schema.forecastLines).values(fl).onConflictDoNothing();
  }

  // ── 8. Revenue Streams (all 4 types in base scenario) ───────────────────

  console.log("  → 4 revenue streams (subscription, one_time, usage_based, services)");
  const revenueStreamData = [
    {
      id: IDS.rsSubscription,
      scenarioId: IDS.scenarioBase,
      name: "Core Platform",
      type: "subscription" as const,
      parameters: {
        startingCustomers: 45,
        monthlyPrice: 149,
        newCustomersPerMonth: 8,
        monthlyChurnRate: 0.03,
        expansionRate: 0.02,
        priceGrowthRate: 0,
      },
    },
    {
      id: IDS.rsOneTime,
      scenarioId: IDS.scenarioBase,
      name: "Setup & Onboarding Fees",
      type: "one_time" as const,
      parameters: {
        unitsPerMonth: 6,
        pricePerUnit: 500,
        unitGrowthRate: 0.05,
      },
    },
    {
      id: IDS.rsUsageBased,
      scenarioId: IDS.scenarioBase,
      name: "API Usage",
      type: "usage_based" as const,
      parameters: {
        activeUsers: 120,
        avgUsagePerUser: 2500,
        pricePerUnit: 0.002,
        userGrowthRate: 0.06,
        usageGrowthRate: 0.03,
      },
    },
    {
      id: IDS.rsServices,
      scenarioId: IDS.scenarioBase,
      name: "Consulting & Implementation",
      type: "services" as const,
      parameters: {
        hoursPerMonth: 40,
        hourlyRate: 200,
        hoursGrowthRate: 0.04,
        rateIncreaseRate: 0,
      },
    },
  ];

  for (const rs of revenueStreamData) {
    await db.insert(schema.revenueStreams).values(rs).onConflictDoNothing();
  }

  // ── 9. Headcount Plans ──────────────────────────────────────────────────

  console.log("  → 6 headcount plans");
  const headcountData = [
    {
      id: IDS.hcEngineers,
      scenarioId: IDS.scenarioBase,
      departmentId: IDS.deptEngineering,
      title: "Software Engineer",
      count: 4,
      salary: "130000.00",
      startDate: monthDate(2025, 10),
      benefitsRate: "0.2200",
    },
    {
      id: IDS.hcVpEng,
      scenarioId: IDS.scenarioBase,
      departmentId: IDS.deptEngineering,
      title: "VP of Engineering",
      count: 1,
      salary: "195000.00",
      startDate: monthDate(2025, 10),
      benefitsRate: "0.2200",
    },
    {
      id: IDS.hcSdrs,
      scenarioId: IDS.scenarioBase,
      departmentId: IDS.deptSales,
      title: "Sales Development Rep",
      count: 2,
      salary: "75000.00",
      startDate: monthDate(2026, 1),
      benefitsRate: "0.2000",
    },
    {
      id: IDS.hcAe,
      scenarioId: IDS.scenarioBase,
      departmentId: IDS.deptSales,
      title: "Account Executive",
      count: 1,
      salary: "110000.00",
      startDate: monthDate(2026, 3),
      benefitsRate: "0.2000",
    },
    {
      id: IDS.hcPm,
      scenarioId: IDS.scenarioBase,
      departmentId: IDS.deptProduct,
      title: "Product Manager",
      count: 1,
      salary: "145000.00",
      startDate: monthDate(2025, 10),
      benefitsRate: "0.2200",
    },
    {
      id: IDS.hcDesigner,
      scenarioId: IDS.scenarioBase,
      departmentId: IDS.deptProduct,
      title: "Product Designer",
      count: 1,
      salary: "125000.00",
      startDate: monthDate(2026, 4),
      benefitsRate: "0.2000",
    },
  ];

  for (const hc of headcountData) {
    await db.insert(schema.headcountPlans).values(hc).onConflictDoNothing();
  }

  // ── 10. Funding Rounds ──────────────────────────────────────────────────

  console.log("  → 3 funding rounds (pre-seed, seed, projected series A)");
  const fundingData = [
    {
      id: IDS.frPreSeed,
      companyId: IDS.company,
      name: "Pre-Seed Round",
      type: "pre_seed" as const,
      amount: "250000.00",
      date: monthDate(2024, 8),
      preMoneyValuation: "1000000.00",
      dilutionPercent: "0.2000",
      isProjected: false,
    },
    {
      id: IDS.frSeed,
      companyId: IDS.company,
      name: "Seed Round",
      type: "seed" as const,
      amount: "2000000.00",
      date: monthDate(2025, 4),
      preMoneyValuation: "8000000.00",
      dilutionPercent: "0.2000",
      isProjected: false,
    },
    {
      id: IDS.frSeriesA,
      companyId: IDS.company,
      name: "Series A (Projected)",
      type: "series_a" as const,
      amount: "10000000.00",
      date: monthDate(2026, 9),
      preMoneyValuation: "40000000.00",
      dilutionPercent: "0.2000",
      isProjected: true,
    },
  ];

  for (const fr of fundingData) {
    await db.insert(schema.fundingRounds).values(fr).onConflictDoNothing();
  }

  // ── 11. Historical Transactions (6 months: Oct 2025 – Mar 2026) ────────

  console.log("  → Historical transactions (Oct 2025 – Mar 2026)");

  type TxnTemplate = {
    accountId: string;
    accountKey: string;
    descriptions: string[];
    baseAmount: number;
    variance: number; // ± percentage
  };

  const txnTemplates: TxnTemplate[] = [
    // Revenue
    {
      accountId: IDS.acctSaasRevenue,
      accountKey: "saas",
      descriptions: ["Stripe payout - SaaS subscriptions", "Monthly SaaS revenue"],
      baseAmount: 5800,
      variance: 0.12,
    },
    {
      accountId: IDS.acctServicesRevenue,
      accountKey: "svc",
      descriptions: ["Consulting engagement - TechCorp", "Implementation services - DataCo"],
      baseAmount: 6000,
      variance: 0.3,
    },
    // COGS
    {
      accountId: IDS.acctCloudInfra,
      accountKey: "aws",
      descriptions: ["AWS monthly invoice", "Vercel Pro plan", "PlanetScale database"],
      baseAmount: 3200,
      variance: 0.1,
    },
    {
      accountId: IDS.acctPaymentProcessing,
      accountKey: "stripe",
      descriptions: ["Stripe processing fees"],
      baseAmount: 180,
      variance: 0.15,
    },
    // OpEx
    {
      accountId: IDS.acctSalaries,
      accountKey: "sal",
      descriptions: ["Gusto payroll"],
      baseAmount: 52000,
      variance: 0,
    },
    {
      accountId: IDS.acctMarketing,
      accountKey: "mktg",
      descriptions: [
        "Google Ads campaign",
        "LinkedIn Ads",
        "Sponsorship - DevConf 2025",
        "Content marketing - freelancer",
      ],
      baseAmount: 7500,
      variance: 0.25,
    },
    {
      accountId: IDS.acctOffice,
      accountKey: "office",
      descriptions: ["WeWork office rent"],
      baseAmount: 4200,
      variance: 0,
    },
    {
      accountId: IDS.acctSoftwareTools,
      accountKey: "tools",
      descriptions: [
        "GitHub Team subscription",
        "Slack Business+",
        "Linear Pro",
        "Figma Organization",
        "Datadog Pro",
      ],
      baseAmount: 2400,
      variance: 0.08,
    },
    {
      accountId: IDS.acctTravel,
      accountKey: "travel",
      descriptions: [
        "Flight SFO-NYC team meeting",
        "Hotel - customer onsite",
        "Team dinner - quarterly offsite",
      ],
      baseAmount: 1800,
      variance: 0.5,
    },
    {
      accountId: IDS.acctLegal,
      accountKey: "legal",
      descriptions: ["Cooley LLP - monthly retainer", "SOC 2 compliance audit"],
      baseAmount: 3500,
      variance: 0.2,
    },
    {
      accountId: IDS.acctInsurance,
      accountKey: "ins",
      descriptions: ["Embroker tech E&O policy"],
      baseAmount: 850,
      variance: 0,
    },
  ];

  // Seeded PRNG for deterministic amounts
  let prngState = 42;
  function seededRandom(): number {
    prngState = (prngState * 1103515245 + 12345) & 0x7fffffff;
    return prngState / 0x7fffffff;
  }

  const months = [
    { year: 2025, month: 10 },
    { year: 2025, month: 11 },
    { year: 2025, month: 12 },
    { year: 2026, month: 1 },
    { year: 2026, month: 2 },
    { year: 2026, month: 3 },
  ];

  const allTxns: Array<{
    id: string;
    companyId: string;
    accountId: string;
    date: Date;
    amount: string;
    description: string;
    source: "manual";
    externalId: string;
  }> = [];

  for (const { year, month } of months) {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    for (const tmpl of txnTemplates) {
      const r = seededRandom();
      const multiplier = 1 + (r * 2 - 1) * tmpl.variance;
      const amount = Math.round(tmpl.baseAmount * multiplier * 100) / 100;
      const desc = tmpl.descriptions[Math.floor(r * tmpl.descriptions.length)];
      const id = txnId(tmpl.accountKey, monthStr, 0);
      const extId = `seed-${tmpl.accountKey}-${monthStr}`;

      allTxns.push({
        id,
        companyId: IDS.company,
        accountId: tmpl.accountId,
        date: monthDate(year, month, 15),
        amount: amount.toFixed(2),
        description: desc,
        source: "manual",
        externalId: extId,
      });
    }
  }

  // Batch insert transactions
  for (const txn of allTxns) {
    await db.insert(schema.transactions).values(txn).onConflictDoNothing();
  }
  console.log(`    ${allTxns.length} transactions created`);

  // ── 12. System Metrics ──────────────────────────────────────────────────

  console.log("  → 6 system metrics");
  const metricData = [
    {
      id: IDS.metricMrr,
      name: "Monthly Recurring Revenue",
      slug: "mrr",
      category: "saas" as const,
      isSystem: true,
    },
    {
      id: IDS.metricArr,
      name: "Annual Recurring Revenue",
      slug: "arr",
      formula: "mrr * 12",
      category: "saas" as const,
      isSystem: true,
    },
    {
      id: IDS.metricBurnRate,
      name: "Net Burn Rate",
      slug: "burn-rate",
      category: "financial" as const,
      isSystem: true,
    },
    {
      id: IDS.metricRunway,
      name: "Runway (Months)",
      slug: "runway",
      formula: "cash / burn_rate",
      category: "financial" as const,
      isSystem: true,
    },
    {
      id: IDS.metricCac,
      name: "Customer Acquisition Cost",
      slug: "cac",
      category: "growth" as const,
      isSystem: true,
    },
    {
      id: IDS.metricLtv,
      name: "Lifetime Value",
      slug: "ltv",
      formula: "arpu / churn_rate",
      category: "growth" as const,
      isSystem: true,
    },
  ];

  for (const m of metricData) {
    await db
      .insert(schema.metrics)
      .values({ ...m, companyId: IDS.company })
      .onConflictDoNothing();
  }

  // ── 13. AI Feature Flags ────────────────────────────────────────────────

  console.log("  → AI feature flags (all enabled)");
  await db
    .insert(schema.aiFeatureFlags)
    .values({
      id: IDS.aiFeatureFlag,
      companyId: IDS.company,
      masterEnabled: true,
      dataMode: "full",
      features: {
        onboarding: true,
        chat: true,
        insights: true,
        uiPersonalization: true,
        autoCategorization: true,
        weeklyDigest: true,
      },
    })
    .onConflictDoNothing();

  // ── 14. Sample AI Conversation ──────────────────────────────────────────

  console.log("  → Sample AI conversation");
  await db
    .insert(schema.aiConversations)
    .values({
      id: IDS.aiConversation,
      companyId: IDS.company,
      userId: IDS.user,
      title: "Runway analysis",
    })
    .onConflictDoNothing();

  // ── 15. Privacy Consents ────────────────────────────────────────────────

  console.log("  → Privacy consents");
  await db
    .insert(schema.privacyConsents)
    .values([
      {
        id: IDS.consentProcessing,
        userId: IDS.user,
        purpose: "data_processing",
        granted: true,
      },
      {
        id: IDS.consentAi,
        userId: IDS.user,
        purpose: "ai_features",
        granted: true,
      },
    ])
    .onConflictDoNothing();

  // ── Done ────────────────────────────────────────────────────────────────

  console.log("\n✅ Seed complete! Demo company ready at demo@burnless.app\n");
  console.log("   Company:  Acme SaaS Inc. (seed-stage SaaS)");
  console.log("   Accounts: 15 (income, expense, COGS, asset, liability, equity)");
  console.log("   Scenarios: 3 (base, best, worst)");
  console.log("   Forecast methods: fixed, growth_rate, per_unit, percentage_of");
  console.log("   Revenue streams: subscription, one_time, usage_based, services");
  console.log("   Headcount: 10 positions across 3 departments");
  console.log(`   Transactions: ${allTxns.length} (6 months history)`);
  console.log("   Metrics: MRR, ARR, burn rate, runway, CAC, LTV");

  await client.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
