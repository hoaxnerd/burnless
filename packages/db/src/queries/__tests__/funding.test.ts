import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
import { getTestDb } from "../../__tests__/setup";

// Mock the db import used by query functions — point it at PGLite
vi.mock("../../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import { createUser, createCompany } from "../../__tests__/factories";
import {
  listInvestorsForRound,
  listShareClasses,
  listOptionPools,
} from "../funding";
import {
  fundingRounds,
  fundingRoundInvestors,
  shareClasses,
  optionPools,
} from "../../schema";

describe("funding query helpers", () => {
  let companyId: string;

  beforeEach(async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    companyId = company.id;
  });

  it("listInvestorsForRound returns investors for a round, oldest first", async () => {
    const db = getTestDb();
    const [round] = await db
      .insert(fundingRounds)
      .values({
        companyId,
        name: "Seed",
        type: "seed",
        amount: "1000000",
        date: new Date("2026-01-01"),
        parameters: {},
      })
      .returning();
    await db.insert(fundingRoundInvestors).values([
      {
        fundingRoundId: round!.id,
        name: "Alice Fund",
        amountInvested: "500000",
      },
      {
        fundingRoundId: round!.id,
        name: "Bob Capital",
        amountInvested: "500000",
      },
    ]);
    const rows = await listInvestorsForRound(round!.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.name).toBe("Alice Fund");
  });

  it("listShareClasses excludes soft-deleted rows", async () => {
    const db = getTestDb();
    await db.insert(shareClasses).values([
      {
        companyId,
        name: "Common",
        totalAuthorized: "10000000",
        totalIssued: "5000000",
      },
      {
        companyId,
        name: "Series A Preferred",
        totalAuthorized: "2000000",
        totalIssued: "1500000",
        deletedAt: new Date(),
      },
    ]);
    const rows = await listShareClasses(companyId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Common");
  });

  it("listOptionPools excludes soft-deleted rows", async () => {
    const db = getTestDb();
    await db.insert(optionPools).values({
      companyId,
      name: "2026 Plan",
      totalReserved: "1000000",
    });
    const rows = await listOptionPools(companyId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("2026 Plan");
  });
});
