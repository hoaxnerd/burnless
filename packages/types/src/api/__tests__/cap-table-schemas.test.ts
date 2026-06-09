import { describe, it, expect } from "vitest";
import {
  createShareClassSchema,
  updateShareClassSchema,
  createOptionPoolSchema,
  updateOptionPoolSchema,
} from "../schemas";

/**
 * Cap-table CRUD Zod schemas (T1). Share classes carry an explicit `classType`
 * enum ('common' | 'preferred') — the engine classifies by this, NEVER a name
 * regex (funding.ts:190, compute-cap-table.ts:157). Share counts are integers
 * (numeric(18,0) in the DB). `totalIssued <= totalAuthorized` is enforced so the
 * cap table foots honestly.
 */
describe("createShareClassSchema", () => {
  it("parses a valid common-stock class and preserves classType:'common'", () => {
    const r = createShareClassSchema.parse({
      name: "Common",
      classType: "common",
      totalAuthorized: 10_000_000,
      totalIssued: 8_000_000,
      liquidationPreference: 1,
    });
    expect(r.classType).toBe("common");
    expect(r.totalAuthorized).toBe(10_000_000);
    expect(r.totalIssued).toBe(8_000_000);
    expect(r.liquidationPreference).toBe(1);
  });

  it("defaults classType to 'preferred' when omitted", () => {
    const r = createShareClassSchema.parse({
      name: "Series A Preferred",
      totalAuthorized: 5_000_000,
      totalIssued: 5_000_000,
    });
    expect(r.classType).toBe("preferred");
  });

  it("defaults liquidationPreference to 1 when omitted", () => {
    const r = createShareClassSchema.parse({
      name: "Series A Preferred",
      totalAuthorized: 5_000_000,
      totalIssued: 5_000_000,
    });
    expect(r.liquidationPreference).toBe(1);
  });

  it("rejects totalIssued > totalAuthorized at path ['totalIssued']", () => {
    const r = createShareClassSchema.safeParse({
      name: "Common",
      classType: "common",
      totalAuthorized: 100,
      totalIssued: 200,
      liquidationPreference: 1,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find(
        (i) => i.path.length === 1 && i.path[0] === "totalIssued",
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toBe("totalIssued cannot exceed totalAuthorized");
    }
  });

  it("rejects a non-integer share count", () => {
    const r = createShareClassSchema.safeParse({
      name: "Common",
      classType: "common",
      totalAuthorized: 10_000.5,
      totalIssued: 8_000,
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid classType", () => {
    const r = createShareClassSchema.safeParse({
      name: "Founders",
      classType: "founder",
      totalAuthorized: 10_000_000,
      totalIssued: 8_000_000,
    });
    expect(r.success).toBe(false);
  });
});

describe("updateShareClassSchema", () => {
  it("accepts an empty object (all optional)", () => {
    const r = updateShareClassSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("guards totalIssued <= totalAuthorized only when both present", () => {
    const bad = updateShareClassSchema.safeParse({ totalAuthorized: 100, totalIssued: 200 });
    expect(bad.success).toBe(false);
    // single-field update does not trip the refine
    const okIssued = updateShareClassSchema.safeParse({ totalIssued: 999 });
    expect(okIssued.success).toBe(true);
    const okAuth = updateShareClassSchema.safeParse({ totalAuthorized: 1 });
    expect(okAuth.success).toBe(true);
  });
});

describe("createOptionPoolSchema", () => {
  it("parses a valid pool", () => {
    const r = createOptionPoolSchema.parse({ name: "2024 Pool", totalReserved: 1_000_000 });
    expect(r.name).toBe("2024 Pool");
    expect(r.totalReserved).toBe(1_000_000);
  });

  it("rejects a negative totalReserved", () => {
    const r = createOptionPoolSchema.safeParse({ name: "2024 Pool", totalReserved: -1 });
    expect(r.success).toBe(false);
  });

  it("rejects a non-integer totalReserved", () => {
    const r = createOptionPoolSchema.safeParse({ name: "2024 Pool", totalReserved: 1.5 });
    expect(r.success).toBe(false);
  });
});

describe("updateOptionPoolSchema", () => {
  it("accepts an empty object (all optional)", () => {
    const r = updateOptionPoolSchema.safeParse({});
    expect(r.success).toBe(true);
  });
});
