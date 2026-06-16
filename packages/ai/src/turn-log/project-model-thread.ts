/** Project the durable turn-event log → the exact provider message thread (spec §4.3).
 *  - assistant_step → assistant msg (text block first, then tool_use blocks)
 *  - a MAXIMAL run of consecutive tool_result events → ONE user msg of tool_result blocks
 *    (so pre-pause deferred + post-resume decision results for one step collapse together)
 *  - `result` is the MODEL-facing string verbatim; `render` is UI-only and ignored here
 *  - user_message → user msg; scenario/gate/turn_* skipped */
import type { ContentBlock, LlmMessage } from "../providers";
import type { TurnEvent } from "./types";

export function projectModelThread(events: TurnEvent[]): LlmMessage[] {
  const out: LlmMessage[] = [];
  let resultRun: ContentBlock[] | null = null;

  const flush = () => {
    if (resultRun && resultRun.length) out.push({ role: "user", content: resultRun });
    resultRun = null;
  };

  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.type === "tool_result") {
      const p = e.payload as { toolUseId: string; result: string };
      (resultRun ??= []).push({ type: "tool_result", toolUseId: p.toolUseId, content: p.result });
      continue;
    }
    if (e.type === "user_message") {
      flush();
      out.push({ role: "user", content: (e.payload as { text: string }).text });
    } else if (e.type === "assistant_step") {
      flush();
      const p = e.payload as { text?: string; toolUses?: { id: string; name: string; input: Record<string, unknown> }[] };
      const content: ContentBlock[] = [];
      if (p.text) content.push({ type: "text", text: p.text });
      for (const tu of p.toolUses ?? []) content.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
      out.push({ role: "assistant", content });
    }
    // scenario / gate / turn_done / turn_error → control-only, skipped WITHOUT
    // breaking an in-progress tool_result run (so pre-pause deferred + post-resume
    // decision results for one assistant step collapse into a single user turn).
  }
  flush();
  return out;
}
