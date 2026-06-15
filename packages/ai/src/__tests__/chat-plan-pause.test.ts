import { describe, it, expect, vi, beforeEach } from "vitest";
import { chatStream } from "../chat";
import type { PlanRequestState } from "../generative-ui";

const streamMock = vi.fn();
vi.mock("../providers", async (orig) => {
  const actual = await orig<typeof import("../providers")>();
  return {
    ...actual,
    getProvider: () => ({ complete: vi.fn(), stream: streamMock }),
    createProvider: () => ({ complete: vi.fn(), stream: streamMock }),
  };
});
vi.mock("../routing", () => ({ getProviderForFeature: () => null, resolveResilientProvider: () => ({ complete: vi.fn(), stream: streamMock }) }));

function fakeStream(blocks: unknown[], stopReason: string) {
  return (async function* () {
    yield { type: "done", response: { content: blocks, stopReason } };
  })();
}

beforeEach(() => streamMock.mockReset());

describe("chatStream plan pause", () => {
  it("pauses and persists when the model calls propose_plan", async () => {
    streamMock.mockReturnValueOnce(
      fakeStream(
        [{ type: "tool_use", id: "tu-p", name: "propose_plan", input: { title: "Model hire", steps: [{ kind: "tool", title: "Add hire", toolName: "create_headcount" }] } }],
        "tool_use"
      )
    );
    let captured: PlanRequestState | null = null;
    const onPlanRequest = vi.fn(async (s: PlanRequestState) => {
      captured = s;
      return "pause-plan";
    });

    const chunks: { type: string; pauseId?: string; plan?: { title: string } }[] = [];
    for await (const c of chatStream({
      messages: [{ role: "user", content: "model a hire" }],
      financialContext: "ctx",
      onToolCall: vi.fn(),
      onPlanRequest,
    })) {
      chunks.push(c as never);
    }

    expect(onPlanRequest).toHaveBeenCalledOnce();
    expect(captured!.planToolUseId).toBe("tu-p");
    expect(captured!.spec.title).toBe("Model hire");
    const types = chunks.map((c) => c.type);
    expect(types).toContain("plan_request");
    expect(types).toContain("paused");
    expect(types).not.toContain("done");
    expect(chunks.find((c) => c.type === "plan_request")?.pauseId).toBe("pause-plan");
    expect(chunks.find((c) => c.type === "plan_request")?.plan?.title).toBe("Model hire");
  });

  it("plan takes precedence: same-turn write + input tools are deferred", async () => {
    streamMock.mockReturnValueOnce(
      fakeStream(
        [
          { type: "tool_use", id: "tu-w", name: "create_scenario", input: { name: "X" } },
          { type: "tool_use", id: "tu-i", name: "request_input_form", input: { title: "Q", fields: [] } },
          { type: "tool_use", id: "tu-p", name: "propose_plan", input: { title: "P", steps: [] } },
        ],
        "tool_use"
      )
    );
    let captured: PlanRequestState | null = null;
    for await (const _ of chatStream({
      messages: [{ role: "user", content: "go" }],
      financialContext: "ctx",
      onToolCall: vi.fn(),
      resolvePermission: () => "ask",
      onInputRequest: async () => "pi",
      onPlanRequest: async (s) => { captured = s; return "pp"; },
    })) { /* drain */ }

    expect(captured!.planToolUseId).toBe("tu-p");
    const ids = (captured!.completedResults as { toolUseId: string }[]).map((r) => r.toolUseId).sort();
    expect(ids).toEqual(["tu-i", "tu-w"]);
  });
});
