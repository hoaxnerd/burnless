import { describe, it, expect, beforeAll, vi } from "vitest";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import {
  getPermissionDefaults,
  upsertPermissionDefaults,
} from "../queries/ai-permissions";
import { createCompanyContext } from "./factories";

describe("ai permission defaults queries", () => {
  let userId: string;
  let companyId: string;

  beforeAll(async () => {
    const ctx = await createCompanyContext({
      user: { email: "perm-defaults@test.burnless.app" },
      company: { name: "Perm Co" },
      scenario: { name: "S" },
    });
    userId = ctx.user.id;
    companyId = ctx.company.id;
  });

  it("returns null when no row exists", async () => {
    expect(await getPermissionDefaults(userId, companyId)).toBeNull();
  });

  it("upserts then reads back", async () => {
    await upsertPermissionDefaults(userId, companyId, { writeMode: "session" });
    const row = await getPermissionDefaults(userId, companyId);
    expect(row?.writeMode).toBe("session");
    expect(row?.readMode).toBe("always"); // default preserved
  });

  it("upsert updates an existing row (no duplicate)", async () => {
    await upsertPermissionDefaults(userId, companyId, { browserUseMode: "always" });
    const row = await getPermissionDefaults(userId, companyId);
    expect(row?.browserUseMode).toBe("always");
    expect(row?.writeMode).toBe("session"); // earlier value retained
  });
});
