import React, { useState } from "react";
import { Bot, User, Copy, Check, Sparkles, ChevronRight, Brain } from "lucide-react";
import { MarkdownRenderer } from "@/components/ai/markdown-renderer";
import { ToolResultDisplay } from "./tool-result-display";
import type { Message } from "./types";

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

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface ChatMessageListProps {
  messages: Message[];
  copiedIndex: number | null;
  onCopy: (content: string, index: number) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  isLoading?: boolean;
  companionName?: string;
}

export function ChatMessageList({
  messages,
  copiedIndex,
  onCopy,
  messagesEndRef,
  isLoading,
  companionName = "Financial Companion",
}: ChatMessageListProps) {
  return (
    <div className="flex-1 overflow-auto space-y-5 mb-4 pr-2 scroll-smooth">
      {messages.map((msg, i) => {
        const isUser = msg.role === "user";
        const isFirstAssistant =
          !isUser && messages.findIndex((m) => m.role === "assistant") === i;

        return (
          <div
            key={i}
            className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            <div className={`flex gap-3 ${isUser ? "max-w-[80%]" : "max-w-[85%]"}`}>
              {/* Assistant avatar */}
              {!isUser && (
                <div className="flex-shrink-0 mt-1">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center shadow-sm shadow-accent-500/20">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                </div>
              )}

              <div className="group/msg min-w-0">
                {/* AI capabilities badge on first assistant message */}
                {isFirstAssistant && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 border border-accent-100 px-2 py-0.5 text-[10px] font-medium text-accent-600">
                      <Sparkles className="h-2.5 w-2.5" />
                      {companionName}
                    </span>
                  </div>
                )}

                {/* Tool call indicators */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <ToolResultDisplay toolCalls={msg.toolCalls} />
                )}

                {/* Thinking block — shown above response for assistant messages when thinking data exists */}
                {!isUser && msg.thinking && (
                  <ThinkingBlock thinking={msg.thinking} isStreaming={msg.isStreaming} />
                )}

                {/* Message bubble */}
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? "bg-brand-600 text-white [&_*]:text-inherit rounded-br-md"
                      : "bg-surface-0 border border-surface-200 text-surface-800 rounded-bl-md shadow-sm"
                  }`}
                >
                  <MarkdownRenderer content={isUser ? msg.content : stripThinkingTags(msg.content)} />

                  {/* Typing indicator — shown when streaming with no response content yet */}
                  {msg.isStreaming && !msg.content && (
                    <div className="flex items-center gap-2 py-1">
                      <span className="flex gap-1">
                        <span className="h-2 w-2 rounded-full bg-accent-400 animate-bounce [animation-delay:0ms]" />
                        <span className="h-2 w-2 rounded-full bg-accent-400 animate-bounce [animation-delay:150ms]" />
                        <span className="h-2 w-2 rounded-full bg-accent-400 animate-bounce [animation-delay:300ms]" />
                      </span>
                      <span className="text-xs text-surface-400 animate-pulse">
                        Thinking...
                      </span>
                    </div>
                  )}

                  {/* Streaming cursor */}
                  {msg.isStreaming && msg.content && (
                    <span className="inline-block ml-0.5 w-2 h-4 bg-accent-500 animate-pulse rounded-sm align-text-bottom" />
                  )}
                </div>

                {/* Timestamp + copy button row */}
                <div
                  className={`mt-1.5 flex items-center gap-2 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <span className="text-[10px] text-surface-400">
                    {formatRelativeTime(msg.createdAt)}
                  </span>
                  {!isUser && !msg.isStreaming && msg.content && (
                    <button
                      onClick={() => onCopy(msg.content, i)}
                      className="opacity-0 group-hover/msg:opacity-100 transition-opacity inline-flex items-center gap-1 text-[10px] text-surface-400 hover:text-surface-600"
                      aria-label="Copy message"
                    >
                      {copiedIndex === i ? (
                        <>
                          <Check className="h-3 w-3 text-green-500" />
                          <span className="text-green-500">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* User avatar */}
              {isUser && (
                <div className="flex-shrink-0 mt-1">
                  <div className="h-8 w-8 rounded-full bg-surface-200 flex items-center justify-center">
                    <User className="h-4 w-4 text-surface-600" />
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Bottom-of-chat typing indicator when loading but last message is complete */}
      {isLoading &&
        messages.length > 0 &&
        !messages[messages.length - 1]?.isStreaming && (
          <div className="flex justify-start animate-fade-in">
            <div className="flex gap-3">
              <div className="flex-shrink-0 mt-1">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center shadow-sm shadow-accent-500/20">
                  <Bot className="h-4 w-4 text-white" />
                </div>
              </div>
              <div className="rounded-2xl rounded-bl-md bg-surface-0 border border-surface-200 px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-accent-400 animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 rounded-full bg-accent-400 animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-accent-400 animate-bounce [animation-delay:300ms]" />
                  </span>
                  <span className="text-xs text-surface-400 animate-pulse">
                    Thinking...
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

      <div ref={messagesEndRef} />
    </div>
  );
}
