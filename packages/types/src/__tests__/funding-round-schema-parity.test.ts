import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createFundingRoundSchema,
  fundingRoundTypeEnum,
} from "../api/schemas";

/**
 * Guard for FUND-01, FUND-03, FUND-04 (QA findings).
 *
 * (a) FUND-01 + FUND-04: createFundingRoundSchema MUST accept the EXACT payload
 *     the Add form sends (funding-round-form.tsx handleSubmit) — keys:
 *     name, roundType, amount, date, closeDate, notes, parameters, isProjected.
 *     Today the schema requires `type` (not `roundType`) and lacks
 *     closeDate/notes/parameters, so the form payload fails -> 400 (blocker).
 *
 * (b) FUND-03: fundingRoundTypeEnum.options MUST be set-equal to the DB pgEnum
 *     values AND the engine FundingRoundType union. Today the Zod enum omits
 *     `safe` and `convertible` which BOTH the DB pgEnum and engine union (and the
 *     form's <select>) already include — so picking SAFE/Convertible is rejected.
 *
 * The DB pgEnum + engine union are read directly from source (the @burnless/db /
 * @burnless/engine packages are not resolvable as deps from @burnless/types), so
 * this stays a true single-source-of-truth parity check.
 */

// Resolve repo root: vitest runs from packages/types/, go up two levels.
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../");

/** Extract the funding_round_type pgEnum value list from the DB schema source. */
function dbPgEnumValues(): string[] {
  const src = readFileSync(
    path.join(REPO_ROOT, "packages/db/src/schema.ts"),
    "utf8",
  );
  const m = src.match(
    /export const fundingRoundTypeEnum = pgEnum\(\s*"funding_round_type",\s*\[([\s\S]*?)\]\s*\)/,
  );
  if (!m) throw new Error("Could not locate fundingRoundTypeEnum pgEnum in packages/db/src/schema.ts");
  return [...m[1]!.matchAll(/"([a-z_]+)"/g)].map((x) => x[1]!);
}

/** Extract the engine FundingRoundType string-literal union members from source. */
function engineUnionValues(): string[] {
  const src = readFileSync(
    path.join(REPO_ROOT, "packages/engine/src/funding.ts"),
    "utf8",
  );
  const m = src.match(/export type FundingRoundType =([\s\S]*?);/);
  if (!m) throw new Error("Could not locate FundingRoundType union in packages/engine/src/funding.ts");
  return [...m[1]!.matchAll(/"([a-z_]+)"/g)].map((x) => x[1]!);
}

describe("FUND-01/FUND-04: createFundingRoundSchema accepts the add-form payload", () => {
  it("accepts the exact payload the Add form sends (roundType + parameters/closeDate/notes)", () => {
    // Mirror of funding-round-form.tsx handleSubmit payload for mode === "add".
    const formPayload = {
      name: "Seed Round",
      roundType: "seed",
      amount: 1_000_000,
      date: "2026-06-08",
      closeDate: null,
      notes: null,
      parameters: { shares: 100000, pricePerShare: 10 },
      isProjected: false,
    };
    const result = createFundingRoundSchema.safeParse(formPayload);
    expect(result.success).toBe(true);
  });
});

describe("FUND-03: fundingRoundTypeEnum is set-equal across types/DB/engine", () => {
  const zodValues = [...fundingRoundTypeEnum.options].sort();
  const dbValues = dbPgEnumValues().sort();
  const engineValues = engineUnionValues().sort();

  it("DB pgEnum source parsing sanity (includes safe + convertible)", () => {
    expect(dbValues).toContain("safe");
    expect(dbValues).toContain("convertible");
  });

  it("engine union source parsing sanity (includes safe + convertible)", () => {
    expect(engineValues).toContain("safe");
    expect(engineValues).toContain("convertible");
  });

  it("Zod enum options equal the DB pgEnum values", () => {
    expect(zodValues).toEqual(dbValues);
  });

  it("Zod enum options equal the engine FundingRoundType union", () => {
    expect(zodValues).toEqual(engineValues);
  });

  it("Zod enum accepts SAFE and convertible round types", () => {
    expect(fundingRoundTypeEnum.safeParse("safe").success).toBe(true);
    expect(fundingRoundTypeEnum.safeParse("convertible").success).toBe(true);
  });
});
