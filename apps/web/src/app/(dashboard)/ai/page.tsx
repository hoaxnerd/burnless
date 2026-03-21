"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Sparkles,
  History,
  MessageSquarePlus,
  BarChart3,
  GitBranch,
  Landmark,
  TrendingUp,
  Users,
  FileText,
  Zap,
  Wifi,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { ChatMessageList } from "./_components/chat-message-list";
import { ChatInput } from "./_components/chat-input";
import { ConversationSidebar } from "./_components/conversation-sidebar";
import { InsightsPanel } from "./_components/insights-panel";
import type { Message, Insight, Conversation } from "./_components/types";

/* ─── Quick-Start Template Definitions ─────────────────────────────── */

interface QuickTemplate {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  prompt: string;
}

const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    icon: <BarChart3 className="h-5 w-5 text-indigo-600" />,
    iconBg: "bg-indigo-100",
    title: "Monthly Briefing",
    description: "Get a full financial summary with cash, burn, and runway",
    prompt:
      "Give me a complete financial briefing for this month. Include cash position, burn rate, runway, revenue trends, and any concerns.",
  },
  {
    icon: <GitBranch className="h-5 w-5 text-violet-600" />,
    iconBg: "bg-violet-100",
    title: "Scenario Builder",
    description: "Model any what-if scenario for hiring, costs, or growth",
    prompt:
      "Help me model a scenario. What decision are you considering? (e.g., hiring, fundraising, cost changes)",
  },
  {
    icon: <Landmark className="h-5 w-5 text-emerald-600" />,
    iconBg: "bg-emerald-100",
    title: "Funding Analysis",
    description: "When to raise, how much, and optimal valuation range",
    prompt:
      "Analyze my funding situation. When should I start fundraising? How much should I raise? What's my optimal valuation range?",
  },
  {
    icon: <TrendingUp className="h-5 w-5 text-sky-600" />,
    iconBg: "bg-sky-100",
    title: "Revenue Forecast",
    description: "Project revenue growth with best, expected, and conservative cases",
    prompt:
      "Project my revenue for the next 12 months. Include best case, expected, and conservative estimates.",
  },
  {
    icon: <Users className="h-5 w-5 text-amber-600" />,
    iconBg: "bg-amber-100",
    title: "Hiring Impact",
    description: "See how adding team members affects burn rate and runway",
    prompt:
      "I'm thinking about hiring. Show me how adding new team members would impact my burn rate and runway.",
  },
  {
    icon: <FileText className="h-5 w-5 text-rose-600" />,
    iconBg: "bg-rose-100",
    title: "Board Prep",
    description: "Generate board deck narratives from your latest financials",
    prompt:
      "Generate a board meeting narrative based on my latest financials. Include key metrics, trends, and talking points.",
  },
];

/* ─── Page Component ───────────────────────────────────────────────── */

