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
  updatePendingActionTimeline,
} from "../queries/ai-permissions";
import { createCompanyContext } from "./factories";
import { getTestDb as _db } from "./setup";
import { aiConversations } from "../schema";

describe("updatePendingActionTimeline (Plan 5)", () => {
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

  it("sets the timeline on the active pending row and reads it back", async () => {
    await createPendingAction({
      conversationId,
      pauseId: "pause-1",
      kind: "plan",
      scenarioId,
      assistantBlocks: [],
      completedResults: [],
      pending: { planToolUseId: "t1", spec: { title: "x", steps: [] } },
    });
    const tl = [{ id: "n1", kind: "result", text: "hi" }];
    await updatePendingActionTimeline("pause-1", tl);
    const row = await getActivePendingAction(conversationId);
    expect(row?.timeline).toEqual(tl);
  });

  it("is a no-op for an unknown pauseId", async () => {
    await expect(updatePendingActionTimeline("nope", [])).resolves.toBeUndefined();
  });
});
