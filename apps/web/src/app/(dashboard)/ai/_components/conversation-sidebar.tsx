import type { Conversation } from "./types";

interface ConversationSidebarProps {
  conversations: Conversation[];
  onLoadConversation: (id: string) => void;
}

export function ConversationSidebar({
  conversations,
  onLoadConversation,
}: ConversationSidebarProps) {
  return (
    <div className="mb-4 rounded-xl border border-surface-200 bg-surface-0 p-4 max-h-48 overflow-auto">
      <h3 className="text-sm font-medium text-surface-700 mb-2">Recent Conversations</h3>
      {conversations.length === 0 ? (
        <p className="text-sm text-surface-400">No conversations yet</p>
      ) : (
        <div className="space-y-1">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onLoadConversation(conv.id)}
              className="w-full text-left rounded-lg px-3 py-2 text-sm text-surface-700 hover:bg-surface-100 transition-colors"
            >
              {conv.title ?? "Untitled conversation"}
              <span className="ml-2 text-xs text-surface-400">
                {new Date(conv.updatedAt).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
