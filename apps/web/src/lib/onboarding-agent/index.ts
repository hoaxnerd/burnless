/**
 * Onboarding research agent.
 *
 * Drives an LLM through a bounded tool-use loop (search_web / read_webpage)
 * to gather a company profile from public web sources,
 * then returns a healed, canonically-typed `OnboardingAgentResult`. Progress is
 * reported through the
 * `onStatus` callback so callers can stream updates to the UI.
 */

import {
  resolveResilientProvider,
  getFinancialTools,
  getAiLimits,
  type ContentBlock,
  type LlmMessage,
} from "@burnless/ai";
import { executeToolCall } from "@/lib/ai-tools";
import { getCompanyProviderConfig } from "@/lib/ai-feature-flags";
import { blockedHint, NUDGE_FOR_JSON, buildAgentSystemPrompt } from "./system-prompt";
import { isBlocked } from "./block-detection";
import { healOnboardingResult } from "./heal";
import type { OnboardingAgentResult } from "./types";

export type { OnboardingAgentResult } from "./types";
export { healOnboardingResult } from "./heal";

// ── Configuration ────────────────────────────────────────────────────────────

const AGENT_TOOL_NAMES = ["search_web", "read_webpage"] as const;

/** Single overall loop bound for the research agent (spec §3 decision 6).
 *  Per-tool search/crawl budgets were removed — 50 loops is the only limit. */
export function getOnboardingMaxLoops(): number {
  return getAiLimits().onboardingMaxLoops;
}

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

async function runToolCall(
  toolName: AgentToolName,
  url: string | undefined,
  input: Record<string, unknown>,
  userId: string,
): Promise<{ content: string }> {
  try {
    const result = await executeToolCall(toolName, input, { userId });
    if (toolName === "read_webpage" && isBlocked(result)) {
      return { content: blockedHint(url ?? "the website") };
    }
    return { content: result };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (toolName === "read_webpage" && isBlocked(message)) {
      return { content: blockedHint(url ?? "the website") };
    }
    return { content: `${toolName} error: ${message}` };
  }
}

async function dispatchToolCalls(
  toolCalls: ToolUseBlock[],
  userId: string,
  onStatus: (msg: string) => void,
): Promise<ContentBlock[]> {
  const results: ContentBlock[] = [];

  for (const call of toolCalls) {
    if (call.name === "search_web") {
      const query = typeof call.input.query === "string" ? call.input.query : "";
      onStatus(`Searching for: "${query}"...`);
      const { content } = await runToolCall("search_web", undefined, { query }, userId);
      results.push({ type: "tool_result", toolUseId: call.id, content });
      continue;
    }
    if (call.name === "read_webpage") {
      const url = typeof call.input.url === "string" ? call.input.url : "";
      onStatus(`Reading: ${url}...`);
      const { content } = await runToolCall(call.name, url, { url }, userId);
      results.push({ type: "tool_result", toolUseId: call.id, content });
      continue;
    }
    results.push({ type: "tool_result", toolUseId: call.id, content: `Error: Unknown tool "${call.name}"` });
  }
  return results;
}

// ── Public entrypoint ───────────────────────────────────────────────────────

export async function runOnboardingAgent(
  websiteUrl: string,
  userId: string,
  onStatus: (msg: string) => void,
  companyId?: string,
): Promise<OnboardingAgentResult> {
  // Route through THE seam: resilience (retry, which recovers transient empty
  // completions) + usage tracking + request logging. Prefer the company's
  // configured DB provider (the one the user just saved in onboarding/settings);
  // the seam falls back to env/tier routing when no usable config is supplied.
  const cfg = companyId ? await getCompanyProviderConfig(companyId) : null;
  const provider = resolveResilientProvider(
    "onboarding_enrich",
    cfg && (cfg.apiKey || cfg.provider)
      ? { provider: cfg.provider, apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl }
      : undefined,
  );
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

  onStatus("Starting research agent...");

  let finalJson: unknown = null;

  // Build the system prompt once per onboarding run so the example date in
  // the JSON template reflects the actual onboarding day, not server boot.
  const systemPrompt = buildAgentSystemPrompt();

  for (let loop = 0, maxLoops = getOnboardingMaxLoops(); loop < maxLoops; loop++) {
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

    const toolResults = await dispatchToolCalls(toolCalls, userId, onStatus);
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
