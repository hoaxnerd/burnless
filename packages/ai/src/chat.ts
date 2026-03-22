/**
 * Core chat handler — orchestrates LLM calls with financial context
 * and tool use. Supports both streaming and non-streaming modes.
 *
 * Provider-agnostic: works with Anthropic, OpenAI, or any registered provider.
 */

import type { ChatMessage, StreamChunk, ToolCallResult } from "./types";
import { getFinancialTools } from "./tools";
import { buildSystemMessage } from "./prompts";
import {
  getProvider,
  createProvider,
  type LlmProvider,
  type LlmMessage,
  type ContentBlock,
  type CompletionRequest,
} from "./providers";
import { getProviderForFeature } from "./routing";
import { sanitizeUserMessage } from "./sanitize";

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
  /** AI feature name for model routing. Defaults to "chat". */
  feature?: string;
  /** Override provider config (e.g., from per-company DB settings). */
  providerConfig?: {
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };
}

/** Non-streaming chat — sends message and returns complete response. */
export async function chat(options: ChatOptions): Promise<{
  response: string;
  toolResults: ToolCallResult[];
}> {
  const provider = resolveProvider(options);
  if (!provider) {
    return {
      response: "AI is not configured. Please set an API key to enable the AI companion.",
      toolResults: [],
    };
  }

  const system = buildSystemMessage(options.financialContext);
  const tools = getFinancialTools();

  const messages: LlmMessage[] = options.messages.map((m) => ({
    role: m.role,
    content: m.role === "user" && typeof m.content === "string"
      ? sanitizeUserMessage(m.content)
      : m.content,
  }));

  const toolResults: ToolCallResult[] = [];

  // Loop to handle multi-turn tool use
  while (true) {
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
}

/** Streaming chat — yields chunks as they arrive. */
export async function* chatStream(options: ChatOptions): AsyncGenerator<StreamChunk> {
  const provider = resolveProvider(options);
  if (!provider) {
    yield { type: "text", content: "AI is not configured. Please set an API key to enable the AI companion." };
    yield { type: "done" };
    return;
  }

  const system = buildSystemMessage(options.financialContext);
  const tools = getFinancialTools();

  const messages: LlmMessage[] = options.messages.map((m) => ({
    role: m.role,
    content: m.role === "user" && typeof m.content === "string"
      ? sanitizeUserMessage(m.content)
      : m.content,
  }));

  while (true) {
    const events = provider.stream({
      messages,
      system,
      tools: options.onToolCall ? tools : undefined,
    });

    let lastResponse: { content: ContentBlock[]; stopReason: string } | null = null;

    for await (const event of events) {
      if (event.type === "text_delta") {
        yield { type: "text", content: event.text };
      } else if (event.type === "thinking_delta") {
        yield { type: "thinking", content: event.text };
      } else if (event.type === "tool_use") {
        yield { type: "tool_use", toolName: event.name, toolInput: event.input };
      } else if (event.type === "done") {
        lastResponse = event.response;
      }
    }

    // Handle tool use loop
    if (lastResponse?.stopReason === "tool_use" && options.onToolCall) {
      const toolUseBlocks = lastResponse.content.filter(
        (b): b is ContentBlock & { type: "tool_use" } => b.type === "tool_use"
      );

      messages.push({ role: "assistant", content: lastResponse.content });

      const resultBlocks: ContentBlock[] = [];
      for (const toolUse of toolUseBlocks) {
        const result = await options.onToolCall(toolUse.name, toolUse.input);
        yield { type: "tool_result", toolName: toolUse.name, toolResult: result };
        resultBlocks.push({
          type: "tool_result",
          toolUseId: toolUse.id,
          content: result,
        });
      }

      messages.push({ role: "user", content: resultBlocks });
      continue;
    }

    yield { type: "done" };
    return;
  }
}
