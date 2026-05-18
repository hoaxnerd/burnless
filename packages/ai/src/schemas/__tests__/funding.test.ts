import { describe, it, expect } from "vitest";
import {
  CreateFundingRoundSchema,
  UpdateFundingRoundSchema,
  AddFundingRoundInvestorSchema,
  MarkGrantMilestoneHitSchema,
} from "../funding";

describe("funding schemas", () => {
  it("CreateFundingRound requires roundType", () => {
    const result = CreateFundingRoundSchema.safeParse({
      name: "Seed", amount: 1_000_000, date: "2026-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("UpdateFundingRound REJECTS roundType field (immutability)", () => {
    const result = UpdateFundingRoundSchema.safeParse({ id: "r1", roundType: "series_a" });
    expect(result.success).toBe(false);
  });

  it("UpdateFundingRound REJECTS type field (immutability — alternate spelling)", () => {
    const result = UpdateFundingRoundSchema.safeParse({ id: "r1", type: "series_a" });
    expect(result.success).toBe(false);
  });

  it("UpdateFundingRound accepts parameters", () => {
    const result = UpdateFundingRoundSchema.safeParse({
      id: "r1", parameters: { valuationCap: 5_000_000, discountRate: 0.2 },
    });
    expect(result.success).toBe(true);
  });

  it("AddFundingRoundInvestor requires positive amount", () => {
    const result = AddFundingRoundInvestorSchema.safeParse({
      fundingRoundId: "r1", name: "Alice", amountInvested: -100,
    });
    expect(result.success).toBe(false);
  });

  it("MarkGrantMilestoneHit requires fundingRoundId + milestoneId + hitDate", () => {
    expect(MarkGrantMilestoneHitSchema.safeParse({
      fundingRoundId: "r1", milestoneId: "m1", hitDate: "2026-04-01",
    }).success).toBe(true);
  });
});
