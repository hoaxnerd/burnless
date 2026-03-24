"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Sparkles,
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  Loader2,
  X,
} from "lucide-react";
import { AiGate } from "@/components/ai/ai-gate";
import { MarkdownRenderer } from "@/components/ai/markdown-renderer";
import {
  type AiCommandCenterProps,
  type AlertData,
  generateInsights,
  getPlaceholder,
  quickActions,
  severityStyles,
} from "./ai-command-center-config";

/* ── Component ─────────────────────────────────────────────────────────────── */

export type { AiCommandCenterProps } from "./ai-command-center-config";

export function AiCommandCenter({
  runway,
  burnRate,
  mrr,
  mrrGrowth,
  cash,
}: AiCommandCenterProps) {
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [response, setResponse] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch anomaly alerts
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/alerts", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.alerts) {
          setAlerts(
            data.alerts.filter(
              (a: AlertData) => a.severity === "critical" || a.severity === "warning",
            ),
          );
        }
      })
      .catch(() => {})
      .finally(() => setAlertsLoaded(true));
    return () => controller.abort();
  }, []);

  const insights = generateInsights(runway, burnRate, mrr, mrrGrowth, cash);
  const placeholder = getPlaceholder(runway, mrr, burnRate);

  const handleSubmit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || isStreaming) return;

    setIsStreaming(true);
    setResponse("");
    setError(null);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          conversationId,
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "AI request failed" }));
        setError(err.error || `Error: ${res.status}`);
        setIsStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError("No response stream");
        setIsStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "text" && event.content) {
              setResponse((prev) => prev + event.content);
            } else if (event.type === "done" && event.conversationId) {
              setConversationId(event.conversationId);
            } else if (event.type === "error") {
              setError(event.content);
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled — not an error
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [query, isStreaming, conversationId]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const handleClear = useCallback(() => {
    setResponse("");
    setError(null);
    setQuery("");
    setConversationId(null);
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  // Auto-scroll response area as content streams in
  useEffect(() => {
    if (responseRef.current && isStreaming) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [response, isStreaming]);

  const hasResponse = response.length > 0 || error;

  return (
    <AiGate feature="insights" hideWhenOff>
      <div className="relative mb-6 animate-slide-up">
        {/* Gradient border wrapper */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-accent-500/20 via-accent-400/20 to-accent-500/10 pointer-events-none" />

        {/* Main card */}
        <div className="relative rounded-2xl bg-surface-0 overflow-hidden">
          {/* Ambient glow */}
          <div
            className="absolute inset-0 bg-gradient-to-br from-accent-500/[0.03] via-transparent to-accent-400/[0.03] pointer-events-none"
            style={{ animation: "ambientBreath 6s ease-in-out infinite" }}
          />

          <div className="relative p-5 sm:p-6">
            {/* Header */}
            <div className="flex items-center gap-2.5 mb-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-accent-500 to-accent-400 opacity-20 blur-sm" />
                <div className="relative rounded-xl bg-gradient-to-br from-accent-500/10 to-accent-400/10 p-2">
                  <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-accent-500" />
                </div>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-surface-900">
                  AI Financial Companion
                </h2>
                <p className="text-[10px] text-surface-400 mt-0.5">
                  Powered by your live data
                </p>
              </div>
            </div>

            {/* Always-visible AI Input */}
            <div className="relative mb-4">
              <div className={`flex items-center gap-2 rounded-xl border bg-surface-50/80 px-4 py-3 transition-all duration-200 ${
                isStreaming
                  ? "border-accent-500/40 ring-2 ring-accent-500/10"
                  : "border-surface-200 focus-within:border-accent-500/40 focus-within:ring-2 focus-within:ring-accent-500/10"
              }`}>
                <Sparkles className="h-4 w-4 text-accent-400 shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  disabled={isStreaming}
                  className="flex-1 bg-transparent text-sm text-surface-900 placeholder:text-surface-400 outline-none disabled:opacity-60"
                />
                {isStreaming ? (
                  <button
                    onClick={handleCancel}
                    className="shrink-0 rounded-lg bg-surface-200 p-1.5 text-surface-500 hover:bg-surface-300 transition-colors"
                    aria-label="Stop generating"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    disabled={!query.trim()}
                    className="shrink-0 rounded-lg bg-accent-500 p-1.5 text-white hover:bg-accent-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Send"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Inline Response Area */}
            {(hasResponse || isStreaming) && (
              <div className="mb-4 animate-slide-up">
                <div
                  ref={responseRef}
                  className="rounded-xl bg-surface-50/80 border border-surface-100 p-4 max-h-64 overflow-y-auto"
                >
                  {error ? (
                    <p className="text-sm text-red-500">{error}</p>
                  ) : response ? (
                    <div className="text-sm text-surface-700 leading-relaxed">
                      <MarkdownRenderer content={response} />
                    </div>
                  ) : isStreaming ? (
                    <div className="flex items-center gap-2 text-sm text-surface-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Thinking...</span>
                    </div>
                  ) : null}

                  {/* Streaming indicator */}
                  {isStreaming && response && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <div className="flex gap-0.5">
                        <span className="h-1 w-1 rounded-full bg-accent-400 animate-pulse" />
                        <span className="h-1 w-1 rounded-full bg-accent-400 animate-pulse" style={{ animationDelay: "0.15s" }} />
                        <span className="h-1 w-1 rounded-full bg-accent-400 animate-pulse" style={{ animationDelay: "0.3s" }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Clear / Continue actions */}
                {!isStreaming && response && (
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <button
                      onClick={handleClear}
                      className="text-xs text-surface-400 hover:text-surface-600 transition-colors"
                    >
                      Clear
                    </button>
                    <Link
                      href={conversationId ? `/ai?conversationId=${conversationId}` : "/ai"}
                      className="text-xs font-medium text-accent-500 hover:text-accent-600 transition-colors"
                    >
                      Continue in chat &rarr;
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* AI Insights (shown when no active response) */}
            {!hasResponse && !isStreaming && (
              <div className="mb-5 space-y-2">
                {insights.map((insight, i) => {
                  const InsightIcon = insight.icon;
                  const styles = severityStyles[insight.severity];

                  return (
                    <div
                      key={i}
                      className={`rounded-xl border ${styles.border} ${styles.bg} p-3.5`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`rounded-lg p-1.5 ${styles.iconBg} mt-0.5`}>
                          <InsightIcon className={`h-3.5 w-3.5 ${styles.iconColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-surface-900">
                            {insight.title}
                          </p>
                          <p className="text-xs text-surface-500 mt-0.5 leading-relaxed">
                            {insight.message}
                          </p>
                        </div>
                        <div className={`h-2 w-2 rounded-full mt-1.5 ${styles.dot}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link key={action.id} href={action.href}>
                    <div
                      className={`group relative rounded-xl border border-surface-200 bg-surface-0 p-4 transition-all duration-300 hover:border-surface-300 hover:-translate-y-0.5 hover:shadow-lg ${action.glowColor} cursor-pointer`}
                    >
                      <div
                        className={`inline-flex rounded-lg bg-gradient-to-br ${action.gradientFrom} ${action.gradientTo} p-2 mb-3`}
                      >
                        <Icon className="h-4 w-4 text-white" />
                      </div>

                      <h3 className="text-sm font-semibold text-surface-900 mb-0.5">
                        {action.title}
                      </h3>
                      <p className="text-xs text-surface-400 leading-relaxed">
                        {action.description}
                      </p>

                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <ArrowRight className="h-3.5 w-3.5 text-surface-300" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Anomaly Alert Row */}
            {alertsLoaded && alerts.length > 0 && (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-warning-500/20 bg-warning-50/50 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="rounded-lg bg-warning-500/10 p-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-warning-500" />
                  </div>
                  <span className="text-sm font-medium text-surface-700">
                    {alerts.length === 1
                      ? "1 anomaly detected"
                      : `${alerts.length} anomalies detected`}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setQuery(
                      alerts[0]
                        ? `Tell me more about this anomaly: ${alerts[0].title}`
                        : "What anomalies have you detected?",
                    );
                    inputRef.current?.focus();
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-warning-600 hover:text-warning-700 transition-colors"
                >
                  Investigate <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AiGate>
  );
}
