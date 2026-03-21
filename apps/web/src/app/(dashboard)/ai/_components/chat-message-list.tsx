import React from "react";
import { Bot, User, Copy, Check } from "lucide-react";
import { FormattedContent } from "./formatted-content";
import { ToolResultDisplay } from "./tool-result-display";
import type { Message } from "./types";

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
}

export function ChatMessageList({
  messages,
  copiedIndex,
  onCopy,
  messagesEndRef,
}: ChatMessageListProps) {
  return (
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
            <div className="group/msg">
              {/* Tool call indicators */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <ToolResultDisplay toolCalls={msg.toolCalls} />
              )}
              <div
                className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-brand-600 text-white"
                    : "bg-surface-0 border border-surface-200 text-surface-800"
                }`}
              >
                <FormattedContent content={msg.content} />
                {msg.isStreaming && !msg.content && (
                  <span className="inline-flex items-center gap-1 text-surface-400 text-xs">
                    <span className="flex gap-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-bounce [animation-delay:300ms]" />
                    </span>
                    <span className="ml-1">Thinking</span>
                  </span>
                )}
                {msg.isStreaming && msg.content && (
                  <span className="inline-block ml-1 animate-pulse">▊</span>
                )}
              </div>
              {/* Timestamp + copy button row */}
              <div className={`mt-1 flex items-center gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <span className="text-[10px] text-surface-400">
                  {formatRelativeTime(msg.createdAt)}
                </span>
                {msg.role === "assistant" && !msg.isStreaming && msg.content && (
                  <button
                    onClick={() => onCopy(msg.content, i)}
                    className="opacity-0 group-hover/msg:opacity-100 transition-opacity inline-flex items-center gap-1 text-[10px] text-surface-400 hover:text-surface-600"
                    aria-label="Copy message"
                  >
                    {copiedIndex === i ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
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
  );
}
