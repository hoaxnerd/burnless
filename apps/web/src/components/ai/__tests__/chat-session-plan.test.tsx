import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ChatSessionProvider, useChatSession } from "../chat-session-context";

function Harness({ onReady }: { onReady: (api: ReturnType<typeof useChatSession>) => void }) {
  onReady(useChatSession());
  return null;
}

describe("ChatSessionProvider plan support", () => {
  it("exposes submitPlan", () => {
    let api!: ReturnType<typeof useChatSession>;
    render(<ChatSessionProvider><Harness onReady={(a) => (api = a)} /></ChatSessionProvider>);
    expect(typeof api.submitPlan).toBe("function");
  });
});
