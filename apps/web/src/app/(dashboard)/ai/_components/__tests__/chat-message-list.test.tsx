import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatMessageList } from "../chat-message-list";
import type { Message } from "../types";

vi.mock("@/components/ai/markdown-renderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <span>{content}</span>,
}));

const makeMessage = (
  role: "user" | "assistant",
  content: string,
  overrides: Partial<Message> = {}
): Message => ({
  role,
  content,
  createdAt: Date.now(),
  ...overrides,
});

describe("ChatMessageList", () => {
  const defaultProps = {
    messages: [] as Message[],
    copiedIndex: null,
    onCopy: vi.fn(),
    messagesEndRef: { current: null },
    isLoading: false,
  };

  it("renders empty state", () => {
    const { container } = render(<ChatMessageList {...defaultProps} />);
    // Should render container but no message elements
    expect(container.querySelector(".flex-1")).toBeInTheDocument();
  });

  it("renders user message", () => {
    render(
      <ChatMessageList
        {...defaultProps}
        messages={[makeMessage("user", "What is my burn rate?")]}
      />
    );
    expect(screen.getByText("What is my burn rate?")).toBeInTheDocument();
  });

  it("renders assistant message", () => {
    render(
      <ChatMessageList
        {...defaultProps}
        messages={[makeMessage("assistant", "Your burn rate is $50k/mo")]}
      />
    );
    expect(screen.getByText("Your burn rate is $50k/mo")).toBeInTheDocument();
  });

  it("shows typing indicator when streaming with empty content", () => {
    render(
      <ChatMessageList
        {...defaultProps}
        messages={[
          makeMessage("assistant", "", { isStreaming: true }),
        ]}
      />
    );
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  it("shows copy button for assistant messages", () => {
    render(
      <ChatMessageList
        {...defaultProps}
        messages={[makeMessage("assistant", "Some response")]}
      />
    );
    expect(screen.getByLabelText("Copy message")).toBeInTheDocument();
  });

  it("does not show copy button for user messages", () => {
    render(
      <ChatMessageList
        {...defaultProps}
        messages={[makeMessage("user", "My question")]}
      />
    );
    expect(screen.queryByLabelText("Copy message")).not.toBeInTheDocument();
  });

  it("does not show copy button for streaming messages", () => {
    render(
      <ChatMessageList
        {...defaultProps}
        messages={[makeMessage("assistant", "Streaming...", { isStreaming: true })]}
      />
    );
    expect(screen.queryByLabelText("Copy message")).not.toBeInTheDocument();
  });

  it("calls onCopy when copy button clicked", async () => {
    const onCopy = vi.fn();
    render(
      <ChatMessageList
        {...defaultProps}
        onCopy={onCopy}
        messages={[makeMessage("assistant", "Copy me")]}
      />
    );
    await userEvent.click(screen.getByLabelText("Copy message"));
    expect(onCopy).toHaveBeenCalledWith("Copy me", 0);
  });

  it("shows 'Copied' state when copiedIndex matches", () => {
    render(
      <ChatMessageList
        {...defaultProps}
        copiedIndex={0}
        messages={[makeMessage("assistant", "Copied content")]}
      />
    );
    expect(screen.getByText("Copied")).toBeInTheDocument();
  });

  it("renders tool nodes from the timeline", () => {
    render(
      <ChatMessageList
        {...defaultProps}
        messages={[
          makeMessage("assistant", "Here are results", {
            timeline: [{ id: "t1", kind: "tool", toolName: "suggest_cost_cuts", phase: "done" }],
          }),
        ]}
      />
    );
    expect(screen.getByText(/suggest cost cuts/i)).toBeInTheDocument();
  });

  it("shows thinking indicator when isLoading and last message is not streaming", () => {
    render(
      <ChatMessageList
        {...defaultProps}
        isLoading={true}
        messages={[makeMessage("user", "Query")]}
      />
    );
    expect(screen.getByText("Working…")).toBeInTheDocument();
  });

  it("renders multiple messages in order", () => {
    render(
      <ChatMessageList
        {...defaultProps}
        messages={[
          makeMessage("user", "First"),
          makeMessage("assistant", "Second"),
          makeMessage("user", "Third"),
        ]}
      />
    );
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
  });

  // ── AI-08: timestamp rendering ───────────────────────────────────────────
  describe("timestamp (AI-08)", () => {
    it("renders 'just now' for a fresh assistant message", () => {
      render(
        <ChatMessageList
          {...defaultProps}
          messages={[makeMessage("assistant", "Fresh", { createdAt: Date.now() })]}
        />
      );
      expect(screen.getByText("just now")).toBeInTheDocument();
    });

    it("renders an absolute date (not 'just now') for a days-old restored turn", () => {
      const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
      render(
        <ChatMessageList
          {...defaultProps}
          messages={[makeMessage("assistant", "Old turn", { createdAt: tenDaysAgo })]}
        />
      );
      expect(screen.queryByText("just now")).not.toBeInTheDocument();
      expect(screen.queryByText(/d ago/)).not.toBeInTheDocument();
      // Absolute date via the centralized formatter default (short month/day/year).
      const expected = new Date(tenDaysAgo).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      expect(screen.getByText(expected)).toBeInTheDocument();
    });

    it("renders 'earlier' (no 'just now') when createdAt is missing", () => {
      render(
        <ChatMessageList
          {...defaultProps}
          messages={[makeMessage("assistant", "No timestamp", { createdAt: null })]}
        />
      );
      expect(screen.queryByText("just now")).not.toBeInTheDocument();
      expect(screen.getByText("earlier")).toBeInTheDocument();
    });
  });
});
