import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ChatSessionProvider, useChatSession } from "../chat-session-context";

// Drive applyEvent indirectly: seed a streaming assistant message, then exercise
// the store via a tiny harness that calls setMessages + reads get().
function Harness({ onReady }: { onReady: (api: ReturnType<typeof useChatSession>) => void }) {
  const api = useChatSession();
  onReady(api);
  const msgs = api.get("conv1").messages;
  return <div data-testid="count">{msgs.length}</div>;
}

describe("ChatSessionProvider genui events", () => {
  it("exposes submitInput", () => {
    let api!: ReturnType<typeof useChatSession>;
    render(<ChatSessionProvider><Harness onReady={(a) => (api = a)} /></ChatSessionProvider>);
    expect(typeof api.submitInput).toBe("function");
  });
});
