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
  createShareClass,
  updateShareClass,
  softDeleteShareClass,
  listShareClasses,
  createOptionPool,
  updateOptionPool,
  softDeleteOptionPool,
  countOptionPools,
  listOptionPools,
} from "../funding";

describe("funding CRUD helpers — share classes", () => {
  let companyId: string;

  beforeEach(async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    companyId = company.id;
  });

  it("createShareClass inserts and returns the row with numeric strings intact", async () => {
    const row = await createShareClass(companyId, {
      name: "Common",
      classType: "common",
      totalAuthorized: "10000000",
      totalIssued: "8000000",
      liquidationPreference: "1.0000",
    });
    expect(row.name).toBe("Common");
    expect(row.classType).toBe("common");
    expect(row.totalIssued).toBe("8000000");
    expect(row.totalAuthorized).toBe("10000000");
    expect(row.deletedAt).toBeNull();
  });

  it("updateShareClass mutates a company-scoped row", async () => {
    const created = await createShareClass(companyId, {
      name: "Common",
      classType: "common",
      totalAuthorized: "10000000",
      totalIssued: "5000000",
    });
    const updated = await updateShareClass(created.id, companyId, {
      totalIssued: "7500000",
    });
    expect(updated?.totalIssued).toBe("7500000");
  });

  it("softDeleteShareClass excludes the row from listShareClasses", async () => {
    const created = await createShareClass(companyId, {
      name: "Common",
      classType: "common",
      totalAuthorized: "10000000",
      totalIssued: "5000000",
    });
    let rows = await listShareClasses(companyId);
    expect(rows).toHaveLength(1);

    await softDeleteShareClass(created.id, companyId);

    rows = await listShareClasses(companyId);
    expect(rows).toHaveLength(0);
  });
});

describe("funding CRUD helpers — option pools", () => {
  let companyId: string;

  beforeEach(async () => {
    const user = await createUser();
    const company = await createCompany(user.id);
    companyId = company.id;
  });

  it("createOptionPool inserts and returns the row", async () => {
    const row = await createOptionPool(companyId, {
      name: "2026 Plan",
      totalReserved: "1000000",
    });
    expect(row.name).toBe("2026 Plan");
    expect(row.totalReserved).toBe("1000000");
    expect(row.deletedAt).toBeNull();
  });

  it("updateOptionPool mutates a company-scoped row", async () => {
    const created = await createOptionPool(companyId, {
      name: "2026 Plan",
      totalReserved: "1000000",
    });
    const updated = await updateOptionPool(created.id, companyId, {
      totalReserved: "1500000",
    });
    expect(updated?.totalReserved).toBe("1500000");
  });

  it("countOptionPools returns 1 after create and 0 after soft delete", async () => {
    const created = await createOptionPool(companyId, {
      name: "2026 Plan",
      totalReserved: "1000000",
    });
    expect(await countOptionPools(companyId)).toBe(1);

    await softDeleteOptionPool(created.id, companyId);

    expect(await countOptionPools(companyId)).toBe(0);
    const rows = await listOptionPools(companyId);
    expect(rows).toHaveLength(0);
  });
});
