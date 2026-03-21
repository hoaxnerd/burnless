export interface Message {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  toolCalls?: string[];
  createdAt: number;
}

export interface Insight {
  type: string;
  title: string;
  summary: string;
  details: string;
  severity: "info" | "warning" | "critical";
}

export interface Conversation {
  id: string;
  title: string | null;
  updatedAt: string;
}
