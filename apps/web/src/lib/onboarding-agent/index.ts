/**
 * Onboarding research agent.
 *
 * Drives an LLM through a bounded tool-use loop (search / crawl / browser_use)
 * to gather a company profile from public web sources, then returns a healed,
 * canonically-typed `OnboardingAgentResult`. Progress is reported through the
 * `onStatus` callback so callers can stream updates to the UI.
 */

import {
  getProviderForFeature,
  getFinancialTools,
  type ContentBlock,
  type LlmMessage,
} from "@burnless/ai";
import { executeToolCall } from "@/lib/ai-tools";
import { blockedHint, NUDGE_FOR_JSON, SYSTEM_PROMPT_AGENT } from "./system-prompt";
import { isBlocked } from "./block-detection";
import { healOnboardingResult } from "./heal";
import type { OnboardingAgentResult } from "./types";

export type { OnboardingAgentResult } from "./types";
export { healOnboardingResult } from "./heal";

// ── Configuration ────────────────────────────────────────────────────────────

const MAX_LOOPS = 15;
const SEARCH_BUDGET = 5;
const CRAWL_BUDGET = 10; // shared between `crawl` and `browser_use`
const AGENT_TOOL_NAMES = ["search", "crawl", "browser_use"] as const;

type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

function isTextBlock(block: ContentBlock): block is { type: "text"; text: string } {
  return block.type === "text";
}

function extractText(content: LlmMessage["content"]): string {
  if (typeof content === "string") return content;
  return content.filter(isTextBlock).map((b) => b.text).join("");
}

function extractJson(text: string): unknown | null {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
  const fallback = text.match(/\{[\s\S]*\}/);
  const source = fenced?.[1] ?? fallback?.[0];
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

// ── Tool execution ──────────────────────────────────────────────────────────

interface Budget {
  search: number;
  crawl: number;
}

function budgetExceededMessage(tool: AgentToolName): string {
  if (tool === "search") {
    return "Error: Search budget exceeded (max 5 searches). Synthesize with current data.";
  }
  return "Error: Crawl/browser budget exceeded (max 10). Synthesize with current data.";
}

async function runToolCall(
  toolName: AgentToolName,
  url: string | undefined,
  input: Record<string, unknown>,
  userId: string,
): Promise<{ content: string }> {
  try {
    const result = await executeToolCall(toolName, input, { userId });
    if ((toolName === "crawl" || toolName === "browser_use") && isBlocked(result)) {
      return { content: blockedHint(url ?? "the website") };
    }
    return { content: result };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if ((toolName === "crawl" || toolName === "browser_use") && isBlocked(message)) {
      return { content: blockedHint(url ?? "the website") };
    }
    return { content: `${toolName} error: ${message}` };
  }
}

async function dispatchToolCalls(
  toolCalls: ToolUseBlock[],
  budget: Budget,
  userId: string,
  onStatus: (msg: string) => void,
): Promise<ContentBlock[]> {
  const results: ContentBlock[] = [];

  for (const call of toolCalls) {
    if (call.name === "search") {
      if (budget.search >= SEARCH_BUDGET) {
        results.push({ type: "tool_result", toolUseId: call.id, content: budgetExceededMessage("search") });
        continue;
      }
      budget.search++;
      const query = typeof call.input.query === "string" ? call.input.query : "";
      onStatus(`Searching for: "${query}"...`);
      const { content } = await runToolCall("search", undefined, { query }, userId);
      results.push({ type: "tool_result", toolUseId: call.id, content });
      continue;
    }

    if (call.name === "crawl" || call.name === "browser_use") {
      if (budget.crawl >= CRAWL_BUDGET) {
        results.push({ type: "tool_result", toolUseId: call.id, content: budgetExceededMessage("crawl") });
        continue;
      }
      budget.crawl++;
      const url = typeof call.input.url === "string" ? call.input.url : "";
      onStatus(call.name === "crawl" ? `Crawling: ${url}...` : `Browser Rendering: ${url}...`);
      const { content } = await runToolCall(call.name, url, { url }, userId);
      results.push({ type: "tool_result", toolUseId: call.id, content });
      continue;
    }

    results.push({
      type: "tool_result",
      toolUseId: call.id,
      content: `Error: Unknown tool "${call.name}"`,
    });
  }

  return results;
}

// ── Public entrypoint ───────────────────────────────────────────────────────

export async function runOnboardingAgent(
  websiteUrl: string,
  userId: string,
  onStatus: (msg: string) => void,
): Promise<OnboardingAgentResult> {
  const provider = getProviderForFeature("onboarding_enrich");
  if (!provider) {
    throw new Error("No AI provider configured for onboarding enrichment.");
  }

  const messages: LlmMessage[] = [
    {
      role: "user",
      content: `Please research the company website URL: ${websiteUrl}.
Find its founders, funding rounds history, headcount plan suggestions, typical operating expenses, and exact or guesstimated revenue streams.
Use your tools to find accurate information.`,
    },
  ];

  const agentTools = getFinancialTools().filter((t) =>
    (AGENT_TOOL_NAMES as readonly string[]).includes(t.name),
  );
  const budget: Budget = { search: 0, crawl: 0 };

  onStatus("Starting research agent...");

  let finalJson: unknown = null;

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    const response = await provider.complete({
      messages,
      system: SYSTEM_PROMPT_AGENT,
      tools: agentTools,
    });

    messages.push({ role: "assistant", content: response.content });

    const toolCalls = response.content.filter(isToolUseBlock);

    if (toolCalls.length === 0) {
      const parsed = extractJson(extractText(response.content));
      if (parsed !== null) {
        finalJson = parsed;
        break;
      }
      // Model produced freeform text without JSON — nudge once and continue.
      messages.push({ role: "user", content: NUDGE_FOR_JSON });
      continue;
    }

    const toolResults = await dispatchToolCalls(toolCalls, budget, userId, onStatus);
    messages.push({ role: "user", content: toolResults });
  }

  if (finalJson === null) {
    // Last-ditch: scan the trailing assistant message in case the loop ended
    // mid-tool-cycle with JSON in the final text.
    const last = messages[messages.length - 1];
    if (last) finalJson = extractJson(extractText(last.content));
  }

  if (finalJson === null) {
    throw new Error("Agent failed to output valid JSON profile.");
  }

  return healOnboardingResult(finalJson);
}