export default function AiCompanionPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
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

  const isEmptyState = messages.length === 0;

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);
  useEffect(() => {
    fetchInsights();
  }, []);

  async function fetchInsights() {
    try {
      const res = await fetch("/api/insights", { method: "POST" });
      if (res.ok) setInsights((await res.json()).insights ?? []);
    } catch {
      /* non-critical */
    }
  }

  async function loadConversations() {
    try {
      const res = await fetch("/api/chat/history");
      if (res.ok) setConversations(await res.json());
    } catch {
      /* non-critical */
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
            .map(
              (m: { role: string; content: string; createdAt?: string }) => ({
                role: m.role as "user" | "assistant",
                content: m.content,
                createdAt: m.createdAt
                  ? new Date(m.createdAt).getTime()
                  : Date.now(),
              })
            )
        );
        setConversationId(id);
        setShowHistory(false);
      }
    } catch {
      /* non-critical */
    }
  }

  function startNewConversation() {
    setMessages([]);
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

  /* Send a message — can be called from form submit or template click */
  async function handleSend(
    e: React.FormEvent | null,
    overrideMessage?: string
  ) {
    e?.preventDefault();

    const userMessage = overrideMessage ?? input.trim();
    if (!userMessage || isLoading) return;

    setInput("");
    setIsLoading(true);

    // Add user message
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage, createdAt: Date.now() },
    ]);

    // Add streaming placeholder
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "",
        isStreaming: true,
        toolCalls: [],
        createdAt: Date.now(),
      },
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
        const error = await res
          .json()
          .catch(() => ({ error: "Failed to connect to AI" }));
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

  function handleTemplateClick(prompt: string) {
    handleSend(null, prompt);
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-7rem)] lg:h-[calc(100vh-4rem)] gap-4">
      <div className="flex flex-1 flex-col min-w-0">
        {/* ─── Page Header ─────────────────────────────────────── */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-surface-900 flex items-center gap-2">
              <div className="relative">
                <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-brand-600" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white" />
              </div>
              AI Financial Companion
            </h1>
            <p className="mt-1 text-sm text-surface-500">
              Your personal CFO that understands your numbers
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Status badges */}
            <div className="hidden sm:flex items-center gap-3 mr-2 text-xs text-surface-400">
              <span className="inline-flex items-center gap-1">
                <Wifi className="h-3 w-3 text-emerald-500" />
                Online
              </span>
              <span className="inline-flex items-center gap-1">
                <Zap className="h-3 w-3 text-brand-500" />
                Claude
              </span>
            </div>
            <button
              onClick={() => {
                setShowHistory(!showHistory);
                if (!showHistory) loadConversations();
              }}
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

        {showHistory && (
          <ConversationSidebar
            conversations={conversations}
            onLoadConversation={loadConversation}
          />
        )}

        {/* ─── Empty State / Template Cards ─────────────────── */}
        {isEmptyState ? (
          <div className="flex-1 overflow-auto flex flex-col items-center justify-center px-4 py-8">
            <div className="w-full max-w-2xl">
              {/* Greeting */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 mb-4 shadow-lg shadow-brand-500/20">
                  <Sparkles className="h-7 w-7 text-white" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-surface-900">
                  What can I help you with today?
                </h2>
                <p className="mt-2 text-sm text-surface-500 max-w-md mx-auto">
                  Choose a template to get started, or ask anything about your
                  financials below.
                </p>
              </div>

              {/* Template Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
                {QUICK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.title}
                    onClick={() => handleTemplateClick(tpl.prompt)}
                    disabled={isLoading}
                    className="group relative text-left rounded-xl border border-surface-200 bg-surface-0 p-4 transition-all duration-200 hover:shadow-md hover:shadow-brand-500/5 hover:-translate-y-0.5 hover:border-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {/* Icon */}
                    <div
                      className={`inline-flex items-center justify-center h-9 w-9 rounded-lg ${tpl.iconBg} mb-3 transition-transform duration-200 group-hover:scale-110`}
                    >
                      {tpl.icon}
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-semibold text-surface-900 mb-1">
                      {tpl.title}
                    </h3>

                    {/* Description */}
                    <p className="text-xs text-surface-500 leading-relaxed line-clamp-2">
                      {tpl.description}
                    </p>

                    {/* Hover arrow hint */}
                    <span className="absolute top-4 right-4 text-surface-300 transition-all duration-200 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0">
                      &rarr;
                    </span>
                  </button>
                ))}
              </div>

              {/* Separator */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-surface-200" />
                <span className="text-xs text-surface-400">
                  Or ask anything about your financials
                </span>
                <div className="flex-1 h-px bg-surface-200" />
              </div>

              {/* Chat input in empty state */}
              <ChatInput
                input={input}
                isLoading={isLoading}
                inputRef={inputRef}
                onInputChange={setInput}
                onSubmit={(e) => handleSend(e)}
              />
            </div>
          </div>
        ) : (
          <>
            <ChatMessageList
              messages={messages}
              copiedIndex={copiedIndex}
              onCopy={handleCopy}
              messagesEndRef={messagesEndRef}
              isLoading={isLoading}
            />
            <ChatInput
              input={input}
              isLoading={isLoading}
              inputRef={inputRef}
              onInputChange={setInput}
              onSubmit={(e) => handleSend(e)}
            />
          </>
        )}
      </div>
      <InsightsPanel insights={insights} />
    </div>
  );
}
