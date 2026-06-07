import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai-tools", () => ({
  executeToolCall: vi.fn(async (name: string) =>
    name === "create_scenario"
      ? JSON.stringify({ success: true, scenarioId: "sc-new", name: "Aggressive Hiring" })
      : JSON.stringify({ ok: true }),
  ),
  describeToolAction: vi.fn(() => "create scenario"),
  logDeniedToolCall: vi.fn(),
}));

const chatStreamMock = vi.fn();
vi.mock("@burnless/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@burnless/ai")>();
  return { ...actual, chatStream: (...a: unknown[]) => chatStreamMock(...a) };
});
vi.mock("@burnless/db", () => ({
  db: { insert: () => ({ values: async () => {} }), update: () => ({ set: () => ({ where: async () => {} }) }) },
  createPendingAction: vi.fn(async () => ({ id: "p1" })),
  updatePendingActionTimeline: vi.fn(async () => {}),
  aiConversations: {}, aiMessages: {},
}));

import { buildChatSSEResponse, scenarioActivationFrom } from "../chat-stream";

async function collect(res: Response) {
  return (await res.text()).split("\n\n").filter((l) => l.startsWith("data: ")).map((l) => JSON.parse(l.slice(6)));
}
const base = { companyId: "c1", userId: "u1", scenarioId: "s1", conversationId: "cv1", messages: [], financialContext: "", companionName: "AI", providerConfig: undefined, defaults: {}, sessionGrants: {}, writeMode: "full" };

describe("chat-stream scenario activation + seed (Plan 5)", () => {
  beforeEach(() => chatStreamMock.mockReset());

  it("scenarioActivationFrom detects create_scenario + activate_scenario results", () => {
    expect(scenarioActivationFrom("create_scenario", JSON.stringify({ success: true, scenarioId: "x", name: "N" }))).toEqual({ scenarioId: "x", name: "N" });
    expect(scenarioActivationFrom("activate_scenario", JSON.stringify({ success: true, scenarioId: "y", name: "M" }))).toEqual({ scenarioId: "y", name: "M" });
    expect(scenarioActivationFrom("show_runway", "{}" )).toBeNull();
  });

  it("emits scenario_activated when create_scenario runs in-stream (full mode)", async () => {
    chatStreamMock.mockImplementation(async function* (opts: { onToolCall: (n: string, i: unknown) => Promise<string> }) {
      await opts.onToolCall("create_scenario", { name: "Aggressive Hiring" });
      yield { type: "done" };
    });
    const events = await collect(buildChatSSEResponse(base as never));
    const ev = events.find((e) => e.type === "scenario_activated") as { scenarioId?: string; name?: string };
    expect(ev?.scenarioId).toBe("sc-new");
    expect(ev?.name).toBe("Aggressive Hiring");
  });

  it("emits seeded activatedScenarios at stream start", async () => {
    chatStreamMock.mockImplementation(async function* () { yield { type: "done" }; });
    const events = await collect(buildChatSSEResponse({ ...base, activatedScenarios: [{ scenarioId: "sc-z", name: "Z" }] } as never));
    expect(events.find((e) => e.type === "scenario_activated")).toMatchObject({ scenarioId: "sc-z", name: "Z" });
  });
});
