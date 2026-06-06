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

describe("aiPendingActions kind:'plan'", () => {
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

  it("stores kind 'plan' with a spec payload in pending", async () => {
    await createPendingAction({
      conversationId,
      pauseId: "p-plan",
      kind: "plan",
      scenarioId,
      assistantBlocks: [{ type: "tool_use", id: "tu-p", name: "propose_plan", input: {} }],
      completedResults: [],
      pending: { planToolUseId: "tu-p", spec: { title: "Model hire", steps: [] } },
    });
    const row = await getActivePendingAction(conversationId);
    expect(row?.kind).toBe("plan");
    expect((row?.pending as { planToolUseId: string }).planToolUseId).toBe("tu-p");
    await resolvePendingAction(row!.id);
  });
});
