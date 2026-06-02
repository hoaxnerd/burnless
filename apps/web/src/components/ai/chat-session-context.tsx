"use client";
import { createContext, useContext, useRef, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { readSseStream } from "@/app/(dashboard)/ai/_components/sse";
import type { Message, PendingPermission, PendingInput } from "@/app/(dashboard)/ai/_components/types";

// A draft/new chat (no id yet) uses this key until the server returns a real id.
const NEW = "__new__";

interface SessionState {
  messages: Message[];
  isLoading: boolean;
}

interface ChatSessionValue {
  get: (conversationId: string | null) => SessionState;
  send: (
    conversationId: string | null,
    text: string,
    scenarioId: string | null,
    /** Notified with the server-assigned id so the page can thread follow-ups. */
    onConversationId?: (id: string) => void
  ) => Promise<void>;
  decide: (conversationId: string, pending: PendingPermission, decisions: { requestId: string; decision: "once" | "session" | "deny" }[]) => Promise<void>;
  submitInput: (conversationId: string, pending: PendingInput, formData: Record<string, unknown>) => Promise<void>;
  setMessages: (conversationId: string | null, msgs: Message[]) => void;
  /** Reassign the draft session to a real id once the server creates it. */
  rekey: (fromConversationId: string) => void;
}

const Ctx = createContext<ChatSessionValue | null>(null);
const EMPTY: SessionState = { messages: [], isLoading: false };

export function ChatSessionProvider({ children }: { children: React.ReactNode }) {
  // Source of truth survives route changes because this provider is mounted in the
  // dashboard layout, which does not unmount on client-side navigation.
  const store = useRef<Map<string, SessionState>>(new Map());
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  const keyOf = (id: string | null) => id ?? NEW;
  const get = useCallback((id: string | null) => store.current.get(keyOf(id)) ?? EMPTY, []);
  const write = useCallback((key: string, patch: (s: SessionState) => SessionState) => {
    const cur = store.current.get(key) ?? EMPTY;
    store.current.set(key, patch(cur));
    rerender();
  }, [rerender]);

  const setMessages = useCallback((id: string | null, msgs: Message[]) => {
    write(keyOf(id), (s) => ({ ...s, messages: msgs }));
  }, [write]);

  const rekey = useCallback((fromId: string) => {
    const draft = store.current.get(NEW);
    if (draft && !store.current.has(fromId)) {
      store.current.set(fromId, draft);
      store.current.delete(NEW);
      rerender();
    }
  }, [rerender]);

  // Patch the LAST message of a specific conversation's slice (by key, not "current view").
  const patchLast = useCallback((key: string, patch: (m: Message) => Message) => {
    write(key, (s) => {
      const msgs = [...s.messages];
      if (msgs.length) msgs[msgs.length - 1] = patch(msgs[msgs.length - 1]!);
      return { ...s, messages: msgs };
    });
  }, [write]);

  // Applies SSE events to a fixed conversation key — NOT to "whatever is on screen".
  const applyEvent = useCallback((key: string, ev: Record<string, unknown>, onConversationId?: (id: string) => void) => {
    const t = ev.type as string;
    if (t === "conversation_id" && ev.conversationId) onConversationId?.(ev.conversationId as string);
    else if (t === "thinking") patchLast(key, (m) => ({ ...m, thinking: (m.thinking ?? "") + (ev.content as string) }));
    else if (t === "text") patchLast(key, (m) => ({ ...m, content: m.content + (ev.content as string) }));
    else if (t === "tool_use") patchLast(key, (m) => ({ ...m, toolCalls: [...(m.toolCalls ?? []), ev.tool as string] }));
    else if (t === "tool_status") patchLast(key, (m) => ({ ...m, toolStatus: { tool: ev.tool as string, phase: ev.phase as "running" | "done" | "error" } }));
    else if (t === "permission_request") patchLast(key, (m) => ({ ...m, isStreaming: false, toolStatus: null, pendingPermission: { pauseId: ev.pauseId as string, conversationId: ev.conversationId as string, actions: (ev.actions as PendingPermission["actions"]) ?? [] } }));
    else if (t === "ui_component") patchLast(key, (m) => ({ ...m, uiBlocks: [...(m.uiBlocks ?? []), { id: ev.id as string, component: ev.component as string, props: (ev.props as Record<string, unknown>) ?? {} }] }));
    else if (t === "input_request") patchLast(key, (m) => ({ ...m, isStreaming: false, toolStatus: null, pendingInput: { pauseId: ev.pauseId as string, conversationId: ev.conversationId as string, spec: ev.spec as PendingInput["spec"] } }));
    else if (t === "paused") write(key, (s) => ({ ...s, isLoading: false }));
    else if (t === "done") patchLast(key, (m) => ({ ...m, isStreaming: false, toolStatus: null }));
    else if (t === "error") patchLast(key, (m) => ({ ...m, content: m.content + `\n\n*Error: ${ev.content}*`, isStreaming: false }));
  }, [patchLast, write]);

  const send = useCallback(async (id: string | null, text: string, scenarioId: string | null, onConversationId?: (id: string) => void) => {
    let key = keyOf(id);
    write(key, (s) => ({
      isLoading: true,
      messages: [...s.messages, { role: "user", content: text, createdAt: Date.now() }, { role: "assistant", content: "", isStreaming: true, toolCalls: [], createdAt: Date.now() }],
    }));
    try {
      const res = await apiFetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, conversationId: id, scenarioId }) });
      if (!res.ok) { patchLast(key, (m) => ({ ...m, content: "Sorry, I hit an error. Please try again.", isStreaming: false })); write(key, (s) => ({ ...s, isLoading: false })); return; }
      await readSseStream(res, (ev) => applyEvent(key, ev, (newId) => {
        // First conversation_id for a brand-new chat: migrate the draft slice to the real id.
        if (key === NEW) { rekey(newId); key = newId; }
        onConversationId?.(newId);
      }));
    } catch {
      patchLast(key, (m) => ({ ...m, content: "Sorry, I lost connection. Please try again.", isStreaming: false }));
    } finally {
      write(key, (s) => ({ ...s, isLoading: false }));
    }
  }, [write, patchLast, applyEvent, rekey]);

  const decide = useCallback(async (id: string, pending: PendingPermission, decisions: { requestId: string; decision: "once" | "session" | "deny" }[]) => {
    const key = keyOf(id);
    patchLast(key, (m) => ({ ...m, pendingPermission: m.pendingPermission ? { ...m.pendingPermission, resolved: true } : null, isStreaming: true }));
    write(key, (s) => ({ ...s, isLoading: true }));
    try {
      const res = await apiFetch("/api/chat/resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: pending.conversationId, pauseId: pending.pauseId, decisions }) });
      if (!res.ok) throw new Error("resume failed");
      await readSseStream(res, (ev) => applyEvent(key, ev));
    } catch {
      patchLast(key, (m) => ({ ...m, content: m.content + "\n\n*Couldn't resume. Please try again.*", isStreaming: false }));
    } finally {
      write(key, (s) => ({ ...s, isLoading: false }));
    }
  }, [write, patchLast, applyEvent]);

  const submitInput = useCallback(async (id: string, pending: PendingInput, formData: Record<string, unknown>) => {
    const key = keyOf(id);
    patchLast(key, (m) => ({ ...m, pendingInput: m.pendingInput ? { ...m.pendingInput, resolved: true } : null, isStreaming: true }));
    write(key, (s) => ({ ...s, isLoading: true }));
    try {
      const res = await apiFetch("/api/chat/resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: pending.conversationId, pauseId: pending.pauseId, formData }) });
      if (!res.ok) throw new Error("submit failed");
      await readSseStream(res, (ev) => applyEvent(key, ev));
    } catch {
      patchLast(key, (m) => ({ ...m, content: m.content + "\n\n*Couldn't submit. Please try again.*", isStreaming: false }));
    } finally {
      write(key, (s) => ({ ...s, isLoading: false }));
    }
  }, [write, patchLast, applyEvent]);

  return <Ctx.Provider value={{ get, send, decide, submitInput, setMessages, rekey }}>{children}</Ctx.Provider>;
}

export function useChatSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useChatSession must be used within ChatSessionProvider");
  return v;
}
