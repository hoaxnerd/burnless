import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../__tests__/setup";

vi.mock("../../index", () => ({ get db() { return getTestDb(); } }));

import { createCompanyContext } from "../../__tests__/factories";
import { aiConversations } from "../../schema";
import {
  appendTurnEvent,
  getTurnEvents,
  getOpenGate,
  resolveOpenGate,
} from "../turn-events";

describe("turn-events", () => {
  let conversationId: string;

  beforeEach(async () => {
    const db = getTestDb();
    const ctx = await createCompanyContext();
    const [conv] = await db
      .insert(aiConversations)
      .values({ companyId: ctx.company.id, userId: ctx.user.id })
      .returning();
    conversationId = conv!.id;
  });

  it("assigns monotonic seq and reads back in order", async () => {
    await appendTurnEvent({ conversationId, turnId: "t1", type: "user_message", payload: { text: "a" } });
    await appendTurnEvent({ conversationId, turnId: "t1", type: "assistant_step", payload: { text: "b" } });
    const events = await getTurnEvents(conversationId);
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
    expect(events.map((e) => e.type)).toEqual(["user_message", "assistant_step"]);
  });

  it("getOpenGate returns the unresolved gate; resolveOpenGate clears it", async () => {
    await appendTurnEvent({
      conversationId,
      turnId: "t1",
      type: "gate",
      payload: { pauseId: "p", kind: "permission", scenarioId: "s", writeScenarioId: null },
    });
    expect((await getOpenGate(conversationId))?.payload).toMatchObject({ pauseId: "p" });
    await resolveOpenGate(conversationId);
    expect(await getOpenGate(conversationId)).toBeNull();
    await appendTurnEvent({
      conversationId,
      turnId: "t2",
      type: "gate",
      payload: { pauseId: "p2", kind: "input", scenarioId: "s", writeScenarioId: null },
    });
    expect((await getOpenGate(conversationId))?.payload).toMatchObject({ pauseId: "p2" });
  });
});
