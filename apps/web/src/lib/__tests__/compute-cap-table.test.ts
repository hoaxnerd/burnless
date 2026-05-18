import { describe, it, expect, vi } from "vitest";

// Mock dependencies that require DB/auth context before importing the module
vi.mock("../auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));
vi.mock("@burnless/db", () => ({
  db: { select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }) },
  fundingRounds: {},
  equityGrants: {},
  listShareClasses: vi.fn().mockResolvedValue([]),
  listOptionPools: vi.fn().mockResolvedValue([]),
  resolveEntities: vi.fn().mockResolvedValue([]),
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown) => fn,
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});

import { computeCapTableForCompany } from "../compute-cap-table";

describe("computeCapTableForCompany", () => {
  it("exports a callable function", () => {
    expect(typeof computeCapTableForCompany).toBe("function");
  });
});
