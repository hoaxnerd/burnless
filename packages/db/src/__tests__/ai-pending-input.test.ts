import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "./setup";

vi.mock("../index", () => ({
  get db() {
    return getTestDb();
  },
}));

import {
  createPendingAction,
  getActivePendingAction,
  resolvePendingAction,
} from "../queries/ai-permissions";
import { createCompanyContext } from "./factories";
import { getTestDb as _db } from "./setup";
import { aiConversations } from "../schema";

describe("aiPendingActions kind discriminator", () => {
  let conversationId: string;
  let scenarioId: string;

  beforeEach(async () => {
    const ctx = await createCompanyContext();
    scenarioId = ctx.scenario.id;
    const [conv] = await _db()
      .insert(aiConversations)
      .values({ companyId: ctx.company.id, userId: ctx.user.id, title: "t" })
      .returning();
    conversationId = conv!.id;
  });

  it("defaults kind to 'permission'", async () => {
    await createPendingAction({
      conversationId,
      pauseId: "p1",
      scenarioId,
      assistantBlocks: [],
      completedResults: [],
      pending: [],
    });
    const row = await getActivePendingAction(conversationId);
    expect(row?.kind).toBe("permission");
    await resolvePendingAction(row!.id);
  });

  it("stores kind 'input' with a spec payload in pending", async () => {
    await createPendingAction({
      conversationId,
      pauseId: "p2",
      scenarioId,
      kind: "input",
      assistantBlocks: [{ type: "text", text: "x" }],
      completedResults: [],
      pending: { inputToolUseId: "tu-1", spec: { title: "Add", fields: [] } },
    });
    const row = await getActivePendingAction(conversationId);
    expect(row?.kind).toBe("input");
    expect((row?.pending as { inputToolUseId: string }).inputToolUseId).toBe("tu-1");
    await resolvePendingAction(row!.id);
  });
});
