"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, History, MessageSquarePlus } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { ChatMessageList } from "./_components/chat-message-list";
import { ChatInput } from "./_components/chat-input";
import { ConversationSidebar } from "./_components/conversation-sidebar";
import { InsightsPanel } from "./_components/insights-panel";
import type { Message, Insight, Conversation } from "./_components/types";

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
  createdAt: Date.now(),
};

export default function AiCompanionPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { success } = useToast();

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);
  useEffect(() => { fetchInsights(); }, []);

  async function fetchInsights() {
    try {
      const res = await fetch("/api/insights", { method: "POST" });
      if (res.ok) setInsights((await res.json()).insights ?? []);
    } catch { /* non-critical */ }
  }

  async function loadConversations() {
    try {
      const res = await fetch("/api/chat/history");
      if (res.ok) setConversations(await res.json());
    } catch { /* non-critical */ }
  }

  async function loadConversation(id: string) {
    try {
      const res = await fetch(`/api/chat/history?conversationId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(
          data.messages
            .filter((m: { role: string }) => m.role !== "system")
            .map((m: { role: string; content: string; createdAt?: string }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              createdAt: m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
            }))
        );
        setConversationId(id);
        setShowHistory(false);
      }
    } catch { /* non-critical */ }
  }

  function startNewConversation() {
    setMessages([{ ...WELCOME_MESSAGE, createdAt: Date.now() }]);
    setConversationId(null);
    setShowHistory(false);
    inputRef.current?.focus();
  }

  async function handleCopy(content: string, index: number) {
    await navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    success("Copied to clipboard");
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: userMessage, createdAt: Date.now() }]);

    // Add streaming placeholder
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", isStreaming: true, toolCalls: [], createdAt: Date.now() },
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

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-7rem)] lg:h-[calc(100vh-4rem)] gap-4">
      <div className="flex flex-1 flex-col min-w-0">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-surface-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-brand-600" />
              AI Companion
            </h1>
            <p className="mt-1 text-sm text-surface-500">
              Your always-on financial advisor — ask anything about your financials
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadConversations(); }}
              className="flex items-center gap-1.5 rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-600 hover:bg-surface-50 transition-colors"
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">History</span>
            </button>
            <button
              onClick={startNewConversation}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700 transition-colors"
            >
              <MessageSquarePlus className="h-4 w-4" />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          </div>
        </div>
        {showHistory && <ConversationSidebar conversations={conversations} onLoadConversation={loadConversation} />}
        <ChatMessageList messages={messages} copiedIndex={copiedIndex} onCopy={handleCopy} messagesEndRef={messagesEndRef} />
        <ChatInput input={input} isLoading={isLoading} inputRef={inputRef} onInputChange={setInput} onSubmit={handleSend} />
      </div>
      <InsightsPanel insights={insights} />
    </div>
  );
}
