"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Sparkles,
  Bot,
  User,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Lightbulb,
  MessageSquarePlus,
  History,
  Wrench,
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  toolCalls?: string[];
}

interface Insight {
  type: string;
  title: string;
  summary: string;
  details: string;
  severity: "info" | "warning" | "critical";
}

interface Conversation {
  id: string;
  title: string | null;
  updatedAt: string;
}

const WELCOME_MESSAGE: Message = {
  role: "assistant",
  content:
    "Hi! I'm your AI financial companion. I can help you:\n\n" +
    "- **Build scenarios** — \"Create a best-case scenario with 30% MRR growth\"\n" +
    "- **Analyze metrics** — \"What's my runway? How's my burn rate trending?\"\n" +
    "- **Plan hiring** — \"Add 3 engineers starting next quarter\"\n" +
    "- **Compare plans** — \"Compare my base case vs. aggressive growth scenario\"\n" +
    "- **Model revenue** — \"Add a SaaS subscription stream at $49/mo\"\n" +
    "- **Explain concepts** — \"What's a good LTV:CAC ratio?\"\n\n" +
    "What would you like to work on?",
};

export default function AiCompanionPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load insights on mount
  useEffect(() => {
    fetchInsights();
  }, []);

  async function fetchInsights() {
    try {
      const res = await fetch("/api/insights", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setInsights(data.insights ?? []);
      }
    } catch {
      // Insights are non-critical
    }
  }

  async function loadConversations() {
    try {
      const res = await fetch("/api/chat/history");
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // Non-critical
    }
  }

  async function loadConversation(id: string) {
    try {
      const res = await fetch(`/api/chat/history?conversationId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(
          data.messages
            .filter((m: { role: string }) => m.role !== "system")
            .map((m: { role: string; content: string }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
        );
        setConversationId(id);
        setShowHistory(false);
      }
    } catch {
      // Non-critical
    }
  }

  function startNewConversation() {
    setMessages([WELCOME_MESSAGE]);
    setConversationId(null);
    setShowHistory(false);
    inputRef.current?.focus();
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);

    // Add streaming placeholder
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", isStreaming: true, toolCalls: [] },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          conversationId,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to connect to AI" }));
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1]!;
          updated[updated.length - 1] = {
            ...last,
            content: `Sorry, I encountered an error: ${error.error ?? "Unknown error"}. Please try again.`,
            isStreaming: false,
          };
          return updated;
        });
        setIsLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "text") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1]!;
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + event.content,
                };
                return updated;
              });
            } else if (event.type === "tool_use") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1]!;
                updated[updated.length - 1] = {
                  ...last,
                  toolCalls: [...(last.toolCalls ?? []), event.tool],
                };
                return updated;
              });
            } else if (event.type === "done") {
              if (event.conversationId) {
                setConversationId(event.conversationId);
              }
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1]!;
                updated[updated.length - 1] = {
                  ...last,
                  isStreaming: false,
                };
                return updated;
              });
              // Refresh insights after tool use
              fetchInsights();
            } else if (event.type === "error") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1]!;
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + `\n\n*Error: ${event.content}*`,
                  isStreaming: false,
                };
                return updated;
              });
            }
          } catch {
            // Ignore malformed SSE
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1]!;
        updated[updated.length - 1] = {
          ...last,
          content: "Sorry, I lost connection. Please try again.",
          isStreaming: false,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }

  const severityIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default:
        return <TrendingUp className="h-4 w-4 text-blue-500" />;
    }
  };

  const severityBorder = (severity: string) => {
    switch (severity) {
      case "critical":
        return "border-red-200 bg-red-50";
      case "warning":
        return "border-amber-200 bg-amber-50";
      default:
        return "border-blue-200 bg-blue-50";
    }
  };

  const toolLabel = (tool: string) =>
    tool
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4">
      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-surface-900 flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-brand-600" />
              AI Companion
            </h1>
            <p className="mt-1 text-sm text-surface-500">
              Your always-on financial advisor — ask anything about your financials
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowHistory(!showHistory);
                if (!showHistory) loadConversations();
              }}
              className="flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-600 hover:bg-surface-50 transition-colors"
            >
              <History className="h-4 w-4" />
              History
            </button>
            <button
              onClick={startNewConversation}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700 transition-colors"
            >
              <MessageSquarePlus className="h-4 w-4" />
              New Chat
            </button>
          </div>
        </div>

        {/* History Panel (slide-in) */}
        {showHistory && (
          <div className="mb-4 rounded-xl border border-surface-200 bg-surface-0 p-4 max-h-48 overflow-auto">
            <h3 className="text-sm font-medium text-surface-700 mb-2">Recent Conversations</h3>
            {conversations.length === 0 ? (
              <p className="text-sm text-surface-400">No conversations yet</p>
            ) : (
              <div className="space-y-1">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className="w-full text-left rounded-lg px-3 py-2 text-sm text-surface-700 hover:bg-surface-100 transition-colors"
                  >
                    {conv.title ?? "Untitled conversation"}
                    <span className="ml-2 text-xs text-surface-400">
                      {new Date(conv.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-auto space-y-4 mb-4 pr-2">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className="flex gap-3 max-w-[85%]">
                {msg.role === "assistant" && (
                  <div className="flex-shrink-0 mt-1">
                    <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-brand-600" />
                    </div>
                  </div>
                )}
                <div>
                  {/* Tool call indicators */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {msg.toolCalls.map((tool, j) => (
                        <span
                          key={j}
                          className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2.5 py-0.5 text-xs text-surface-600"
                        >
                          <Wrench className="h-3 w-3" />
                          {toolLabel(tool)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div
                    className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-brand-600 text-white"
                        : "bg-surface-0 border border-surface-200 text-surface-800"
                    }`}
                  >
                    <FormattedContent content={msg.content} />
                    {msg.isStreaming && (
                      <span className="inline-block ml-1 animate-pulse">▊</span>
                    )}
                  </div>
                </div>
                {msg.role === "user" && (
                  <div className="flex-shrink-0 mt-1">
                    <div className="h-7 w-7 rounded-full bg-surface-200 flex items-center justify-center">
                      <User className="h-4 w-4 text-surface-600" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="flex gap-3">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your financials, build a scenario, get advice..."
            disabled={isLoading}
            className="flex-1 rounded-xl border border-surface-300 bg-surface-0 px-4 py-3 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
      </div>

      {/* Insights Sidebar */}
      {insights.length > 0 && (
        <div className="w-80 flex-shrink-0 overflow-auto">
          <h2 className="text-sm font-semibold text-surface-700 mb-3 flex items-center gap-1.5">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            Insights & Alerts
          </h2>
          <div className="space-y-3">
            {insights.map((insight, i) => (
              <div
                key={i}
                className={`rounded-xl border p-3 ${severityBorder(insight.severity)}`}
              >
                <div className="flex items-start gap-2">
                  {severityIcon(insight.severity)}
                  <div>
                    <h3 className="text-sm font-medium text-surface-900">
                      {insight.title}
                    </h3>
                    <p className="mt-1 text-xs text-surface-600 leading-relaxed">
                      {insight.summary}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Simple markdown-to-JSX renderer for chat messages. */
function FormattedContent({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="font-semibold text-sm mt-3 mb-1">
          {formatInline(line.slice(4))}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="font-semibold text-base mt-3 mb-1">
          {formatInline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex gap-2 ml-2">
          <span className="text-surface-400">•</span>
          <span>{formatInline(line.slice(2))}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i}>{formatInline(line)}</p>
      );
    }
  }

  return <>{elements}</>;
}

/** Format inline markdown: **bold**, *italic*, `code`. */
function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Code
    const codeMatch = remaining.match(/`(.+?)`/);
    // Italic
    const italicMatch = remaining.match(/\*(.+?)\*/);

    // Find earliest match
    const matches = [
      boldMatch ? { type: "bold", match: boldMatch, index: boldMatch.index! } : null,
      codeMatch ? { type: "code", match: codeMatch, index: codeMatch.index! } : null,
      italicMatch && (!boldMatch || italicMatch.index! < boldMatch.index!)
        ? { type: "italic", match: italicMatch, index: italicMatch.index! }
        : null,
    ]
      .filter(Boolean)
      .sort((a, b) => a!.index - b!.index);

    const earliest = matches[0];

    if (!earliest) {
      parts.push(remaining);
      break;
    }

    // Text before match
    if (earliest.index > 0) {
      parts.push(remaining.slice(0, earliest.index));
    }

    if (earliest.type === "bold") {
      parts.push(
        <strong key={key++} className="font-semibold">
          {earliest.match![1]}
        </strong>
      );
      remaining = remaining.slice(earliest.index + earliest.match![0]!.length);
    } else if (earliest.type === "code") {
      parts.push(
        <code
          key={key++}
          className="rounded bg-surface-100 px-1.5 py-0.5 text-xs font-mono"
        >
          {earliest.match![1]}
        </code>
      );
      remaining = remaining.slice(earliest.index + earliest.match![0]!.length);
    } else if (earliest.type === "italic") {
      parts.push(
        <em key={key++}>{earliest.match![1]}</em>
      );
      remaining = remaining.slice(earliest.index + earliest.match![0]!.length);
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
