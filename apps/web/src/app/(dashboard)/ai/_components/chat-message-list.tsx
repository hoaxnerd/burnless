import React, { useState } from "react";
import { Copy, Check, ChevronRight, Brain } from "lucide-react";
import { MarkdownRenderer } from "@/components/ai/markdown-renderer";
import { useLocale } from "@/components/locale/locale-context";
import { TimelineView } from "./timeline/timeline-view";
import type { Message, PendingPermission, PendingInput, PendingPlan } from "./types";

/** Beyond this age a relative label ("Nd ago") is noise — show an absolute date. */
const ABSOLUTE_AFTER_MS = 24 * 60 * 60 * 1000; // 1 day

/** Strip model thinking tags (e.g. <think>...</think>) from response text — fallback defense. */
function stripThinkingTags(text: string): string {
  return text.replace(/<(?:think|thinking|antThinking)[^>]*>[\s\S]*?<\/(?:think|thinking|antThinking)>/gi, "").trim();
}

/** Collapsible thinking block — shows model reasoning in a subtle expandable section. */
function ThinkingBlock({ thinking, isStreaming }: { thinking: string; isStreaming?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-600 transition-colors py-1"
      >
        <ChevronRight
          className={`h-3 w-3 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
        <Brain className="h-3 w-3" />
        <span>
          {isStreaming && !thinking ? "Thinking..." : "Thought process"}
        </span>
        {isStreaming && thinking && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-400 animate-pulse" />
        )}
      </button>
      {expanded && thinking && (
        <div className="mt-1 ml-5 rounded-lg bg-surface-50 border border-surface-100 px-3 py-2 text-xs text-surface-500 leading-relaxed max-h-60 overflow-auto">
          <MarkdownRenderer content={thinking} />
        </div>
      )}
    </div>
  );
}

/**
 * Relative label for a recent timestamp, or `null` when the caller should fall
 * back to an absolute date. Returns null when the timestamp is missing (restored
 * history with no real createdAt) or older than {@link ABSOLUTE_AFTER_MS} — so a
 * day-old restored turn never reads "just now" / "Nd ago". (AI-08)
 */
function formatRelativeTime(timestamp: number | null | undefined): string | null {
  if (timestamp == null) return null;
  const ms = Date.now() - timestamp;
  if (ms >= ABSOLUTE_AFTER_MS) return null;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

interface ChatMessageListProps {
  messages: Message[];
  copiedIndex: number | null;
  onCopy: (content: string, index: number) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  isLoading?: boolean;
  companionName?: string;
  onActionPrompt?: (prompt: string) => void;
  onInputSubmit?: (pending: PendingInput, data: Record<string, unknown>) => void;
  onPlanSubmit?: (pending: PendingPlan, plan: PendingPlan["spec"]) => void;
  /** Locally dismiss an advisory plan node without a server resume (AI-02). */
  onPlanDismiss?: (pending: PendingPlan) => void;
  /** Permission/diff gate decision, now rendered in-stream as a diff_gate node. */
  onDecide?: (pending: PendingPermission, decisions: { requestId: string; decision: "once" | "session" | "deny" }[]) => void;
}

export function ChatMessageList({
  messages,
  copiedIndex,
  onCopy,
  messagesEndRef,
  isLoading,
  onActionPrompt,
  onInputSubmit,
  onPlanSubmit,
  onPlanDismiss,
  onDecide,
}: ChatMessageListProps) {
  const { fmtDate } = useLocale();
  return (
    <div className="flex-1 overflow-auto space-y-4 mb-4 pr-2 scroll-smooth">
      {messages.map((msg, i) => {
        const isUser = msg.role === "user";
        if (isUser) {
          return (
            <div key={i} className="flex justify-end animate-fade-in">
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm leading-relaxed text-white [&_*]:text-inherit">
                <MarkdownRenderer content={msg.content} />
              </div>
            </div>
          );
        }
        const hasTimeline = !!msg.timeline && msg.timeline.length > 0;
        return (
          <div key={i} className="group/msg animate-fade-in">
            {msg.thinking ? <ThinkingBlock thinking={msg.thinking} isStreaming={msg.isStreaming} /> : null}
            {hasTimeline ? (
              <TimelineView
                nodes={msg.timeline!}
                disabled={!!isLoading}
                onPlanSubmit={(pending, plan) => onPlanSubmit?.(pending, plan)}
                onPlanDismiss={(pending) => onPlanDismiss?.(pending)}
                onDecide={(pending, decisions) => onDecide?.(pending, decisions)}
                onInputSubmit={(pending, data) => onInputSubmit?.(pending, data)}
                onAction={onActionPrompt}
              />
            ) : (
              // Fallback for a streaming turn before its first node, or an
              // empty assistant message: a minimal text line.
              <div className="text-sm leading-relaxed text-surface-800">
                <MarkdownRenderer content={stripThinkingTags(msg.content)} />
                {msg.isStreaming && !msg.content ? (
                  <span className="inline-flex items-center gap-2 py-1 text-xs text-surface-400">
                    <span className="flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-bounce" />
                      <span className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-bounce [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-bounce [animation-delay:300ms]" />
                    </span>
                    Thinking…
                  </span>
                ) : null}
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-2">
              {(() => {
                // AI-08: a recent message reads relative ("just now"); a missing
                // or day-old timestamp (restored history) reads an absolute date
                // via the centralized formatter — never a misleading "just now".
                const relative = formatRelativeTime(msg.createdAt);
                const label =
                  relative ?? (msg.createdAt != null ? fmtDate(new Date(msg.createdAt)) : "earlier");
                return <span className="text-[10px] text-surface-400">{label}</span>;
              })()}
              {!msg.isStreaming && msg.content ? (
                <button onClick={() => onCopy(msg.content, i)} className="opacity-0 group-hover/msg:opacity-100 transition-opacity inline-flex items-center gap-1 text-[10px] text-surface-400 hover:text-surface-600" aria-label="Copy message">
                  {copiedIndex === i ? (<><Check className="h-3 w-3 text-success-500" /><span className="text-success-500">Copied</span></>) : (<><Copy className="h-3 w-3" /><span>Copy</span></>)}
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      {isLoading && messages.length > 0 && !messages[messages.length - 1]?.isStreaming ? (
        <div className="flex items-center gap-2 pl-6 text-xs text-surface-400 animate-fade-in">
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-bounce" />
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-bounce [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-bounce [animation-delay:300ms]" />
          </span>
          Working…
        </div>
      ) : null}
      <div ref={messagesEndRef} />
    </div>
  );
}

