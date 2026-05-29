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
  createPendingAction,
  getActivePendingAction,
  resolvePendingAction,
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

describe("pending actions", () => {
  let convId: string;
  let scenarioId: string;

  beforeAll(async () => {
    const ctx = await createCompanyContext({
      user: { email: "pending@test.burnless.app" },
      company: { name: "Pending Co" },
      scenario: { name: "S" },
    });
    scenarioId = ctx.scenario.id;
    const [conv] = await _db()
      .insert(aiConversations)
      .values({ companyId: ctx.company.id, userId: ctx.user.id, title: "t" })
      .returning();
    convId = conv!.id;
  });

  it("creates and reads back the active pending batch", async () => {
    const row = await createPendingAction({
      conversationId: convId,
      pauseId: "p1",
      scenarioId,
      assistantBlocks: [{ type: "tool_use", id: "t1", name: "create_scenario", input: {} }],
      completedResults: [],
      // Shape matches Plan 3's PendingToolUse exactly: { requestId, toolName, toolInput }.
      pending: [{ requestId: "t1", toolName: "create_scenario", toolInput: {} }],
    });
    expect(row.id).toBeTruthy();
    expect(row.scenarioId).toBe(scenarioId);
    const active = await getActivePendingAction(convId);
    expect(active?.pauseId).toBe("p1");
  });

  it("rejects a second active batch for the same conversation", async () => {
    await expect(
      createPendingAction({
        conversationId: convId,
        pauseId: "p2",
        scenarioId,
        assistantBlocks: [],
        completedResults: [],
        pending: [],
      })
    ).rejects.toThrow();
  });

  it("resolving frees the slot for a new batch", async () => {
    const active = await getActivePendingAction(convId);
    await resolvePendingAction(active!.id);
    expect(await getActivePendingAction(convId)).toBeNull();
    const row = await createPendingAction({
      conversationId: convId,
      pauseId: "p3",
      scenarioId,
      assistantBlocks: [],
      completedResults: [],
      pending: [],
    });
    expect(row.pauseId).toBe("p3");
  });
});
