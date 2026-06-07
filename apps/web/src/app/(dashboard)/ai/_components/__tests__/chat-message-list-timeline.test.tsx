// apps/web/src/app/(dashboard)/ai/_components/__tests__/chat-message-list-timeline.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatMessageList } from "../chat-message-list";
import type { Message } from "../types";
import { createRef } from "react";

const messages: Message[] = [
  { role: "user", content: "Add a stream", createdAt: Date.now() },
  { role: "assistant", content: "", createdAt: Date.now(), timeline: [
    { id: "t1", kind: "tool", toolName: "create_revenue_stream", phase: "done" },
    { id: "r1", kind: "result", text: "Created the stream." },
  ] },
];

describe("ChatMessageList timeline render", () => {
  it("renders the assistant turn as a timeline, no bot avatar/badge", () => {
    render(<ChatMessageList messages={messages} copiedIndex={null} onCopy={vi.fn()} messagesEndRef={createRef()} />);
    expect(screen.getByText(/Created the stream/i)).toBeTruthy();
    expect(screen.getByText(/create revenue stream/i)).toBeTruthy();
    // No companion badge text from the old first-assistant chip
    expect(screen.queryByText(/Financial Companion/i)).toBeNull();
  });
});
