/**
 * Tests for the `update_expense` and `create_expense` AI tool handlers.
 *
 * Phase 1 §1.5 — covers the new top-level fields (vendor, notes, frequency,
 * departmentId, isOneTime, isRecurring) and Zod validation behavior.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockScenarioInsert, mockScenarioUpdate, mockDbSelect } = vi.hoisted(
  () => ({
    mockScenarioInsert: vi.fn(),
    mockScenarioUpdate: vi.fn(),
    mockDbSelect: vi.fn(),
  })
);

vi.mock("@burnless/db", () => ({
  db: {
    select: mockDbSelect,
  },
  forecastLines: {
    id: "id",
    accountId: "accountId",
    companyId: "companyId",
  },
  scenarioInsert: mockScenarioInsert,
  scenarioUpdate: mockScenarioUpdate,
  scenarioDelete: vi.fn(),
}));

vi.mock("../../compute-dashboard", () => ({
  computeDashboardData: vi.fn(),
}));

vi.mock("../../data", () => ({
  getDefaultScenario: vi.fn(),
}));

vi.mock("@burnless/engine", () => ({
  seriesToArray: vi.fn(),
}));

import { forecastingHandlers } from "../forecasting";

const ctx = {
  companyId: "co-1",
  scenarioId: "sc-1",
  userId: "u-1",
} as const;

function mockOwnedRow(row: { id: string; accountId: string; companyId: string } | null) {
  // db.select(...).from(...).where(...) → array
  mockDbSelect.mockReturnValue({
    from: () => ({
      where: () => Promise.resolve(row ? [row] : []),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("update_expense handler", () => {
  it("persists vendor, frequency=annual, and notes through scenarioUpdate", async () => {
    mockOwnedRow({ id: "fl-1", accountId: "acc-1", companyId: "co-1" });
    mockScenarioUpdate.mockResolvedValue({ id: "fl-1" });

    const result = await forecastingHandlers.update_expense!(
      {
        id: "fl-1",
        vendor: "Slack",
        frequency: "annual",
        notes: "Renews in March",
      },
      ctx
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(mockScenarioUpdate).toHaveBeenCalledTimes(1);
    const [, , entityId, updates, scenarioId] =
      mockScenarioUpdate.mock.calls[0]!;
    expect(entityId).toBe("fl-1");
    expect(scenarioId).toBe("sc-1");
    expect(updates).toMatchObject({
      vendor: "Slack",
      frequency: "annual",
      notes: "Renews in March",
    });
  });

  it("writes null when isRecurring is explicitly cleared", async () => {
    mockOwnedRow({ id: "fl-1", accountId: "acc-1", companyId: "co-1" });
    mockScenarioUpdate.mockResolvedValue({ id: "fl-1" });

    const result = await forecastingHandlers.update_expense!(
      { id: "fl-1", isRecurring: null },
      ctx
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    const [, , , updates] = mockScenarioUpdate.mock.calls[0]!;
    expect(updates).toHaveProperty("isRecurring");
    expect(updates.isRecurring).toBeNull();
  });

  it("rejects an invalid frequency value with a Zod error", async () => {
    mockOwnedRow({ id: "fl-1", accountId: "acc-1", companyId: "co-1" });

    const result = await forecastingHandlers.update_expense!(
      { id: "fl-1", frequency: "weekly" },
      ctx
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/Invalid input/i);
    expect(mockScenarioUpdate).not.toHaveBeenCalled();
  });

  it("rejects when the required `id` is missing", async () => {
    const result = await forecastingHandlers.update_expense!(
      { frequency: "monthly" },
      ctx
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/Invalid input/i);
    expect(mockScenarioUpdate).not.toHaveBeenCalled();
  });
});

describe("create_expense handler", () => {
  it("threads Phase-1 fields into the insert payload", async () => {
    mockScenarioInsert.mockResolvedValue({ id: "fl-new" });

    const result = await forecastingHandlers.create_expense!(
      {
        accountId: "acc-1",
        method: "fixed",
        parameters: { amount: 100 },
        startDate: "2026-01-01",
        vendor: "AWS",
        frequency: "annual",
        isOneTime: false,
        departmentId: "dep-1",
        notes: "Annual prepay",
      },
      ctx
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(mockScenarioInsert).toHaveBeenCalledTimes(1);
    const [, , values, scenarioId] = mockScenarioInsert.mock.calls[0]!;
    expect(scenarioId).toBe("sc-1");
    expect(values).toMatchObject({
      accountId: "acc-1",
      method: "fixed",
      vendor: "AWS",
      frequency: "annual",
      isOneTime: false,
      departmentId: "dep-1",
      notes: "Annual prepay",
    });
    expect(values.startDate).toBeInstanceOf(Date);
  });

  it("defaults frequency=monthly and isOneTime=false when omitted", async () => {
    mockScenarioInsert.mockResolvedValue({ id: "fl-new" });

    await forecastingHandlers.create_expense!(
      {
        accountId: "acc-1",
        method: "fixed",
        parameters: { amount: 100 },
        startDate: "2026-01-01",
      },
      ctx
    );

    const [, , values] = mockScenarioInsert.mock.calls[0]!;
    expect(values.frequency).toBe("monthly");
    expect(values.isOneTime).toBe(false);
    expect(values.isRecurring).toBeNull();
  });

  it("rejects an invalid startDate format", async () => {
    const result = await forecastingHandlers.create_expense!(
      {
        accountId: "acc-1",
        method: "fixed",
        parameters: { amount: 100 },
        startDate: "not-a-date",
      },
      ctx
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/Invalid input/i);
    expect(mockScenarioInsert).not.toHaveBeenCalled();
  });
});
