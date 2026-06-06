import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getTestDb } from "../../__tests__/setup";

import { vi } from "vitest";

vi.mock("../../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import { createCompanyContext, createFundingRound } from "../../__tests__/factories";
import { fundingRounds } from "../../schema";
import { scenarioUpdate } from "../scenario-mutations";

describe("scenarioUpdate funding-round roundType immutability", () => {
  it("strips type from update payload silently (Zod is primary gate; this is defense-in-depth)", async () => {
    const ctx = await createCompanyContext({
      user: { email: "funding-immutability@test.burnless.app" },
      company: { name: "Funding Immutability Co" },
    });

    const round = await createFundingRound(ctx.company.id, {
      name: "Seed",
      type: "seed",
      amount: "1000000",
    });

    // Positional signature: scenarioUpdate(entityType, table, entityId, changes, scenarioId, companyId)
    await scenarioUpdate(
      "funding_round",
      fundingRounds,
      round.id,
      { name: "Renamed", type: "series_a" as any, amount: "2000000" },
      null, // null scenarioId = base mutation
      ctx.company.id,
    );

    const db = getTestDb();
    const [after] = await db
      .select()
      .from(fundingRounds)
      .where(eq(fundingRounds.id, round.id));
    if (!after) throw new Error("funding round not found after update");
    expect(after.name).toBe("Renamed");
    expect(after.amount).toBe("2000000.00");
    expect(after.type).toBe("seed"); // unchanged — type stripped
  });
});
