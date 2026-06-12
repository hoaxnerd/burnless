import { describe, it, expect, vi } from "vitest";
import { getTestDb } from "../../__tests__/setup";

vi.mock("../../index", () => ({ get db() { return getTestDb(); } }));

import { createCompanyContext } from "../../__tests__/factories";
import { aiConversations } from "../../schema";
import {
  getSessionDisabledTools,
  setSessionDisabledTool,
  resetSessionDisabledTools,
  getDisabledBuiltinTools,
  upsertUserPreferences,
} from "..";

async function seedConversation() {
  const db = getTestDb();
  const ctx = await createCompanyContext();
  const [conv] = await db
    .insert(aiConversations)
    .values({ companyId: ctx.company.id, userId: ctx.user.id })
    .returning();
  return { ...ctx, conversationId: conv!.id };
}

describe("session-disabled tools", () => {
  it("merges + reads + resets the per-conversation map", async () => {
    const { conversationId } = await seedConversation();

    expect(await getSessionDisabledTools(conversationId)).toEqual({});

    await setSessionDisabledTool(conversationId, "builtin:get_metrics", true);
    await setSessionDisabledTool(conversationId, "conn:abc", true);
    expect(await getSessionDisabledTools(conversationId)).toEqual({
      "builtin:get_metrics": true,
      "conn:abc": true,
    });

    // re-enable removes the key
    await setSessionDisabledTool(conversationId, "builtin:get_metrics", false);
    expect(await getSessionDisabledTools(conversationId)).toEqual({
      "conn:abc": true,
    });

    await resetSessionDisabledTools(conversationId);
    expect(await getSessionDisabledTools(conversationId)).toEqual({});
  });

  it("reads disabledBuiltinTools from user prefs (default [])", async () => {
    const ctx = await createCompanyContext();
    const { id: userId } = ctx.user;
    const companyId = ctx.company.id;

    expect(await getDisabledBuiltinTools(userId, companyId)).toEqual([]);

    await upsertUserPreferences(userId, companyId, {
      disabledBuiltinTools: ["record_transaction"],
    });
    expect(await getDisabledBuiltinTools(userId, companyId)).toEqual([
      "record_transaction",
    ]);

    // partial-patch: a later upsert that omits disabledBuiltinTools keeps it
    await upsertUserPreferences(userId, companyId, { sidebarCollapsed: true });
    expect(await getDisabledBuiltinTools(userId, companyId)).toEqual([
      "record_transaction",
    ]);
  });
});
