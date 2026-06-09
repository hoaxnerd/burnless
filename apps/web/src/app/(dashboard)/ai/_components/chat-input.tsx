import React from "react";
import { Send, Loader2 } from "lucide-react";
import { Input } from "@/components/ui";

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function ChatInput({
  input,
  isLoading,
  inputRef,
  onInputChange,
  onSubmit,
}: ChatInputProps) {
  return (
    <form onSubmit={onSubmit} className="flex gap-3">
      <Input
        ref={inputRef}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder="Ask about your financials, build a scenario, get advice..."
        disabled={isLoading}
        aria-label="Message"
        className="flex-1"
      />
      <button
        type="submit"
        disabled={isLoading || !input.trim()}
        aria-label="Send message"
        className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-medium text-white hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </button>
    </form>
  );
}
