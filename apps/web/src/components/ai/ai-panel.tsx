"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { X, Send, Bot, User, Loader2, Wrench, Sparkles, Copy, Check, Pin, PinOff } from "lucide-react";
import { usePinnedInsights } from "./use-pinned-insights";
import { getPageContext } from "./page-context";
import { InlineChart } from "./inline-chart";
import { MarkdownRenderer } from "./markdown-renderer";

interface ToolResult {
  tool: string;
  data: Record<string, unknown>;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  toolCalls?: string[];
  toolResults?: ToolResult[];
}

interface AiPanelProps {
  open: boolean;
  onClose: () => void;
}

export function AiPanel({ open, onClose }: AiPanelProps) {
  const pathname = usePathname();
  const pageContext = getPageContext(pathname);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const { pin, isPinned } = usePinnedInsights();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;
    setInput("");
    setIsLoading(true);

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", isStreaming: true, toolCalls: [] },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Connection failed" }));
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1]!,
            content: `Error: ${error.error ?? "Unknown error"}`,
            isStreaming: false,
          };
          return updated;
        });
        setIsLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
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
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "text") {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1]!;
                updated[updated.length - 1] = { ...last, content: last.content + event.content };
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
            } else if (event.type === "tool_result" && event.data) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1]!;
                updated[updated.length - 1] = {
                  ...last,
                  toolResults: [...(last.toolResults ?? []), { tool: event.tool, data: event.data }],
                };
                return updated;
              });
            } else if (event.type === "done") {
              if (event.conversationId) setConversationId(event.conversationId);
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { ...updated[updated.length - 1]!, isStreaming: false };
                return updated;
              });
            }
          } catch {
            // skip malformed SSE
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1]!,
          content: "Connection lost. Please try again.",
          isStreaming: false,
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, isLoading]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  function handleCopy(content: string, idx: number) {
    navigator.clipboard.writeText(content);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 w-[480px] max-w-[90vw] bg-surface-0 border-l border-surface-200 shadow-xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-200">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-brand-100 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-brand-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-surface-900">AI Companion</h2>
              <p className="text-[10px] text-surface-400">{pageContext.pageName} context</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-6 py-4">
              {/* Welcome */}
              <div className="text-center">
                <div className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center">
                  <Bot className="h-6 w-6 text-brand-600" />
                </div>
                <p className="text-sm font-medium text-surface-900">
                  Your Virtual CFO
                </p>
                <p className="text-xs text-surface-400 mt-1">
                  I have context about your {pageContext.description}
                </p>
              </div>

              {/* Suggested Prompts */}
              <div className="space-y-2">
                <p className="text-[10px] font-medium text-surface-400 uppercase tracking-wider px-1">
                  Suggested for {pageContext.pageName}
                </p>
                {pageContext.suggestedPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(prompt)}
                    disabled={isLoading}
                    className="w-full text-left rounded-xl border border-surface-200 bg-surface-0 px-3.5 py-2.5 text-sm text-surface-700 hover:border-brand-300 hover:bg-brand-50/50 hover:text-brand-700 transition-all disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="flex gap-2 max-w-[90%]">
                {msg.role === "assistant" && (
                  <div className="flex-shrink-0 mt-1">
                    <div className="h-6 w-6 rounded-lg bg-brand-100 flex items-center justify-center">
                      <Bot className="h-3.5 w-3.5 text-brand-600" />
                    </div>
                  </div>
                )}
                <div className="group">
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {msg.toolCalls.map((tool, j) => (
                        <span key={j} className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2 py-0.5 text-[10px] text-surface-500">
                          <Wrench className="h-2.5 w-2.5" />
                          {tool.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-brand-600 text-white"
                      : "bg-surface-50 border border-surface-200 text-surface-800"
                  }`}>
                    {msg.role === "assistant" ? (
                      <MarkdownRenderer content={msg.content} />
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                    {msg.isStreaming && <span className="inline-block ml-0.5 animate-pulse">|</span>}
                    {/* Inline data visualizations */}
                    {msg.toolResults?.map((result, j) => (
                      <InlineChart key={j} result={result} />
                    ))}
                  </div>
                  {/* Copy & Pin buttons for assistant messages */}
                  {msg.role === "assistant" && !msg.isStreaming && msg.content && (
                    <div className="mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleCopy(msg.content, i)}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
                      >
                        {copiedIdx === i ? (
                          <><Check className="h-2.5 w-2.5" /> Copied</>
                        ) : (
                          <><Copy className="h-2.5 w-2.5" /> Copy</>
                        )}
                      </button>
                      <button
                        onClick={() => pin(msg.content, pageContext.pageName)}
                        disabled={isPinned(msg.content)}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-surface-400 hover:text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isPinned(msg.content) ? (
                          <><PinOff className="h-2.5 w-2.5" /> Pinned</>
                        ) : (
                          <><Pin className="h-2.5 w-2.5" /> Pin to Dashboard</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="flex-shrink-0 mt-1">
                    <div className="h-6 w-6 rounded-full bg-surface-200 flex items-center justify-center">
                      <User className="h-3.5 w-3.5 text-surface-600" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="p-4 border-t border-surface-200">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask about your ${pageContext.description}...`}
              disabled={isLoading}
              className="flex-1 rounded-xl border border-surface-200 bg-surface-0 px-3.5 py-2.5 text-sm text-surface-900 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="rounded-xl bg-brand-600 px-3 py-2.5 text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
