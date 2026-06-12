/**
 * Core chat handler — orchestrates LLM calls with financial context
 * and tool use. Supports both streaming and non-streaming modes.
 *
 * Provider-agnostic: works with Anthropic, OpenAI, or any registered provider.
 */

import type { ChatMessage, StreamChunk, ToolCallResult, PauseState, PendingToolUse } from "./types";
import { getFinancialTools } from "./tools";
import { buildSystemMessage } from "./prompts";
import {
  getProvider,
  createProvider,
  type LlmProvider,
  type LlmMessage,
  type ContentBlock,
  type CompletionRequest,
  type ToolDefinition,
} from "./providers";
import { getProviderForFeature } from "./routing";
import { sanitizeUserMessage } from "./sanitize";
import { isInputTool, isPlanTool, buildInputFormSpec, buildPlanSpec, type InputRequestState, type PlanRequestState } from "./generative-ui";

/** Resolve the provider: use explicit config override if present, else routing. */
function resolveProvider(options: ChatOptions): LlmProvider | null {
  if (options.providerConfig?.apiKey) {
    return createProvider({
      provider: options.providerConfig.provider,
      apiKey: options.providerConfig.apiKey,
      model: options.providerConfig.model,
      baseUrl: options.providerConfig.baseUrl,
    });
  }
  return getProviderForFeature(options.feature ?? "chat") ?? getProvider();
}

interface ChatOptions {
  messages: ChatMessage[];
  financialContext: string;
  onToolCall?: (toolName: string, input: Record<string, unknown>) => Promise<string>;
  /** Decide whether a tool may run without prompting. Default: everything "allow". */
  resolvePermission?: (toolName: string, input: Record<string, unknown>) => "allow" | "ask" | "deny";
  /** Persist a paused turn; returns a pauseId echoed in the permission_request/paused chunks. */
  onPause?: (state: PauseState) => Promise<string>;
  /** Persist a turn paused to collect form input; returns a pauseId echoed in the input_request/paused chunks. */
  onInputRequest?: (state: InputRequestState) => Promise<string>;
  /** Persist a turn paused to collect plan approval; returns a pauseId echoed in the plan_request/paused chunks. */
  onPlanRequest?: (state: PlanRequestState) => Promise<string>;
  /** AI feature name for model routing. Defaults to "chat". */
  feature?: string;
  /** Configured companion name for the system prompt. */
  companionName?: string;
  /**
   * Run mode for the system prompt. "interactive" (default) = live chat + UI
   * (planning/approval, display components, forms). "autonomous" = a headless
   * scheduled job: no user/UI, frozen minimal allowlist, act without approval,
   * summarize in plain text. The scheduled-job runner sets "autonomous". (S3a.)
   */
  mode?: "interactive" | "autonomous";
  /** Extra per-turn tools (MCP) appended to the financial tool set. */
  extraTools?: ToolDefinition[];
  /**
   * Complete replacement tool list. When set, the provider is offered EXACTLY
   * these tools (the frozen allowlist for a scheduled job) instead of the full
   * financial set + extraTools. Scope minimization — S3a Plan 4 §6.
   */
  toolsOverride?: ToolDefinition[];
  /**
   * Names of tools the user has disabled for this turn (per-built-in-tool
   * disables + session-disabled built-ins). Filtered out of the assembled
   * interactive tool set BEFORE the loop. Has NO effect on the `toolsOverride`
   * path: a scheduled job's frozen allowlist (S3a Plan 4 §6) is offered exactly
   * as given — S3b §11.
   */
  disabledToolNames?: ReadonlySet<string>;
  /** Override provider config (e.g., from per-company DB settings). */
  providerConfig?: {
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
}

/** Drop user-disabled tools from an assembled interactive tool set (S3b §11).
 *  No-op when `disabled` is absent/empty. NEVER applied to a `toolsOverride`
 *  (frozen-allowlist) tool set. */
function filterTools(
  tools: ToolDefinition[],
  disabled: ReadonlySet<string> | undefined
): ToolDefinition[] {
  if (!disabled || disabled.size === 0) return tools;
  return tools.filter((t) => !disabled.has(t.name));
}

/** Max tool-use round-trips before we force a text response. */
const MAX_TOOL_ITERATIONS = 10;

/** Non-streaming chat — sends message and returns complete response. */
export async function chat(options: ChatOptions): Promise<{
  response: string;
  toolResults: ToolCallResult[];
}> {
  const provider = resolveProvider(options);
  if (!provider) {
    return {
      response: "AI is not configured. Please set an API key in Settings to enable the companion.",
      toolResults: [],
    };
  }

  const system = buildSystemMessage(options.financialContext, options.companionName, options.mode);
  // The `toolsOverride` path (scheduled jobs) bypasses the disabled-tools filter
  // by design — it is a frozen allowlist (S3a Plan 4 §6 / S3b §11). Only the
  // interactive assembly is filtered.
  const tools = options.toolsOverride
    ? options.toolsOverride
    : filterTools([...getFinancialTools(), ...(options.extraTools ?? [])], options.disabledToolNames);

  const messages: LlmMessage[] = options.messages.map((m) => ({
    role: m.role,
    content: m.role === "user" && typeof m.content === "string"
      ? sanitizeUserMessage(m.content)
      : m.content,
  }));

  const toolResults: ToolCallResult[] = [];

  // Loop to handle multi-turn tool use (capped to prevent runaway costs)
  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await provider.complete({
      messages,
      system,
      tools: options.onToolCall ? tools : undefined,
    });

    // Handle tool calls
    if (response.stopReason === "tool_use" && options.onToolCall) {
      const toolUseBlocks = response.content.filter(
        (b): b is ContentBlock & { type: "tool_use" } => b.type === "tool_use"
      );

      // Add assistant response to messages
      messages.push({ role: "assistant", content: response.content });

      // Execute tools and build results
      const resultBlocks: ContentBlock[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = await options.onToolCall(toolUse.name, toolUse.input);
        toolResults.push({
          tool: toolUse.name,
          input: toolUse.input,
          result,
        });
        resultBlocks.push({
          type: "tool_result",
          toolUseId: toolUse.id,
          content: result,
        });
      }

      messages.push({ role: "user", content: resultBlocks });
      continue;
    }

    // Extract text response
    const text = response.content
      .filter((b): b is ContentBlock & { type: "text" } => b.type === "text")
      .map((b) => b.text)
      .join("");

    return { response: text, toolResults };
  }

