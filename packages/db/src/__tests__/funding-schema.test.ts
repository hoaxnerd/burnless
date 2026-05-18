import { describe, it, expect } from "vitest";
import {
  fundingRounds,
  fundingRoundInvestors,
  shareClasses,
  optionPools,
  companies,
  auditEntityTypeEnum,
} from "../schema";

describe("Phase 2 funding schema", () => {
  it("fundingRounds has parameters jsonb + closeDate + notes", () => {
    const cols = Object.keys(fundingRounds);
    expect(cols).toContain("parameters");
    expect(cols).toContain("closeDate");
    expect(cols).toContain("notes");
  });

  it("companies has foundersOwnershipPercent", () => {
    expect(Object.keys(companies)).toContain("foundersOwnershipPercent");
  });

  it("fundingRoundInvestors junction exists with fundingRoundId + name + amountInvested", () => {
    const cols = Object.keys(fundingRoundInvestors);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id", "fundingRoundId", "name", "email", "amountInvested", "createdAt",
      ]),
    );
  });

  it("shareClasses has totalAuthorized + totalIssued + liquidationPreference", () => {
    const cols = Object.keys(shareClasses);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id", "companyId", "name", "totalAuthorized", "totalIssued",
        "parValue", "liquidationPreference", "deletedAt",
      ]),
    );
  });

  it("optionPools has totalReserved + refreshDate", () => {
    const cols = Object.keys(optionPools);
    expect(cols).toEqual(
      expect.arrayContaining([
        "id", "companyId", "name", "totalReserved", "refreshDate", "deletedAt",
      ]),
    );
  });
});

describe("audit_entity_type enum (Phase 2 D extension)", () => {
  it("includes funding_round_investor, share_class, option_pool", () => {
    expect(auditEntityTypeEnum.enumValues).toEqual(
      expect.arrayContaining([
        "funding_round_investor",
        "share_class",
        "option_pool",
      ]),
    );
  });
});
