"use client";

import {
  History,
  Loader2,
} from "lucide-react";
import type { Conversation } from "./types";
import { useLocale } from "@/components/locale/locale-context";

interface ConversationListProps {
  conversations: Conversation[];
  onLoadConversation: (id: string) => void;
  loading?: boolean;
}

function ConversationList({
  conversations,
  onLoadConversation,
  loading,
}: ConversationListProps) {
  const { fmtDate } = useLocale();
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-3 text-sm text-surface-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading conversations...
      </div>
    );
  }

  if (conversations.length === 0) {
    return <p className="text-sm text-surface-400 px-1">No conversations yet</p>;
  }

  return (
    <div className="space-y-1">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onLoadConversation(conv.id)}
          className="w-full text-left rounded-lg px-3 py-2 text-sm text-surface-700 hover:bg-surface-100 transition-colors"
        >
          {conv.title ?? "Untitled conversation"}
          <span className="ml-2 text-xs text-surface-400">
            {fmtDate(conv.updatedAt)}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ─── Mobile: history card ─────────────────────────────────────────── */

interface MobileHistoryCardProps {
  conversations: Conversation[];
  onLoadConversation: (id: string) => void;
  loading?: boolean;
}

export function MobileHistoryCard({
  conversations,
  onLoadConversation,
  loading,
}: MobileHistoryCardProps) {
  return (
    <div className="lg:hidden mx-2 mb-3 rounded-xl border border-surface-200 bg-surface-0 shadow-sm">
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-surface-100">
        <History className="h-4 w-4 text-surface-500" />
        <span className="text-sm font-semibold text-surface-700">
          {loading ? "History" : `History (${conversations.length})`}
        </span>
      </div>
      <div className="px-4 py-3 max-h-48 overflow-auto">
        <ConversationList
          conversations={conversations}
          onLoadConversation={onLoadConversation}
          loading={loading}
        />
      </div>
    </div>
  );
}
