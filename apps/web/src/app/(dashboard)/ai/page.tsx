"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { toUserMessage } from "@/lib/api-error";
import {
  Sparkles,
  BarChart3,
  GitBranch,
  Landmark,
  TrendingUp,
  Users,
  FileText,
  PanelLeftOpen,
} from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { UpgradePrompt } from "@/components/ui/upgrade-prompt";
import { usePlanLimit } from "@/hooks/use-plan-limit";
import { ChatMessageList } from "./_components/chat-message-list";
import { ChatInput } from "./_components/chat-input";
import { InsightCard } from "./_components/insights-panel";
import { AiSidebar, type AiPane } from "./_components/ai-sidebar";
import { AiPermissionsPanel } from "./_components/ai-permissions-panel";
import type {
  Insight,
  Conversation,
  PendingPermission,
  PendingInput,
  PendingPlan,
  UiBlockClient,
} from "./_components/types";
import { useScenario } from "@/components/scenarios/scenario-context";
import { useAiFlags } from "@/components/ai/ai-feature-context";
import { useLocale } from "@/components/locale/locale-context";
import { useChatSession } from "@/components/ai/chat-session-context";

/* ─── AI Credits Configuration ────────────────────────────────────── */
// AI credits ratio: how many cents equal 1 AI credit.
// Change this value to adjust the credits display across the Companion page.
// Example: 1 means 1 cent = 1 credit (5000 cents = 5,000 credits)
//          10 means 10 cents = 1 credit (5000 cents = 500 credits)
// Credits are now provided directly by the context — no conversion needed

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
  const searchParams = useSearchParams();
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activePane, setActivePane] = useState<AiPane | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const { planLimit, clearLimit } = usePlanLimit();
  const { activeScenarioId } = useScenario();
  const { companionName, credits } = useAiFlags();
  const { fmtDate } = useLocale();
  const session = useChatSession();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const handledParamRef = useRef<string | null>(null);
  const autoloadedRef = useRef(false);
  const { success, error: toastError } = useToast();

  // The provider owns the streams; the page renders the slice for the current view.
  const { messages, isLoading } = session.get(conversationId);
  const isEmptyState = messages.length === 0;
  const awaitingDecision = messages.some(
    (m) =>
      (m.pendingPermission && !m.pendingPermission.resolved) ||
      (m.timeline?.some(
        (n) =>
          (n.kind === "diff_gate" && n.pending && !n.pending.resolved) ||
          (n.kind === "plan" && n.plan && !n.plan.resolved) ||
          (n.kind === "input" && n.input && !n.input.resolved)
      ) ??
        false)
  );

  // ?prompt= pre-fills input without sending; ?send= pre-fills and auto-submits
  useEffect(() => {
    const prompt = searchParams.get("prompt");
    const send = searchParams.get("send");
    const paramValue = send || prompt || null;
    // Guard against double-execution (React strict mode / searchParams ref change)
    if (!paramValue || handledParamRef.current === paramValue) return;
    handledParamRef.current = paramValue;

    if (send) {
      handleSend(null, send);
    } else if (prompt) {
      setInput(prompt);
      inputRef.current?.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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

  // #2: auto-load the most recent conversation on mount. Guarded so it runs once
  // and never clobbers an in-progress draft.
  useEffect(() => {
    if (autoloadedRef.current || conversationId || messages.length > 0) return;
    autoloadedRef.current = true;
    (async () => {
      const res = await apiFetch("/api/chat/history");
      if (!res.ok) return;
      const list = (await res.json()).data ?? [];
      if (list[0]?.id) loadConversation(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchInsights() {
    try {
      const res = await apiFetch("/api/insights", { method: "POST" });
      if (res.ok) setInsights((await res.json()).insights ?? []);
    } catch (e) {
      toastError(toUserMessage(e));
    }
  }

  async function loadConversations() {
    setHistoryLoading(true);
    try {
      const res = await apiFetch("/api/chat/history");
      if (res.ok) {
        const json = await res.json();
        setConversations(json.data ?? []);
      }
    } catch (e) {
      toastError(toUserMessage(e));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadConversation(id: string) {
    try {
      const res = await apiFetch(`/api/chat/history?conversationId=${id}`);
      if (res.ok) {
        const data = await res.json();
        const restoredMessages = data.messages
          .filter((m: { role: string }) => m.role !== "system")
          .map(
            (m: {
              role: string;
              content: string;
              createdAt?: string;
              uiBlocks?: UiBlockClient[];
              timeline?: unknown[];
            }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              createdAt: m.createdAt
                ? new Date(m.createdAt).getTime()
                : Date.now(),
              // Re-render persisted genui display blocks after reload (spec §6/§8).
              ...(m.uiBlocks ? { uiBlocks: m.uiBlocks } : {}),
              ...(m.timeline ? { timeline: m.timeline } : {}),
            })
          );
        // #3: re-show a pending gate persisted server-side, attached in-stream to
        // the last assistant message's timeline (so it renders as a gate node).
        const attachGate = (node: {
          id: string;
          kind: "diff_gate" | "input" | "plan";
          pending?: PendingPermission;
          input?: PendingInput;
          plan?: PendingPlan;
        }) => {
          const msgs = [...restoredMessages];
          let lastIdx = msgs.length - 1;
          if (lastIdx < 0 || msgs[lastIdx].role !== "assistant") {
            msgs.push({ role: "assistant", content: "", createdAt: Date.now(), timeline: [] });
            lastIdx = msgs.length - 1;
          }
          const tl = [...(msgs[lastIdx].timeline ?? []), node];
          msgs[lastIdx] = { ...msgs[lastIdx], timeline: tl };
          session.setMessages(id, msgs);
        };
        if (data.pendingTimeline && Array.isArray(data.pendingTimeline) && data.pendingTimeline.length) {
          // Full-run reload (Plan 5): the lead-up + live gate nodes persisted at
          // pause-time. The gate node carries its own (unresolved) payload, so it
          // renders live + actionable; this also restores the pre-pause worklog.
          const msgs = [...restoredMessages];
          let lastIdx = msgs.length - 1;
          if (lastIdx < 0 || msgs[lastIdx].role !== "assistant") {
            msgs.push({ role: "assistant", content: "", createdAt: Date.now(), timeline: [] });
            lastIdx = msgs.length - 1;
          }
          msgs[lastIdx] = { ...msgs[lastIdx], timeline: data.pendingTimeline };
          session.setMessages(id, msgs);
        } else if (data.pendingPermission) {
          const p = data.pendingPermission as PendingPermission;
          attachGate({ id: p.pauseId, kind: "diff_gate", pending: p });
        } else if (data.pendingInput) {
          const p = data.pendingInput as PendingInput;
          attachGate({ id: p.pauseId, kind: "input", input: p });
        } else if (data.pendingPlan) {
          const p = data.pendingPlan as PendingPlan;
          attachGate({ id: p.pauseId, kind: "plan", plan: p });
        } else {
          session.setMessages(id, restoredMessages);
        }
        setConversationId(id);
        setActivePane(null);
        setMobileNavOpen(false);
      }
    } catch (e) {
      toastError(toUserMessage(e));
    }
  }

  function startNewConversation() {
    session.setMessages(null, []);
    setConversationId(null);
    setActivePane(null);
    setMobileNavOpen(false);
    inputRef.current?.focus();
  }

  async function handleCopy(content: string, index: number) {
    await navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    success("Copied to clipboard");
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  /* Send a message — can be called from form submit or template click.
     The provider owns the stream so the turn survives navigation. */
  async function handleSend(
    e: React.FormEvent | null,
    overrideMessage?: string
  ) {
    e?.preventDefault();

    const userMessage = overrideMessage ?? input.trim();
    if (!userMessage || isLoading) return;

    setInput("");
    clearLimit();

    await session.send(conversationId, userMessage, activeScenarioId, (id) => {
      // Thread the server-assigned id so follow-ups + the rendered view track it.
      setConversationId((cur) => cur ?? id);
    });
    fetchInsights();
  }

  const handlePermissionDecision = useCallback(
    async (
      pending: PendingPermission,
      decisions: { requestId: string; decision: "once" | "session" | "deny" }[]
    ) => {
      await session.decide(pending.conversationId, pending, decisions);
      fetchInsights();
    },
    [session]
  );

  function handleTemplateClick(prompt: string) {
    setInput(prompt);
    inputRef.current?.focus();
  }

  function selectPane(pane: AiPane) {
    setActivePane((cur) => (cur === pane ? null : pane));
    if (pane === "history") loadConversations();
    setMobileNavOpen(false);
  }

  const paneContent =
    activePane === "history" ? (
      <HistoryPaneContent
        conversations={conversations}
        loading={historyLoading}
        onLoad={loadConversation}
        fmtDate={fmtDate}
      />
    ) : activePane === "insights" ? (
      <div className="p-3 space-y-3">
        {insights.length === 0 ? (
          <p className="text-sm text-surface-400 px-1">No insights yet</p>
        ) : (
          insights.map((ins, i) => <InsightCard key={i} insight={ins} />)
        )}
      </div>
    ) : activePane === "settings" ? (
      <AiPermissionsPanel conversationId={conversationId} />
    ) : null;

  return (
    <div className="flex flex-col lg:flex-row h-full">
      <div className="flex flex-1 flex-col min-w-0 lg:mr-4">
        {/* ─── Page Header ─────────────────────────────────────── */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-surface-900 flex items-center gap-2">
              <div className="relative">
                <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-accent-600" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white" />
              </div>
              {companionName}
            </h1>
            <p className="mt-1 text-sm text-surface-500">
              Your personal CFO that understands your numbers
            </p>
          </div>
          {/* Mobile: hamburger opens the AI sidebar drawer */}
          <button
            onClick={() => setMobileNavOpen(true)}
            className="lg:hidden flex items-center justify-center h-9 w-9 rounded-lg border border-surface-300 text-surface-600"
            aria-label="Open AI menu"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>

        {/* ─── Empty State / Template Cards ─────────────────── */}
        {isEmptyState ? (
          <div className="flex-1 overflow-auto flex flex-col items-center justify-center px-4 py-8">
            <div className="w-full max-w-2xl">
              {/* Greeting */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-accent-500 to-accent-700 mb-4 shadow-lg shadow-accent-500/20">
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
                isLoading={isLoading || awaitingDecision}
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
              companionName={companionName}
              onActionPrompt={(prompt) => handleSend(null, prompt)}
              onInputSubmit={(pending, data) =>
                session.submitInput(pending.conversationId, pending, data)
              }
              onPlanSubmit={(pending, plan) => session.submitPlan(pending.conversationId, pending, plan)}
              onDecide={(pending, decisions) => handlePermissionDecision(pending, decisions)}
            />
            {planLimit && (
              <div className="mx-4 mb-3">
                <UpgradePrompt limit={planLimit} dismissable onDismiss={clearLimit} />
              </div>
            )}
            <ChatInput
              input={input}
              isLoading={isLoading || !!planLimit || awaitingDecision}
              inputRef={inputRef}
              onInputChange={setInput}
              onSubmit={(e) => handleSend(e)}
            />
          </>
        )}
      </div>
      <AiSidebar
        credits={credits}
        companionName={companionName}
        activePane={activePane}
        onSelectPane={selectPane}
        onNewChat={startNewConversation}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      >
        {paneContent}
      </AiSidebar>
    </div>
  );
}

function HistoryPaneContent({
  conversations,
  loading,
  onLoad,
  fmtDate,
}: {
  conversations: Conversation[];
  loading: boolean;
  onLoad: (id: string) => void;
  fmtDate: (date: Date | string, options?: Intl.DateTimeFormatOptions) => string;
}) {
  return (
    <div className="p-3">
      {loading ? (
        <div className="flex items-center gap-2 px-1 py-3 text-sm text-surface-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-surface-300 border-t-brand-500" />
          Loading conversations...
        </div>
      ) : conversations.length === 0 ? (
        <p className="text-sm text-surface-400 px-1">No conversations yet</p>
      ) : (
        <div className="space-y-1">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onLoad(conv.id)}
              className="w-full text-left rounded-lg px-3 py-2 text-sm text-surface-700 hover:bg-surface-100 transition-colors"
            >
              {conv.title ?? "Untitled conversation"}
              <span className="ml-2 text-xs text-surface-400">
                {fmtDate(conv.updatedAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
