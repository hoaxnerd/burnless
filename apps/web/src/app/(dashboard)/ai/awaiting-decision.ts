/**
 * Pure helpers for the AI Companion page's composer-lock + pending-gate restore
 * logic (AI-02 / AI-09). Extracted out of `page.tsx` because a Next.js page
 * module may only export `default`/`metadata`/route config — exporting these
 * helpers from the page breaks the `.next/types` page-module constraint. Keeping
 * them here makes the contract unit-testable without rendering the page.
 */
import type {
  Message,
  PendingPermission,
  PendingInput,
  PendingPlan,
  TimelineNodeClient,
} from "./_components/types";

/* ─── Composer-lock predicate (AI-02) ──────────────────────────────── */

/**
 * Whether an unresolved gate currently holds the turn and should disable the
 * composer. AI-02 (two-gates contract): plan nodes are ADVISORY — plan approval
 * is NOT write approval — so an unresolved plan must NOT lock the composer. Only
 * an unresolved diff_gate (write approval) or input gate holds the turn.
 */
export function computeAwaitingDecision(messages: Message[]): boolean {
  return messages.some(
    (m) =>
      (m.pendingPermission && !m.pendingPermission.resolved) ||
      (m.timeline?.some(
        (n) =>
          (n.kind === "diff_gate" && n.pending && !n.pending.resolved) ||
          (n.kind === "input" && n.input && !n.input.resolved)
      ) ??
        false)
  );
}

/* ─── Pending-gate restore (AI-09) ─────────────────────────────────── */

export interface RestoreData {
  pendingPermission?: PendingPermission | null;
  pendingInput?: PendingInput | null;
  pendingPlan?: PendingPlan | null;
  pendingTimeline?: TimelineNodeClient[] | null;
  /** From the history route: false ⇒ the gate is stale (historical browse). */
  resumable?: boolean;
}

/** Mark a single restored gate node inert (resolved) when not resumable. */
function inertGateNode<T extends { kind: string; pending?: PendingPermission; input?: PendingInput; plan?: PendingPlan }>(
  node: T
): T {
  return {
    ...node,
    resolved: true,
    ...(node.pending ? { pending: { ...node.pending, resolved: true } } : {}),
    ...(node.input ? { input: { ...node.input, resolved: true } } : {}),
    ...(node.plan ? { plan: { ...node.plan, resolved: true } } : {}),
  };
}

/**
 * Compose the final restored-conversation messages, attaching any persisted
 * pending gate to the last assistant turn's timeline. AI-09: when the server
 * reports the gate is NOT resumable (a stale historical pause past the TTL), the
 * gate is restored INERT (resolved) so it renders passively and the composer
 * stays enabled (computeAwaitingDecision excludes resolved nodes). When resumable
 * (the genuinely-just-paused Plan-5 full-run case), the gate is restored LIVE.
 */
export function restoreConversationMessages(restoredMessages: Message[], data: RestoreData): Message[] {
  const inert = data.resumable === false;
  const ensureLastAssistant = (msgs: Message[]): number => {
    let lastIdx = msgs.length - 1;
    if (lastIdx < 0 || msgs[lastIdx]!.role !== "assistant") {
      msgs.push({ role: "assistant", content: "", createdAt: Date.now(), timeline: [] });
      lastIdx = msgs.length - 1;
    }
    return lastIdx;
  };

  if (data.pendingTimeline && Array.isArray(data.pendingTimeline) && data.pendingTimeline.length) {
    const timeline = inert
      ? data.pendingTimeline.map((n) =>
          n.kind === "diff_gate" || n.kind === "input" || n.kind === "plan" ? inertGateNode(n) : n
        )
      : data.pendingTimeline;
    const msgs = [...restoredMessages];
    const lastIdx = ensureLastAssistant(msgs);
    msgs[lastIdx] = { ...msgs[lastIdx]!, timeline };
    return msgs;
  }

  let node: TimelineNodeClient | null = null;
  if (data.pendingPermission) node = { id: data.pendingPermission.pauseId, kind: "diff_gate", pending: data.pendingPermission };
  else if (data.pendingInput) node = { id: data.pendingInput.pauseId, kind: "input", input: data.pendingInput };
  else if (data.pendingPlan) node = { id: data.pendingPlan.pauseId, kind: "plan", plan: data.pendingPlan };

  if (!node) return restoredMessages;

  const finalNode = inert ? inertGateNode(node) : node;
  const msgs = [...restoredMessages];
  const lastIdx = ensureLastAssistant(msgs);
  const tl = [...(msgs[lastIdx]!.timeline ?? []), finalNode];
  msgs[lastIdx] = { ...msgs[lastIdx]!, timeline: tl };
  return msgs;
}
