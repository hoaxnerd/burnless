/**
 * ⚠️  DEV / TEST ONLY — DO NOT RUN IN PRODUCTION ⚠️
 *
 * Creates test user accounts for all 3 subscription plan tiers:
 *   - Free plan: fresh account (just completed onboarding)
 *   - Pro plan:  active account (with historical data, AI enabled)
 *   - Team plan: active account (with team members, at plan limits for edge-case testing)
 *
 * Each account has a known password ("TestPass1") for easy local testing.
 * Idempotent: uses fixed IDs + ON CONFLICT DO NOTHING — safe to run repeatedly.
 *
 * Usage: pnpm db:seed-test-accounts
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Guard: block execution in production environments
if (process.env.NODE_ENV === "production") {
  console.error("❌ seed-test-accounts.ts must not run in production. Aborting.");
  process.exit(1);
}

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/burnless";

// ── Password hashing (mirrors apps/web/src/lib/password.ts) ───────────────

const ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH * 8 },
    true,
    ["encrypt"]
  );
  const keyBytes = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  const saltHex = Buffer.from(salt).toString("hex");
  const hashHex = Buffer.from(keyBytes).toString("hex");
  return `pbkdf2:${ITERATIONS}:${saltHex}:${hashHex}`;
}

// ── Test password ─────────────────────────────────────────────────────────
// All test accounts use this password. Meets validation: 8+ chars, uppercase, lowercase, number.
const TEST_PASSWORD = "TestPass1";

// ── Stable IDs ────────────────────────────────────────────────────────────
// Prefix: 10000000 for free, 20000000 for pro, 30000000 for team

const FREE = {
  user: "10000000-0000-4000-a000-000000000001",
  company: "10000000-0000-4000-a000-000000000010",
  member: "10000000-0000-4000-a000-000000000011",
  scenario: "10000000-0000-4000-a000-000000000200",
  deptEngineering: "10000000-0000-4000-a000-000000000020",
  deptSales: "10000000-0000-4000-a000-000000000021",
  deptMarketing: "10000000-0000-4000-a000-000000000022",
  deptOperations: "10000000-0000-4000-a000-000000000023",
  deptGenAdmin: "10000000-0000-4000-a000-000000000024",
  acctRevenue: "10000000-0000-4000-a000-000000000100",
  acctCogs: "10000000-0000-4000-a000-000000000101",
  acctSalaries: "10000000-0000-4000-a000-000000000102",
  acctCloud: "10000000-0000-4000-a000-000000000103",
  acctMarketing: "10000000-0000-4000-a000-000000000104",
  acctOffice: "10000000-0000-4000-a000-000000000105",
  acctSoftware: "10000000-0000-4000-a000-000000000106",
  acctCash: "10000000-0000-4000-a000-000000000107",
  acctEquity: "10000000-0000-4000-a000-000000000108",
  aiFlags: "10000000-0000-4000-a000-000000000800",
} as const;

const PRO = {
  user: "20000000-0000-4000-a000-000000000001",
  company: "20000000-0000-4000-a000-000000000010",
  member: "20000000-0000-4000-a000-000000000011",
  scenarioBase: "20000000-0000-4000-a000-000000000200",
  scenarioBest: "20000000-0000-4000-a000-000000000201",
  scenarioWorst: "20000000-0000-4000-a000-000000000202",
  deptEngineering: "20000000-0000-4000-a000-000000000020",
  deptSales: "20000000-0000-4000-a000-000000000021",
  deptMarketing: "20000000-0000-4000-a000-000000000022",
  deptOperations: "20000000-0000-4000-a000-000000000023",
  deptGenAdmin: "20000000-0000-4000-a000-000000000024",
  acctRevenue: "20000000-0000-4000-a000-000000000100",
  acctCogs: "20000000-0000-4000-a000-000000000101",
  acctSalaries: "20000000-0000-4000-a000-000000000102",
  acctCloud: "20000000-0000-4000-a000-000000000103",
  acctMarketing: "20000000-0000-4000-a000-000000000104",
  acctOffice: "20000000-0000-4000-a000-000000000105",
  acctSoftware: "20000000-0000-4000-a000-000000000106",
  acctCash: "20000000-0000-4000-a000-000000000107",
  acctEquity: "20000000-0000-4000-a000-000000000108",
  rsSubscription: "20000000-0000-4000-a000-000000000400",
  flMarketing: "20000000-0000-4000-a000-000000000300",
  flCloud: "20000000-0000-4000-a000-000000000301",
  frSeed: "20000000-0000-4000-a000-000000000600",
  hcEngineers: "20000000-0000-4000-a000-000000000500",
  metricMrr: "20000000-0000-4000-a000-000000000700",
  metricBurnRate: "20000000-0000-4000-a000-000000000701",
  metricRunway: "20000000-0000-4000-a000-000000000702",
  aiFlags: "20000000-0000-4000-a000-000000000800",
  aiConversation: "20000000-0000-4000-a000-000000000810",
  consentProcessing: "20000000-0000-4000-a000-000000000900",
  consentAi: "20000000-0000-4000-a000-000000000901",
} as const;

const TEAM = {
  user: "30000000-0000-4000-a000-000000000001",
  userMember2: "30000000-0000-4000-a000-000000000002",
  userMember3: "30000000-0000-4000-a000-000000000003",
  company: "30000000-0000-4000-a000-000000000010",
  memberOwner: "30000000-0000-4000-a000-000000000011",
  memberAdmin: "30000000-0000-4000-a000-000000000012",
  memberViewer: "30000000-0000-4000-a000-000000000013",
  scenarioBase: "30000000-0000-4000-a000-000000000200",
  scenarioBest: "30000000-0000-4000-a000-000000000201",
  scenarioWorst: "30000000-0000-4000-a000-000000000202",
  scenarioCustom: "30000000-0000-4000-a000-000000000203",
  deptEngineering: "30000000-0000-4000-a000-000000000020",
  deptSales: "30000000-0000-4000-a000-000000000021",
  deptMarketing: "30000000-0000-4000-a000-000000000022",
  deptOperations: "30000000-0000-4000-a000-000000000023",
  deptGenAdmin: "30000000-0000-4000-a000-000000000024",
  acctRevenue: "30000000-0000-4000-a000-000000000100",
  acctCogs: "30000000-0000-4000-a000-000000000101",
  acctSalaries: "30000000-0000-4000-a000-000000000102",
  acctCloud: "30000000-0000-4000-a000-000000000103",
  acctMarketing: "30000000-0000-4000-a000-000000000104",
  acctOffice: "30000000-0000-4000-a000-000000000105",
  acctSoftware: "30000000-0000-4000-a000-000000000106",
  acctCash: "30000000-0000-4000-a000-000000000107",
  acctEquity: "30000000-0000-4000-a000-000000000108",
  rsSubscription: "30000000-0000-4000-a000-000000000400",
  rsServices: "30000000-0000-4000-a000-000000000401",
  flSalaries: "30000000-0000-4000-a000-000000000300",
  flCloud: "30000000-0000-4000-a000-000000000301",
  frSeed: "30000000-0000-4000-a000-000000000600",
  frSeriesA: "30000000-0000-4000-a000-000000000601",
  hcEngineers: "30000000-0000-4000-a000-000000000500",
  hcSales: "30000000-0000-4000-a000-000000000501",
  metricMrr: "30000000-0000-4000-a000-000000000700",
  metricArr: "30000000-0000-4000-a000-000000000701",
  metricBurnRate: "30000000-0000-4000-a000-000000000702",
  metricRunway: "30000000-0000-4000-a000-000000000703",
  aiFlags: "30000000-0000-4000-a000-000000000800",
  aiConversation: "30000000-0000-4000-a000-000000000810",
  consentProcessing: "30000000-0000-4000-a000-000000000900",
  consentAi: "30000000-0000-4000-a000-000000000901",
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────

function monthDate(year: number, month: number, day = 1): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function txnId(prefix: string, accountKey: string, monthStr: string, idx: number): string {
  const hash = Array.from(`${prefix}-${accountKey}-${monthStr}-${idx}`).reduce(
    (h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0,
    0
  );
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return `${prefix}-0000-4000-b000-${hex.padStart(12, "0")}`;
}

// Default accounts created by onboarding (mirrors POST /api/onboarding)
function defaultAccounts(ids: typeof FREE | typeof PRO | typeof TEAM, companyId: string) {
  return [
    { id: ids.acctRevenue, companyId, name: "Revenue", type: "income" as const, category: "revenue" as const, isSystem: true, sortOrder: 1 },
    { id: ids.acctCogs, companyId, name: "Cost of Goods Sold", type: "expense" as const, category: "cogs" as const, isSystem: true, sortOrder: 10 },
    { id: ids.acctSalaries, companyId, name: "Salaries & Wages", type: "expense" as const, category: "operating_expense" as const, isSystem: true, sortOrder: 20 },
    { id: ids.acctCloud, companyId, name: "Cloud & Infrastructure", type: "expense" as const, category: "operating_expense" as const, isSystem: false, sortOrder: 21 },
    { id: ids.acctMarketing, companyId, name: "Marketing & Advertising", type: "expense" as const, category: "operating_expense" as const, isSystem: false, sortOrder: 22 },
    { id: ids.acctOffice, companyId, name: "Office & Facilities", type: "expense" as const, category: "operating_expense" as const, isSystem: false, sortOrder: 23 },
    { id: ids.acctSoftware, companyId, name: "Software & Tools", type: "expense" as const, category: "operating_expense" as const, isSystem: false, sortOrder: 24 },
    { id: ids.acctCash, companyId, name: "Cash & Equivalents", type: "asset" as const, category: "asset" as const, isSystem: true, sortOrder: 30 },
    { id: ids.acctEquity, companyId, name: "Retained Earnings", type: "equity" as const, category: "equity" as const, isSystem: false, sortOrder: 50 },
  ];
}

// Default departments created by onboarding
function defaultDepartments(ids: typeof FREE | typeof PRO | typeof TEAM, companyId: string) {
  return [
    { id: ids.deptEngineering, companyId, name: "Engineering" },
    { id: ids.deptSales, companyId, name: "Sales" },
    { id: ids.deptMarketing, companyId, name: "Marketing" },
    { id: ids.deptOperations, companyId, name: "Operations" },
    { id: ids.deptGenAdmin, companyId, name: "General & Admin" },
  ];
}

// ── Main seed function ────────────────────────────────────────────────────

async function seedTestAccounts() {
  const client = postgres(connectionString);
  const db = drizzle(client, { schema });
  const passwordHash = await hashPassword(TEST_PASSWORD);

  console.log("🧪 Seeding test accounts...\n");

  // ═══════════════════════════════════════════════════════════════════════
  // 1. FREE PLAN — Fresh account (just completed onboarding)
  // ═══════════════════════════════════════════════════════════════════════

  console.log("  ── Free Plan: test-free@burnless.app ──");

  console.log("    → User");
  await db.insert(schema.users).values({
    id: FREE.user,
    name: "Jordan Free",
    email: "test-free@burnless.app",
    emailVerified: new Date(),
    passwordHash,
  }).onConflictDoNothing();

  console.log("    → Company: FreshStart Analytics");
  await db.insert(schema.companies).values({
    id: FREE.company,
    name: "FreshStart Analytics",
    stage: "pre_seed",
    businessModel: "saas",
    industry: "Analytics",
    currency: "USD",
    locale: "en-US",
    timezone: "America/Los_Angeles",
    ownerId: FREE.user,
    stripePlan: "free",
  }).onConflictDoNothing();

  await db.insert(schema.companyMembers).values({
    id: FREE.member,
    companyId: FREE.company,
    userId: FREE.user,
    role: "owner",
  }).onConflictDoNothing();

  console.log("    → Departments + Accounts + Scenario");
  for (const dept of defaultDepartments(FREE, FREE.company)) {
    await db.insert(schema.departments).values(dept).onConflictDoNothing();
  }
  for (const acct of defaultAccounts(FREE, FREE.company)) {
    await db.insert(schema.financialAccounts).values(acct).onConflictDoNothing();
  }
  await db.insert(schema.scenarios).values({
    id: FREE.scenario,
    companyId: FREE.company,
    name: "Base Plan",
    source: "blank",
    description: "Default scenario from onboarding",
  }).onConflictDoNothing();

  // AI disabled by default (new accounts)
  await db.insert(schema.aiFeatureFlags).values({
    id: FREE.aiFlags,
    companyId: FREE.company,
    masterEnabled: false,
    dataMode: "full",
    features: {
      onboarding: false,
      chat: false,
      insights: false,
      uiPersonalization: false,
      autoCategorization: false,
      weeklyDigest: false,
    },
  }).onConflictDoNothing();

  console.log("    ✓ Free plan account ready (fresh, no historical data)\n");

  // ═══════════════════════════════════════════════════════════════════════
  // 2. PRO PLAN — Active account with historical data
  // ═══════════════════════════════════════════════════════════════════════

  console.log("  ── Pro Plan: test-pro@burnless.app ──");

  console.log("    → User");
  await db.insert(schema.users).values({
    id: PRO.user,
    name: "Morgan Pro",
    email: "test-pro@burnless.app",
    emailVerified: new Date(),
    passwordHash,
  }).onConflictDoNothing();

  console.log("    → Company: ProScale Labs");
  await db.insert(schema.companies).values({
    id: PRO.company,
    name: "ProScale Labs",
    stage: "seed",
    businessModel: "saas",
    industry: "DevTools",
    foundedDate: monthDate(2025, 1),
    fiscalYearEnd: 12,
    currency: "USD",
    locale: "en-US",
    timezone: "America/New_York",
    ownerId: PRO.user,
    stripePlan: "pro",
  }).onConflictDoNothing();

  await db.insert(schema.companyMembers).values({
    id: PRO.member,
    companyId: PRO.company,
    userId: PRO.user,
    role: "owner",
  }).onConflictDoNothing();

  console.log("    → Departments + Accounts");
  for (const dept of defaultDepartments(PRO, PRO.company)) {
    await db.insert(schema.departments).values(dept).onConflictDoNothing();
  }
  for (const acct of defaultAccounts(PRO, PRO.company)) {
    await db.insert(schema.financialAccounts).values(acct).onConflictDoNothing();
  }

  console.log("    → 3 scenarios (base/best/worst)");
  for (const s of [
    { id: PRO.scenarioBase, name: "Base Case", source: "blank" as const, description: "Realistic growth trajectory" },
    { id: PRO.scenarioBest, name: "Best Case", source: "clone" as const, description: "Accelerated growth scenario" },
    { id: PRO.scenarioWorst, name: "Worst Case", source: "clone" as const, description: "Conservative downside scenario" },
  ]) {
    await db.insert(schema.scenarios).values({ ...s, companyId: PRO.company }).onConflictDoNothing();
  }

  console.log("    → Revenue stream + forecast lines");
  await db.insert(schema.revenueStreams).values({
    id: PRO.rsSubscription,
    companyId: PRO.company,
    name: "Platform Subscriptions",
    type: "subscription",
    parameters: {
      startingCustomers: 30,
      monthlyPrice: 99,
      newCustomersPerMonth: 5,
      monthlyChurnRate: 0.04,
      expansionRate: 0.01,
      priceGrowthRate: 0,
    },
  }).onConflictDoNothing();

  const forecastStart = monthDate(2026, 1);
  const forecastEnd = monthDate(2026, 12);
  for (const fl of [
    { id: PRO.flMarketing, companyId: PRO.company, accountId: PRO.acctMarketing, method: "growth_rate" as const, parameters: { baseAmount: 5000, monthlyGrowthRate: 0.04 }, startDate: forecastStart, endDate: forecastEnd },
    { id: PRO.flCloud, companyId: PRO.company, accountId: PRO.acctCloud, method: "fixed" as const, parameters: { amount: 2200 }, startDate: forecastStart, endDate: forecastEnd },
  ]) {
    await db.insert(schema.forecastLines).values(fl).onConflictDoNothing();
  }

  console.log("    → Seed funding round");
  await db.insert(schema.fundingRounds).values({
    id: PRO.frSeed,
    companyId: PRO.company,
    name: "Seed Round",
    type: "seed",
    amount: "1500000.00",
    date: monthDate(2025, 6),
    preMoneyValuation: "6000000.00",
    dilutionPercent: "0.2000",
    isProjected: false,
  }).onConflictDoNothing();

  console.log("    → Headcount plan");
  await db.insert(schema.headcountPlans).values({
    id: PRO.hcEngineers,
    companyId: PRO.company,
    departmentId: PRO.deptEngineering,
    title: "Software Engineer",
    count: 3,
    salary: "120000.00",
    startDate: monthDate(2025, 6),
    benefitsRate: "0.2000",
  }).onConflictDoNothing();

  console.log("    → 3 metrics");
  for (const m of [
    { id: PRO.metricMrr, name: "Monthly Recurring Revenue", slug: "mrr", category: "saas" as const, isSystem: true },
    { id: PRO.metricBurnRate, name: "Net Burn Rate", slug: "burn-rate", category: "financial" as const, isSystem: true },
    { id: PRO.metricRunway, name: "Runway (Months)", slug: "runway", formula: "cash / burn_rate", category: "financial" as const, isSystem: true },
  ]) {
    await db.insert(schema.metrics).values({ ...m, companyId: PRO.company }).onConflictDoNothing();
  }

  console.log("    → Historical transactions (Nov 2025 – Mar 2026)");
  const proMonths = [
    { year: 2025, month: 11 },
    { year: 2025, month: 12 },
    { year: 2026, month: 1 },
    { year: 2026, month: 2 },
    { year: 2026, month: 3 },
  ];
  const proTxnTemplates = [
    { accountId: PRO.acctRevenue, key: "rev", desc: "Stripe payout - subscriptions", base: 2970 },
    { accountId: PRO.acctCogs, key: "cogs", desc: "Third-party API costs", base: 400 },
    { accountId: PRO.acctSalaries, key: "sal", desc: "Gusto payroll", base: 36000 },
    { accountId: PRO.acctCloud, key: "cloud", desc: "AWS invoice", base: 2200 },
    { accountId: PRO.acctMarketing, key: "mktg", desc: "Google Ads + content", base: 5000 },
    { accountId: PRO.acctOffice, key: "office", desc: "Coworking space", base: 1800 },
    { accountId: PRO.acctSoftware, key: "tools", desc: "GitHub + Slack + Linear", base: 900 },
  ];

  let proPrng = 99;
  function proRandom(): number {
    proPrng = (proPrng * 1103515245 + 12345) & 0x7fffffff;
    return proPrng / 0x7fffffff;
  }

  const proTxns: Array<{
    id: string; companyId: string; accountId: string; date: Date;
    amount: string; description: string; source: "manual"; externalId: string;
  }> = [];

  for (const { year, month } of proMonths) {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    for (const tmpl of proTxnTemplates) {
      const variance = tmpl.key === "sal" ? 0 : 0.1;
      const r = proRandom();
      const amount = Math.round(tmpl.base * (1 + (r * 2 - 1) * variance) * 100) / 100;
      proTxns.push({
        id: txnId("20000000", tmpl.key, monthStr, 0),
        companyId: PRO.company,
        accountId: tmpl.accountId,
        date: monthDate(year, month, 15),
        amount: amount.toFixed(2),
        description: tmpl.desc,
        source: "manual",
        externalId: `seed-pro-${tmpl.key}-${monthStr}`,
      });
    }
  }
  for (const txn of proTxns) {
    await db.insert(schema.transactions).values(txn).onConflictDoNothing();
  }
  console.log(`    → ${proTxns.length} transactions created`);

  // AI enabled for Pro
  await db.insert(schema.aiFeatureFlags).values({
    id: PRO.aiFlags,
    companyId: PRO.company,
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
  }).onConflictDoNothing();

  await db.insert(schema.aiConversations).values({
    id: PRO.aiConversation,
    companyId: PRO.company,
    userId: PRO.user,
    title: "How can I reduce burn rate?",
  }).onConflictDoNothing();

  await db.insert(schema.privacyConsents).values([
    { id: PRO.consentProcessing, userId: PRO.user, purpose: "data_processing", granted: true },
    { id: PRO.consentAi, userId: PRO.user, purpose: "ai_features", granted: true },
  ]).onConflictDoNothing();

  console.log("    ✓ Pro plan account ready (active, with data)\n");

  // ═══════════════════════════════════════════════════════════════════════
  // 3. TEAM PLAN — Active account with team members + edge cases
  // ═══════════════════════════════════════════════════════════════════════

  console.log("  ── Team Plan: test-team@burnless.app ──");

  console.log("    → 3 users (owner, admin, viewer)");
  await db.insert(schema.users).values({
    id: TEAM.user,
    name: "Sam Team-Owner",
    email: "test-team@burnless.app",
    emailVerified: new Date(),
    passwordHash,
  }).onConflictDoNothing();

  await db.insert(schema.users).values({
    id: TEAM.userMember2,
    name: "Riley Team-Admin",
    email: "test-team-admin@burnless.app",
    emailVerified: new Date(),
    passwordHash,
  }).onConflictDoNothing();

  await db.insert(schema.users).values({
    id: TEAM.userMember3,
    name: "Casey Team-Viewer",
    email: "test-team-viewer@burnless.app",
    emailVerified: new Date(),
    passwordHash,
  }).onConflictDoNothing();

  console.log("    → Company: TeamScale Inc.");
  await db.insert(schema.companies).values({
    id: TEAM.company,
    name: "TeamScale Inc.",
    stage: "series_a",
    businessModel: "saas",
    industry: "FinTech",
    foundedDate: monthDate(2023, 3),
    fiscalYearEnd: 12,
    currency: "USD",
    locale: "en-US",
    timezone: "America/Chicago",
    ownerId: TEAM.user,
    stripePlan: "team",
  }).onConflictDoNothing();

  console.log("    → 3 memberships (owner, admin, viewer)");
  for (const mem of [
    { id: TEAM.memberOwner, userId: TEAM.user, role: "owner" as const },
    { id: TEAM.memberAdmin, userId: TEAM.userMember2, role: "admin" as const },
    { id: TEAM.memberViewer, userId: TEAM.userMember3, role: "viewer" as const },
  ]) {
    await db.insert(schema.companyMembers).values({ ...mem, companyId: TEAM.company }).onConflictDoNothing();
  }

  console.log("    → Departments + Accounts");
  for (const dept of defaultDepartments(TEAM, TEAM.company)) {
    await db.insert(schema.departments).values(dept).onConflictDoNothing();
  }
  for (const acct of defaultAccounts(TEAM, TEAM.company)) {
    await db.insert(schema.financialAccounts).values(acct).onConflictDoNothing();
  }

  console.log("    → 4 scenarios (base/best/worst/custom)");
  for (const s of [
    { id: TEAM.scenarioBase, name: "Base Case", source: "blank" as const, description: "Conservative growth with Series A runway" },
    { id: TEAM.scenarioBest, name: "Best Case", source: "clone" as const, description: "Product-market fit acceleration" },
    { id: TEAM.scenarioWorst, name: "Worst Case", source: "clone" as const, description: "Extended sales cycles, higher churn" },
    { id: TEAM.scenarioCustom, name: "Board Presentation", source: "ai" as const, description: "Tailored for Q2 board meeting" },
  ]) {
    await db.insert(schema.scenarios).values({ ...s, companyId: TEAM.company }).onConflictDoNothing();
  }

  console.log("    → Revenue streams");
  await db.insert(schema.revenueStreams).values({
    id: TEAM.rsSubscription,
    companyId: TEAM.company,
    name: "Enterprise SaaS",
    type: "subscription",
    parameters: {
      startingCustomers: 85,
      monthlyPrice: 299,
      newCustomersPerMonth: 12,
      monthlyChurnRate: 0.025,
      expansionRate: 0.03,
      priceGrowthRate: 0,
    },
  }).onConflictDoNothing();

  await db.insert(schema.revenueStreams).values({
    id: TEAM.rsServices,
    companyId: TEAM.company,
    name: "Implementation Services",
    type: "services",
    parameters: {
      hoursPerMonth: 60,
      hourlyRate: 250,
      hoursGrowthRate: 0.03,
      rateIncreaseRate: 0,
    },
  }).onConflictDoNothing();

  console.log("    → Forecast lines");
  const teamForecastStart = monthDate(2026, 1);
  const teamForecastEnd = monthDate(2026, 12);
  for (const fl of [
    { id: TEAM.flSalaries, companyId: TEAM.company, accountId: TEAM.acctSalaries, method: "growth_rate" as const, parameters: { baseAmount: 95000, monthlyGrowthRate: 0.02 }, startDate: teamForecastStart, endDate: teamForecastEnd },
    { id: TEAM.flCloud, companyId: TEAM.company, accountId: TEAM.acctCloud, method: "per_unit" as const, parameters: { units: 200, pricePerUnit: 25, unitGrowthRate: 0.06, priceGrowthRate: 0 }, startDate: teamForecastStart, endDate: teamForecastEnd },
  ]) {
    await db.insert(schema.forecastLines).values(fl).onConflictDoNothing();
  }

  console.log("    → 2 funding rounds");
  for (const fr of [
    { id: TEAM.frSeed, companyId: TEAM.company, name: "Seed Round", type: "seed" as const, amount: "3000000.00", date: monthDate(2024, 1), preMoneyValuation: "10000000.00", dilutionPercent: "0.2300", isProjected: false },
    { id: TEAM.frSeriesA, companyId: TEAM.company, name: "Series A", type: "series_a" as const, amount: "12000000.00", date: monthDate(2025, 8), preMoneyValuation: "48000000.00", dilutionPercent: "0.2000", isProjected: false },
  ]) {
    await db.insert(schema.fundingRounds).values(fr).onConflictDoNothing();
  }

  console.log("    → Headcount plans");
  for (const hc of [
    { id: TEAM.hcEngineers, companyId: TEAM.company, departmentId: TEAM.deptEngineering, title: "Software Engineer", count: 8, salary: "140000.00", startDate: monthDate(2025, 1), benefitsRate: "0.2200" },
    { id: TEAM.hcSales, companyId: TEAM.company, departmentId: TEAM.deptSales, title: "Account Executive", count: 3, salary: "100000.00", startDate: monthDate(2025, 6), benefitsRate: "0.2000" },
  ]) {
    await db.insert(schema.headcountPlans).values(hc).onConflictDoNothing();
  }

  console.log("    → 4 metrics");
  for (const m of [
    { id: TEAM.metricMrr, name: "Monthly Recurring Revenue", slug: "mrr", category: "saas" as const, isSystem: true },
    { id: TEAM.metricArr, name: "Annual Recurring Revenue", slug: "arr", formula: "mrr * 12", category: "saas" as const, isSystem: true },
    { id: TEAM.metricBurnRate, name: "Net Burn Rate", slug: "burn-rate", category: "financial" as const, isSystem: true },
    { id: TEAM.metricRunway, name: "Runway (Months)", slug: "runway", formula: "cash / burn_rate", category: "financial" as const, isSystem: true },
  ]) {
    await db.insert(schema.metrics).values({ ...m, companyId: TEAM.company }).onConflictDoNothing();
  }

  console.log("    → Historical transactions (Sep 2025 – Mar 2026)");
  const teamMonths = [
    { year: 2025, month: 9 },
    { year: 2025, month: 10 },
    { year: 2025, month: 11 },
    { year: 2025, month: 12 },
    { year: 2026, month: 1 },
    { year: 2026, month: 2 },
    { year: 2026, month: 3 },
  ];
  const teamTxnTemplates = [
    { accountId: TEAM.acctRevenue, key: "rev", desc: "Stripe payout - enterprise subscriptions", base: 25415 },
    { accountId: TEAM.acctCogs, key: "cogs", desc: "Third-party APIs + data costs", base: 3200 },
    { accountId: TEAM.acctSalaries, key: "sal", desc: "Gusto payroll - full team", base: 95000 },
    { accountId: TEAM.acctCloud, key: "cloud", desc: "AWS + Vercel + PlanetScale", base: 5000 },
    { accountId: TEAM.acctMarketing, key: "mktg", desc: "Growth campaigns + events", base: 12000 },
    { accountId: TEAM.acctOffice, key: "office", desc: "Office lease", base: 6500 },
    { accountId: TEAM.acctSoftware, key: "tools", desc: "Engineering + Sales tools", base: 3800 },
  ];

  let teamPrng = 77;
  function teamRandom(): number {
    teamPrng = (teamPrng * 1103515245 + 12345) & 0x7fffffff;
    return teamPrng / 0x7fffffff;
  }

  const teamTxns: Array<{
    id: string; companyId: string; accountId: string; date: Date;
    amount: string; description: string; source: "manual"; externalId: string;
  }> = [];

  for (const { year, month } of teamMonths) {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    for (const tmpl of teamTxnTemplates) {
      const variance = tmpl.key === "sal" || tmpl.key === "office" ? 0 : 0.12;
      const r = teamRandom();
      const amount = Math.round(tmpl.base * (1 + (r * 2 - 1) * variance) * 100) / 100;
      teamTxns.push({
        id: txnId("30000000", tmpl.key, monthStr, 0),
        companyId: TEAM.company,
        accountId: tmpl.accountId,
        date: monthDate(year, month, 15),
        amount: amount.toFixed(2),
        description: tmpl.desc,
        source: "manual",
        externalId: `seed-team-${tmpl.key}-${monthStr}`,
      });
    }
  }
  for (const txn of teamTxns) {
    await db.insert(schema.transactions).values(txn).onConflictDoNothing();
  }
  console.log(`    → ${teamTxns.length} transactions created`);

  // AI enabled for Team
  await db.insert(schema.aiFeatureFlags).values({
    id: TEAM.aiFlags,
    companyId: TEAM.company,
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
  }).onConflictDoNothing();

  await db.insert(schema.aiConversations).values({
    id: TEAM.aiConversation,
    companyId: TEAM.company,
    userId: TEAM.user,
    title: "Series A metrics overview",
  }).onConflictDoNothing();

  await db.insert(schema.privacyConsents).values([
    { id: TEAM.consentProcessing, userId: TEAM.user, purpose: "data_processing", granted: true },
    { id: TEAM.consentAi, userId: TEAM.user, purpose: "ai_features", granted: true },
  ]).onConflictDoNothing();

  console.log("    ✓ Team plan account ready (active, with team members)\n");

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                   Test Accounts Created                     ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  All accounts use password: TestPass1                       ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  FREE  │ test-free@burnless.app      │ FreshStart Analytics ║");
  console.log("║  PRO   │ test-pro@burnless.app       │ ProScale Labs        ║");
  console.log("║  TEAM  │ test-team@burnless.app      │ TeamScale Inc.       ║");
  console.log("║  TEAM  │ test-team-admin@burnless.app│ (admin member)       ║");
  console.log("║  TEAM  │ test-team-viewer@burnless.app│(viewer member)      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  await client.end();
  process.exit(0);
}

seedTestAccounts().catch((err) => {
  console.error("❌ Seed test accounts failed:", err);
  process.exit(1);
});
