import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { ChatSessionProvider, useChatSession } from "../chat-session-context";

function Harness({ onReady }: { onReady: (api: ReturnType<typeof useChatSession>) => void }) {
  onReady(useChatSession());
  return null;
}

// ── plan_request SSE mapping test ─────────────────────────────────────────────
// Hoisted mock so that the module graph resolves before any import runs.
// The mock returns a Response whose ReadableStream emits two SSE frames:
//   1. conversation_id  (establishes the session key)
//   2. plan_request     (carries `plan:` NOT `spec:` — this is the line under test)
function sseResponse(frames: unknown[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const f of frames) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

vi.mock("@/lib/api-fetch", () => ({
  apiFetch: vi.fn(async () =>
    sseResponse([
      { type: "conversation_id", conversationId: "conv-plan-1" },
      {
        type: "plan_request",
        pauseId: "p1",
        conversationId: "conv-plan-1",
        // NOTE: the field is `plan`, NOT `spec`.  applyEvent line 83 maps ev.plan → spec.
        plan: { title: "Model hire", steps: [{ id: "s1", kind: "tool", title: "Add hire" }] },
      },
    ])
  ),
}));

describe("ChatSessionProvider plan support", () => {
  it("exposes submitPlan", () => {
    let api!: ReturnType<typeof useChatSession>;
    render(<ChatSessionProvider><Harness onReady={(a) => (api = a)} /></ChatSessionProvider>);
    expect(typeof api.submitPlan).toBe("function");
  });

  it("routes a plan_request SSE event into pendingPlan.spec (maps ev.plan -> spec)", async () => {
    let api!: ReturnType<typeof useChatSession>;
    render(
      <ChatSessionProvider>
        <Harness onReady={(a) => (api = a)} />
      </ChatSessionProvider>
    );

    await act(async () => {
      await api.send("conv-plan-1", "model a hire", null);
    });

    const msgs = api.get("conv-plan-1").messages;
    const last = msgs[msgs.length - 1]!;

    // The assistant message must have a pendingPlan populated from the SSE frame.
    expect(last.pendingPlan).toBeTruthy();
    // spec must come from ev.plan (not ev.spec — which would be undefined and crash the card).
    expect(last.pendingPlan!.spec.title).toBe("Model hire");
    expect(last.pendingPlan!.spec.steps).toHaveLength(1);
    expect(last.pendingPlan!.spec.steps[0]!.id).toBe("s1");
    // pauseId and conversationId must also be threaded through.
    expect(last.pendingPlan!.pauseId).toBe("p1");
    expect(last.pendingPlan!.conversationId).toBe("conv-plan-1");
  });
});
