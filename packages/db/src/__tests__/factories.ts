/**
 * Test data factories for @burnless/db.
 *
 * Each factory inserts a real row into PGLite and returns it.
 * All IDs are deterministic UUIDs seeded from a counter so tests are reproducible.
 */
import { getTestDb } from "./setup";
import {
  users,
  companies,
  companyMembers,
  scenarios,
  financialAccounts,
  forecastLines,
  forecastValues,
  revenueStreams,
  headcountPlans,
  departments,
  fundingRounds,
  transactions,
} from "../schema";

let counter = 0;
function nextId(): string {
  counter++;
  const hex = counter.toString(16).padStart(12, "0");
  return `00000000-0000-4000-a000-${hex}`;
}

/** Reset the ID counter between test files if needed */
export function resetFactoryCounter() {
  counter = 0;
}

// ── Users ──────────────────────────────────────────────────────────────────────

export async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  const db = getTestDb();
  const id = overrides.id ?? nextId();
  const [row] = await db
    .insert(users)
    .values({
      id,
      email: `user-${id.slice(-6)}@test.burnless.app`,
      name: `Test User ${id.slice(-4)}`,
      ...overrides,
    })
    .returning();
  return row!;
}

// ── Companies ──────────────────────────────────────────────────────────────────

export async function createCompany(
  ownerId: string,
  overrides: Partial<typeof companies.$inferInsert> = {},
) {
  const db = getTestDb();
  const id = overrides.id ?? nextId();
  const [row] = await db
    .insert(companies)
    .values({
      id,
      name: `Test Company ${id.slice(-4)}`,
      ownerId,
      ...overrides,
    })
    .returning();
  return row!;
}

// ── Company Members ────────────────────────────────────────────────────────────

export async function createMember(
  companyId: string,
  userId: string,
  overrides: Partial<typeof companyMembers.$inferInsert> = {},
) {
  const db = getTestDb();
  const id = overrides.id ?? nextId();
  const [row] = await db
    .insert(companyMembers)
    .values({
      id,
      companyId,
      userId,
      role: "owner",
      ...overrides,
    })
    .returning();
  return row!;
}

// ── Departments ────────────────────────────────────────────────────────────────

export async function createDepartment(
  companyId: string,
  overrides: Partial<typeof departments.$inferInsert> = {},
) {
  const db = getTestDb();
  const id = overrides.id ?? nextId();
  const [row] = await db
    .insert(departments)
    .values({
      id,
      companyId,
      name: `Department ${id.slice(-4)}`,
      ...overrides,
    })
    .returning();
  return row!;
}

// ── Scenarios ──────────────────────────────────────────────────────────────────

export async function createScenario(
  companyId: string,
  overrides: Partial<typeof scenarios.$inferInsert> = {},
) {
  const db = getTestDb();
  const id = overrides.id ?? nextId();
  const [row] = await db
    .insert(scenarios)
    .values({
      id,
      companyId,
      name: `Scenario ${id.slice(-4)}`,
      ...overrides,
    })
    .returning();
  return row!;
}

// ── Financial Accounts ─────────────────────────────────────────────────────────

export async function createFinancialAccount(
  companyId: string,
  overrides: Partial<typeof financialAccounts.$inferInsert> = {},
) {
  const db = getTestDb();
  const id = overrides.id ?? nextId();
  const [row] = await db
    .insert(financialAccounts)
    .values({
      id,
      companyId,
      name: `Account ${id.slice(-4)}`,
      type: "expense",
      category: "operating_expense",
      ...overrides,
    })
    .returning();
  return row!;
}

// ── Forecast Lines ─────────────────────────────────────────────────────────────

export async function createForecastLine(
  scenarioId: string,
  accountId: string,
  overrides: Partial<typeof forecastLines.$inferInsert> = {},
) {
  const db = getTestDb();
  const id = overrides.id ?? nextId();
  const [row] = await db
    .insert(forecastLines)
    .values({
      id,
      scenarioId,
      accountId,
      startDate: new Date("2026-01-01"),
      ...overrides,
    })
    .returning();
  return row!;
}

// ── Forecast Values ────────────────────────────────────────────────────────────

export async function createForecastValue(
  forecastLineId: string,
  overrides: Partial<typeof forecastValues.$inferInsert> = {},
) {
  const db = getTestDb();
  const id = overrides.id ?? nextId();
  const [row] = await db
    .insert(forecastValues)
    .values({
      id,
      forecastLineId,
      month: new Date("2026-01-01"),
      amount: "1000.00",
      ...overrides,
    })
    .returning();
  return row!;
}

// ── Revenue Streams ────────────────────────────────────────────────────────────

export async function createRevenueStream(
  scenarioId: string,
  overrides: Partial<typeof revenueStreams.$inferInsert> = {},
) {
  const db = getTestDb();
  const id = overrides.id ?? nextId();
  const [row] = await db
    .insert(revenueStreams)
    .values({
      id,
      scenarioId,
      name: `Revenue Stream ${id.slice(-4)}`,
      ...overrides,
    })
    .returning();
  return row!;
}

// ── Headcount Plans ────────────────────────────────────────────────────────────

export async function createHeadcountPlan(
  scenarioId: string,
  departmentId: string,
  overrides: Partial<typeof headcountPlans.$inferInsert> = {},
) {
  const db = getTestDb();
  const id = overrides.id ?? nextId();
  const [row] = await db
    .insert(headcountPlans)
    .values({
      id,
      scenarioId,
      departmentId,
      title: `Role ${id.slice(-4)}`,
      salary: "80000.00",
      startDate: new Date("2026-01-01"),
      ...overrides,
    })
    .returning();
  return row!;
}

// ── Funding Rounds ─────────────────────────────────────────────────────────────

export async function createFundingRound(
  companyId: string,
  overrides: Partial<typeof fundingRounds.$inferInsert> = {},
) {
  const db = getTestDb();
  const id = overrides.id ?? nextId();
  const [row] = await db
    .insert(fundingRounds)
    .values({
      id,
      companyId,
      name: `Round ${id.slice(-4)}`,
      type: "seed",
      amount: "1000000.00",
      date: new Date("2026-01-15"),
      ...overrides,
    })
    .returning();
  return row!;
}

// ── Transactions ───────────────────────────────────────────────────────────────

export async function createTransaction(
  companyId: string,
  accountId: string,
  overrides: Partial<typeof transactions.$inferInsert> = {},
) {
  const db = getTestDb();
  const id = overrides.id ?? nextId();
  const [row] = await db
    .insert(transactions)
    .values({
      id,
      companyId,
      accountId,
      date: new Date("2026-01-15"),
      amount: "500.00",
      description: `Transaction ${id.slice(-4)}`,
      ...overrides,
    })
    .returning();
  return row!;
}

// ── Composite helpers ──────────────────────────────────────────────────────────

/**
 * Create a complete company context: user → company → membership → default scenario.
 * Returns all created entities for use in tests.
 */
export async function createCompanyContext(overrides?: {
  user?: Partial<typeof users.$inferInsert>;
  company?: Partial<typeof companies.$inferInsert>;
  scenario?: Partial<typeof scenarios.$inferInsert>;
}) {
  const user = await createUser(overrides?.user);
  const company = await createCompany(user.id, overrides?.company);
  const member = await createMember(company.id, user.id);
  const scenario = await createScenario(company.id, {
    isDefault: true,
    type: "base",
    ...overrides?.scenario,
  });
  return { user, company, member, scenario };
}
