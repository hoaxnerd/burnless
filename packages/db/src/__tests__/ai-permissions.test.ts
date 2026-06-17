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
  getSessionGrants,
  grantSessionPermission,
  resetSessionGrants,
} from "../queries/ai-permissions";
import { createCompanyContext } from "./factories";
import { getTestDb as _db } from "./setup";
import { aiConversations } from "../schema";

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

describe("conversation session grants", () => {
  let convId: string;
  let companyId2: string;
  let userId2: string;

  beforeAll(async () => {
    const ctx = await createCompanyContext({
      user: { email: "session-grants@test.burnless.app" },
      company: { name: "Session Co" },
      scenario: { name: "S" },
    });
    companyId2 = ctx.company.id;
    userId2 = ctx.user.id;
    const [conv] = await _db()
      .insert(aiConversations)
      .values({ companyId: companyId2, userId: userId2, title: "t" })
      .returning();
    convId = conv!.id;
  });

  it("starts with no grants", async () => {
    expect(await getSessionGrants(convId)).toEqual({});
  });

  it("grants a category and merges", async () => {
    await grantSessionPermission(convId, "write");
    await grantSessionPermission(convId, "delete");
    expect(await getSessionGrants(convId)).toEqual({ write: true, delete: true });
  });

  it("reset clears all grants", async () => {
    await resetSessionGrants(convId);
    expect(await getSessionGrants(convId)).toEqual({});
  });
});
