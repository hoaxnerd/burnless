/**
 * Onboarding research agent.
 *
 * Drives an LLM through a bounded tool-use loop (search_web / read_webpage /
 * read_webpage_rendered) to gather a company profile from public web sources,
 * then returns a healed, canonically-typed `OnboardingAgentResult`. Progress is
 * reported through the
 * `onStatus` callback so callers can stream updates to the UI.
 */

import {
  getProviderForFeature,
  getFinancialTools,
  type ContentBlock,
  type LlmMessage,
} from "@burnless/ai";
import { executeToolCall } from "@/lib/ai-tools";
import { blockedHint, NUDGE_FOR_JSON, buildAgentSystemPrompt } from "./system-prompt";
import { isBlocked } from "./block-detection";
import { healOnboardingResult } from "./heal";
import type { OnboardingAgentResult } from "./types";

export type { OnboardingAgentResult } from "./types";
export { healOnboardingResult } from "./heal";

// ── Configuration ────────────────────────────────────────────────────────────

const MAX_LOOPS = 15;
const SEARCH_BUDGET = 5;
const CRAWL_BUDGET = 10; // shared between `read_webpage` and `read_webpage_rendered`
const AGENT_TOOL_NAMES = ["search_web", "read_webpage", "read_webpage_rendered"] as const;

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
  if (tool === "search_web") {
    return "Error: Search budget exceeded (max 5 searches). Synthesize with current data.";
  }
  return "Error: Read-webpage budget exceeded (max 10). Synthesize with current data.";
}

async function runToolCall(
  toolName: AgentToolName,
  url: string | undefined,
  input: Record<string, unknown>,
  userId: string,
): Promise<{ content: string }> {
  try {
    const result = await executeToolCall(toolName, input, { userId });
    if ((toolName === "read_webpage" || toolName === "read_webpage_rendered") && isBlocked(result)) {
      return { content: blockedHint(url ?? "the website") };
    }
    return { content: result };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if ((toolName === "read_webpage" || toolName === "read_webpage_rendered") && isBlocked(message)) {
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
    if (call.name === "search_web") {
      if (budget.search >= SEARCH_BUDGET) {
        results.push({ type: "tool_result", toolUseId: call.id, content: budgetExceededMessage("search_web") });
        continue;
      }
      budget.search++;
      const query = typeof call.input.query === "string" ? call.input.query : "";
      onStatus(`Searching for: "${query}"...`);
      // `search_web` (SearXNG/Tavily) returns structured JSON
      // `{ results: [{ rank, title, url, snippet }] }` and accepts an optional
      // `maxResults`; the raw JSON string is fed straight back to the model.
      const { content } = await runToolCall("search_web", undefined, { query }, userId);
      results.push({ type: "tool_result", toolUseId: call.id, content });
      continue;
    }

    if (call.name === "read_webpage" || call.name === "read_webpage_rendered") {
      if (budget.crawl >= CRAWL_BUDGET) {
        results.push({ type: "tool_result", toolUseId: call.id, content: budgetExceededMessage("read_webpage") });
        continue;
      }
      budget.crawl++;
      const url = typeof call.input.url === "string" ? call.input.url : "";
      onStatus(call.name === "read_webpage" ? `Reading: ${url}...` : `Browser Rendering: ${url}...`);
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

  // Build the system prompt once per onboarding run so the example date in
  // the JSON template reflects the actual onboarding day, not server boot.
  const systemPrompt = buildAgentSystemPrompt();

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    const response = await provider.complete({
      messages,
      system: systemPrompt,
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