  // Exhausted iterations — return whatever text we have
  const fallback = messages
    .filter((m) => m.role === "assistant")
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .filter((b): b is ContentBlock & { type: "text" } => typeof b === "object" && b.type === "text")
    .map((b) => b.text)
    .join("");
  return {
    response: fallback || "I've reached the maximum number of tool steps. Please try a simpler request.",
    toolResults,
  };
}

/** Streaming chat — yields chunks as they arrive. */
export async function* chatStream(options: ChatOptions): AsyncGenerator<StreamChunk> {
  const provider = resolveProvider(options);
  if (!provider) {
    yield { type: "text", content: "AI is not configured. Please set an API key in Settings to enable the companion." };
    yield { type: "done" };
    return;
  }

  const system = buildSystemMessage(options.financialContext, options.companionName, options.mode);
  // Interactive assembly is filtered by disabledToolNames (S3b §11); a
  // toolsOverride frozen allowlist (jobs), if ever passed, bypasses the filter.
  const tools = options.toolsOverride
    ? options.toolsOverride
    : filterTools([...getFinancialTools(), ...(options.extraTools ?? [])], options.disabledToolNames);

  const messages: LlmMessage[] = options.messages.map((m) => ({
    role: m.role,
    content: m.role === "user" && typeof m.content === "string"
      ? sanitizeUserMessage(m.content)
      : m.content,
  }));

  // Track whether the turn produced ANY visible output (text or an executed
  // tool). Some providers (e.g. small models on flaky multi-tool turns) return an
  // empty completion — without this we'd render a blank assistant bubble.
  let yieldedText = false;
  let ranTool = false;

  // Capped to prevent runaway tool loops
  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const events = provider.stream({
      messages,
      system,
      tools: options.onToolCall ? tools : undefined,
    });

    let lastResponse: { content: ContentBlock[]; stopReason: string } | null = null;

    for await (const event of events) {
      if (event.type === "text_delta") {
        if (event.text) yieldedText = true;
        yield { type: "text", content: event.text };
      } else if (event.type === "thinking_delta") {
        yield { type: "thinking", content: event.text };
      } else if (event.type === "tool_use") {
        yield { type: "tool_use", toolName: event.name, toolInput: event.input, nodeId: event.id, nodeKind: "tool" };
      } else if (event.type === "done") {
        lastResponse = event.response;
      }
    }

    // Handle tool use loop
    if (lastResponse?.stopReason === "tool_use" && options.onToolCall) {
      const toolUseBlocks = lastResponse.content.filter(
        (b): b is ContentBlock & { type: "tool_use" } => b.type === "tool_use"
      );

      const completedResults: ContentBlock[] = [];
      const pending: PendingToolUse[] = [];
      const inputRequests: PendingToolUse[] = [];
      const planRequests: PendingToolUse[] = [];

      for (const toolUse of toolUseBlocks) {
        if (isPlanTool(toolUse.name)) {
          planRequests.push({ requestId: toolUse.id, toolName: toolUse.name, toolInput: toolUse.input });
          continue;
        }

        if (isInputTool(toolUse.name)) {
          inputRequests.push({ requestId: toolUse.id, toolName: toolUse.name, toolInput: toolUse.input });
          continue;
        }

        const decision = options.resolvePermission
          ? options.resolvePermission(toolUse.name, toolUse.input)
          : "allow";

        if (decision === "deny") {
          // read_only write-mode clamp: refuse without executing (spec §4.4).
          const declined = JSON.stringify({
            declined: true,
            message: "This action is blocked: the AI is in read-only mode. Change the write mode in AI settings to allow data changes.",
          });
          yield { type: "tool_result", toolName: toolUse.name, toolResult: declined, nodeId: toolUse.id, nodeKind: "tool" };
          completedResults.push({ type: "tool_result", toolUseId: toolUse.id, content: declined });
          continue;
        }

        if (decision === "ask") {
          pending.push({ requestId: toolUse.id, toolName: toolUse.name, toolInput: toolUse.input });
          continue;
        }

        // Auto-allowed → execute now, with live status.
        ranTool = true;
        yield { type: "tool_status", toolName: toolUse.name, phase: "running", nodeId: toolUse.id, nodeKind: "tool" };
        let result: string;
        try {
          result = await options.onToolCall(toolUse.name, toolUse.input);
          yield { type: "tool_status", toolName: toolUse.name, phase: "done", nodeId: toolUse.id, nodeKind: "tool" };
        } catch (err) {
          result = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
          yield { type: "tool_status", toolName: toolUse.name, phase: "error", nodeId: toolUse.id, nodeKind: "tool" };
        }
        yield { type: "tool_result", toolName: toolUse.name, toolResult: result, nodeId: toolUse.id, nodeKind: "tool" };
        completedResults.push({ type: "tool_result", toolUseId: toolUse.id, content: result });
      }

      // Persist the assistant turn (it contains every tool_use id).
      // NOTE: any assistant text streamed before the tool calls is shown live but is
      // NOT separately persisted to aiMessages on pause (the `done` save never runs).
      // The model still sees it on resume via the persisted assistantBlocks; do not
      // "fix" this into a duplicate-save.
      messages.push({ role: "assistant", content: lastResponse.content });

      // Plan request takes precedence over input and permission (spec §4.1): a turn
      // pauses for EITHER plan, input, OR permission. Same-turn write/input/extra-plan
      // tools are deferred with a contract-safe tool_result so the provider's
      // "every tool_use needs a tool_result" rule holds on resume.
      if (planRequests.length > 0) {
        for (const p of pending) {
          completedResults.push({
            type: "tool_result",
            toolUseId: p.requestId,
            content: JSON.stringify({ deferred: true, message: "Reviewing the plan first; I'll revisit this." }),
          });
        }
        for (const i of inputRequests) {
          completedResults.push({
            type: "tool_result",
            toolUseId: i.requestId,
            content: JSON.stringify({ deferred: true, message: "Reviewing the plan first; I'll revisit this." }),
          });
        }
        const first = planRequests[0]!;
        for (const extra of planRequests.slice(1)) {
          completedResults.push({
            type: "tool_result",
            toolUseId: extra.requestId,
            content: JSON.stringify({ deferred: true, message: "One plan at a time." }),
          });
        }
        const spec = buildPlanSpec(first.toolName, first.toolInput);
        let pauseId: string | undefined;
        if (options.onPlanRequest) {
          pauseId = await options.onPlanRequest({
            assistantBlocks: lastResponse.content,
            completedResults,
            planToolUseId: first.requestId,
            spec,
          });
        }
        yield { type: "plan_request", pauseId, plan: spec };
        yield { type: "paused", pauseId };
        return;
      }

      // Input request takes precedence and is exclusive: a turn pauses for EITHER
      // input OR permission, never both (spec §7). Same-turn permission/extra-input
      // tools are deferred with a contract-safe tool_result so the provider's
      // "every tool_use needs a tool_result" rule still holds on resume.
      if (inputRequests.length > 0) {
        for (const p of pending) {
          completedResults.push({
            type: "tool_result",
            toolUseId: p.requestId,
            content: JSON.stringify({ deferred: true, message: "Collecting your input first; I'll revisit this." }),
          });
        }
        const first = inputRequests[0]!;
        for (const extra of inputRequests.slice(1)) {
          completedResults.push({
            type: "tool_result",
            toolUseId: extra.requestId,
            content: JSON.stringify({ deferred: true, message: "One input request at a time." }),
          });
        }
        const spec = buildInputFormSpec(first.toolName, first.toolInput);
        let pauseId: string | undefined;
        if (options.onInputRequest) {
          pauseId = await options.onInputRequest({
            assistantBlocks: lastResponse.content,
            completedResults,
            inputToolUseId: first.requestId,
            spec,
          });
        }
        yield { type: "input_request", pauseId, spec };
        yield { type: "paused", pauseId };
        return;
      }

      if (pending.length > 0) {
        let pauseId: string | undefined;
        if (options.onPause) {
          pauseId = await options.onPause({
            assistantBlocks: lastResponse.content,
            completedResults,
            pending,
          });
        }
        yield { type: "permission_request", actions: pending, pauseId };
        yield { type: "paused", pauseId };
        return;
      }

      messages.push({ role: "user", content: completedResults });
      continue;
    }

    // Terminal (no tool use this turn). If the whole turn produced nothing
    // visible — no text and no executed tool — emit a friendly fallback instead
    // of a blank bubble (guards against flaky empty provider completions).
    if (!yieldedText && !ranTool) {
      yield {
        type: "text",
        content: "I wasn't able to generate a response just now — please try asking again.",
      };
    }
    yield { type: "done" };
    return;
  }

  // Exhausted iterations
  yield { type: "text", content: "I've reached the maximum number of tool steps. Please try a simpler request." };
  yield { type: "done" };
}
