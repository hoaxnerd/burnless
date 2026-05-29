/**
 * Tests for funding-round AI tool handlers.
 *
 * Phase 2 D §1.5 — covers create/update/delete/investor/milestone/dilution,
 * Zod validation gates, and roundType immutability enforcement.
 *
 * Uses vi.mock to avoid PGLite setup (consistent with other web ai-tools tests).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockScenarioInsert,
  mockScenarioUpdate,
  mockScenarioDelete,
  mockDbSelect,
  mockDbInsert,
} = vi.hoisted(() => ({
  mockScenarioInsert: vi.fn(),
  mockScenarioUpdate: vi.fn(),
  mockScenarioDelete: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
}));

vi.mock("@burnless/db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
  fundingRounds: {
    id: "id",
    companyId: "companyId",
    name: "name",
    type: "type",
    parameters: "parameters",
  },
  fundingRoundInvestors: {
    fundingRoundId: "fundingRoundId",
    name: "name",
    email: "email",
    amountInvested: "amountInvested",
  },
  companies: {
    id: "id",
    currency: "currency",
    locale: "locale",
  },
  scenarioInsert: mockScenarioInsert,
  scenarioUpdate: mockScenarioUpdate,
  scenarioDelete: mockScenarioDelete,
}));

// ── Import handlers after mocks ───────────────────────────────────────────────

import {
  createFundingRound,
  updateFundingRound,
  deleteFundingRound,
  addFundingRoundInvestor,
  markGrantMilestoneHit,
  modelDilution,
} from "../funding";
import type { ToolContext } from "../types";

// ── Test context + helpers ────────────────────────────────────────────────────

const ctx: ToolContext = {
  companyId: "co-1",
  scenarioId: "sc-1",
  userId: "u-1",
};

function mockCompanyCurrency(currency = "USD", locale = "en-US") {
  mockDbSelect.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([{ currency, locale }]),
      }),
    }),
  });
}

function mockFundingRoundRow(row: Record<string, unknown> | null) {
  mockDbSelect.mockReturnValue({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(row ? [row] : []),
      }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── create_funding_round ──────────────────────────────────────────────────────

describe("createFundingRound", () => {
  it("persists a safe round with parameters and returns fundingRoundId", async () => {
    mockCompanyCurrency();
    mockScenarioInsert.mockResolvedValue({ id: "fr-seed" });

    const result = await createFundingRound(
      {
        name: "Seed",
        roundType: "safe",
        amount: 500_000,
        date: "2026-01-01",
        parameters: { valuationCap: 5_000_000, discountRate: 0.2 },
      },
      ctx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.fundingRoundId).toBe("fr-seed");
    expect(mockScenarioInsert).toHaveBeenCalledTimes(1);

    const [, , values, scenarioId] = mockScenarioInsert.mock.calls[0]!;
    expect(scenarioId).toBe("sc-1");
    expect(values).toMatchObject({
      companyId: "co-1",
      type: "safe",
      name: "Seed",
    });
    expect(values.parameters).toMatchObject({
      valuationCap: 5_000_000,
      discountRate: 0.2,
    });
  });

  it("persists a grant round with milestones", async () => {
    mockCompanyCurrency();
    mockScenarioInsert.mockResolvedValue({ id: "fr-grant" });

    const result = await createFundingRound(
      {
        name: "SBIR",
        roundType: "grant",
        amount: 200_000,
        date: "2026-01-01",
        parameters: {
          milestones: [
            { id: "m1", label: "Q1 Deliverable", amount: 100_000, dueDate: "2026-04-01" },
          ],
        },
      },
      ctx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.fundingRoundId).toBe("fr-grant");
    const [, , values] = mockScenarioInsert.mock.calls[0]!;
    expect(values.type).toBe("grant");
    expect(values.parameters.milestones).toHaveLength(1);
  });

  it("REJECTS missing roundType (Zod required field)", async () => {
    const result = await createFundingRound(
      { name: "Seed", amount: 500_000, date: "2026-01-01" },
      ctx,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/roundType/i);
    expect(mockScenarioInsert).not.toHaveBeenCalled();
  });

  it("REJECTS unknown fields due to strict schema", async () => {
    const result = await createFundingRound(
      {
        name: "Series A",
        roundType: "series_a",
        amount: 5_000_000,
        date: "2026-06-01",
        unknownField: "boom",
      } as Record<string, unknown>,
      ctx,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(mockScenarioInsert).not.toHaveBeenCalled();
  });
});

// ── update_funding_round — roundType immutability ─────────────────────────────

describe("updateFundingRound", () => {
  it("REJECTS roundType in input (strict schema enforces immutability)", async () => {
    const result = await updateFundingRound(
      { id: "fr-1", roundType: "series_a" } as Record<string, unknown>,
      ctx,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    // Zod strict() rejects unrecognized keys
    expect(parsed.error).toMatch(/roundType|unrecognized|unknown/i);
    expect(mockScenarioUpdate).not.toHaveBeenCalled();
  });

  it("updates mutable fields (name, amount, notes)", async () => {
    // First call returns company currency; second call returns the round row
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([{ id: "fr-1", name: "Old Name" }]),
        }),
      });
    mockScenarioUpdate.mockResolvedValue({ id: "fr-1" });

    const result = await updateFundingRound(
      { id: "fr-1", name: "Updated Name", notes: "Post term-sheet" },
      ctx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    const [, , entityId, updates, scenarioId] = mockScenarioUpdate.mock.calls[0]!;
    expect(entityId).toBe("fr-1");
    expect(scenarioId).toBe("sc-1");
    expect(updates).toMatchObject({ name: "Updated Name", notes: "Post term-sheet" });
  });

  it("returns success=false with no-op when no fields provided beyond id", async () => {
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([{ id: "fr-1", name: "Seed" }]),
      }),
    });

    const result = await updateFundingRound({ id: "fr-1" }, ctx);
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/no fields/i);
    expect(mockScenarioUpdate).not.toHaveBeenCalled();
  });

  it("returns success=false when round not found", async () => {
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    });

    const result = await updateFundingRound({ id: "fr-missing", name: "X" }, ctx);
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/not found/i);
  });
});

// ── delete_funding_round ──────────────────────────────────────────────────────

describe("deleteFundingRound", () => {
  it("deletes existing round and returns success", async () => {
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([{ id: "fr-1", name: "Seed" }]),
      }),
    });
    mockScenarioDelete.mockResolvedValue(undefined);

    const result = await deleteFundingRound({ id: "fr-1" }, ctx);
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.message).toContain("Seed");
    expect(mockScenarioDelete).toHaveBeenCalledTimes(1);
    const [, , entityId, scenarioId] = mockScenarioDelete.mock.calls[0]!;
    expect(entityId).toBe("fr-1");
    expect(scenarioId).toBe("sc-1");
  });

  it("returns success=false when round not found", async () => {
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([]),
      }),
    });

    const result = await deleteFundingRound({ id: "fr-gone" }, ctx);
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/not found/i);
    expect(mockScenarioDelete).not.toHaveBeenCalled();
  });
});

// ── create_funding_round_investor ─────────────────────────────────────────────

describe("addFundingRoundInvestor", () => {
  it("inserts investor and returns investorId", async () => {
    // Round ownership check
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([{ id: "fr-1", name: "Seed" }]),
        }),
      })
      // Company currency check
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ currency: "USD", locale: "en-US" }]),
          }),
        }),
      });

    mockDbInsert.mockReturnValue({
      values: () => ({
        returning: () => Promise.resolve([{ id: "inv-1" }]),
      }),
    });

    const result = await addFundingRoundInvestor(
      { fundingRoundId: "fr-1", name: "Y Combinator", amountInvested: 150_000 },
      ctx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.investorId).toBe("inv-1");
    expect(parsed.message).toContain("Y Combinator");
  });

  it("rejects missing amountInvested", async () => {
    const result = await addFundingRoundInvestor(
      { fundingRoundId: "fr-1", name: "Y Combinator" } as Record<string, unknown>,
      ctx,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/amountInvested/i);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });
});

// ── update_grant_milestone ────────────────────────────────────────────────────

describe("markGrantMilestoneHit", () => {
  it("sets hitDate on the correct milestone", async () => {
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([
          {
            id: "fr-sbir",
            name: "SBIR",
            type: "grant",
            parameters: {
              milestones: [
                { id: "m1", label: "Q1 Deliverable", amount: 100_000, dueDate: "2026-04-01" },
              ],
            },
          },
        ]),
      }),
    });
    mockScenarioUpdate.mockResolvedValue(undefined);

    const result = await markGrantMilestoneHit(
      { fundingRoundId: "fr-sbir", milestoneId: "m1", hitDate: "2026-04-15" },
      ctx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.message).toContain("2026-04-15");

    const [, , entityId, updates, scenarioId] = mockScenarioUpdate.mock.calls[0]!;
    expect(entityId).toBe("fr-sbir");
    expect(scenarioId).toBe("sc-1");
    expect(updates.parameters.milestones[0].hitDate).toBe("2026-04-15");
  });

  it("rejects if round is not a grant", async () => {
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([
          { id: "fr-1", name: "Seed", type: "safe", parameters: {} },
        ]),
      }),
    });

    const result = await markGrantMilestoneHit(
      { fundingRoundId: "fr-1", milestoneId: "m1", hitDate: "2026-04-15" },
      ctx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/not a grant/i);
    expect(mockScenarioUpdate).not.toHaveBeenCalled();
  });

  it("rejects if milestoneId not found in the grant", async () => {
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        where: () => Promise.resolve([
          {
            id: "fr-sbir",
            name: "SBIR",
            type: "grant",
            parameters: { milestones: [{ id: "m1", label: "Q1", amount: 0, dueDate: "2026-04-01" }] },
          },
        ]),
      }),
    });

    const result = await markGrantMilestoneHit(
      { fundingRoundId: "fr-sbir", milestoneId: "m-ghost", hitDate: "2026-04-15" },
      ctx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/not found/i);
  });
});

// ── model_dilution ────────────────────────────────────────────────────────────

describe("modelDilution", () => {
  it("computes founder post-round ownership and returns cap table", async () => {
    mockCompanyCurrency();

    const result = await modelDilution(
      {
        roundAmount: 1_000_000,
        preMoneyValuation: 4_000_000,
        existingOwnershipPercent: 80,
      },
      ctx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.roundDetails.postMoneyValuation).toBe(5_000_000);
    // Investor gets 1M/5M = 20%, founders get 80% * (1 - 0.20) = 64%
    expect(parsed.capTable.postRound.founders).toBeCloseTo(0.64, 4);
    expect(parsed.capTable.postRound.newInvestor).toBeCloseTo(0.2, 4);
  });

  it("accounts for optionPoolPercent", async () => {
    mockCompanyCurrency();

    const result = await modelDilution(
      {
        roundAmount: 1_000_000,
        preMoneyValuation: 4_000_000,
        existingOwnershipPercent: 80,
        optionPoolPercent: 10,
      },
      ctx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    // optionPool = 0.10, newInvestor = 0.20; founders = 0.80*(1-0.30) = 0.56
    expect(parsed.capTable.postRound.founders).toBeCloseTo(0.56, 4);
    expect(parsed.capTable.postRound.optionPool).toBeCloseTo(0.10, 4);
  });

  it("REJECTS missing existingOwnershipPercent (now required)", async () => {
    const result = await modelDilution(
      { roundAmount: 1_000_000, preMoneyValuation: 4_000_000 } as Record<string, unknown>,
      ctx,
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/existingOwnershipPercent/i);
  });

  it("returns existingRounds passthrough when provided", async () => {
    mockCompanyCurrency();

    const result = await modelDilution(
      {
        roundAmount: 500_000,
        preMoneyValuation: 2_000_000,
        existingOwnershipPercent: 70,
        existingRounds: [{ name: "Pre-Seed", amount: 250_000, ownership: 0.1 }],
      },
      ctx,
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.existingRounds).toHaveLength(1);
    expect(parsed.existingRounds[0].name).toBe("Pre-Seed");
  });
});
