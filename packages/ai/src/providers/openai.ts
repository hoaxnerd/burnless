/**
 * OpenAI provider — GPT integration via the OpenAI SDK.
 *
 * Supports both OpenAI and OpenAI-compatible APIs (OpenRouter, Azure, etc.)
 * by configuring `baseUrl` in ProviderConfig.
 */

import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";
import { LlmProvider } from "./base";
import type {
  CompletionRequest,
  LlmResponse,
  StreamEvent,
  ContentBlock,
  ToolDefinition,
  StopReason,
  ProviderConfig,
  LlmMessage,
} from "./types";

/** Map our generic tool definitions to OpenAI's function-calling format. */
function toOpenAITools(tools: ToolDefinition[]): ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object" as const,
        properties: t.inputSchema.properties,
        required: t.inputSchema.required,
      },
    },
  }));
}

/** Map our generic messages to OpenAI's message format. */
function toOpenAIMessages(
  messages: LlmMessage[],
  system?: string
): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [];

  if (system) {
    result.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (typeof msg.content === "string") {
      result.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
      continue;
    }

    // Handle content blocks
    if (msg.role === "assistant") {
      // Collect text and tool_use blocks for the assistant message
      const textParts = msg.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");

      const toolCalls = msg.content
        .filter((b) => b.type === "tool_use")
        .map((b) => {
          const tu = b as { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
          return {
            id: tu.id,
            type: "function" as const,
            function: {
              name: tu.name,
              arguments: JSON.stringify(tu.input),
            },
          };
        });

      const assistantMsg: ChatCompletionMessageParam = {
        role: "assistant",
        content: textParts || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      };
      result.push(assistantMsg);
      continue;
    }

    if (msg.role === "user") {
      // Check if this contains tool_result blocks (these become separate "tool" messages)
      const toolResults = msg.content.filter((b) => b.type === "tool_result");
      const textBlocks = msg.content.filter((b) => b.type === "text");

      // Emit tool result messages first
      for (const tr of toolResults) {
        const toolResult = tr as { type: "tool_result"; toolUseId: string; content: string };
        result.push({
          role: "tool",
          tool_call_id: toolResult.toolUseId,
          content: toolResult.content,
        });
      }

      // Emit text content as user message if present
      if (textBlocks.length > 0) {
        const text = textBlocks
          .map((b) => (b as { type: "text"; text: string }).text)
          .join("");
        if (text) {
          result.push({ role: "user", content: text });
        }
      }
    }
  }

  return result;
}

/** Map OpenAI finish_reason to our generic StopReason. */
function mapStopReason(reason: string | null): StopReason {
  switch (reason) {
    case "stop":
      return "end_turn";
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    default:
      return "unknown";
  }
}

export class OpenAIProvider extends LlmProvider {
  private client: OpenAI;

  constructor(config: ProviderConfig) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey || undefined,
      baseURL: config.baseUrl || undefined,
      ...(config.extra?.organization
        ? { organization: config.extra.organization as string }
        : {}),
    });
  }

  async complete(request: CompletionRequest): Promise<LlmResponse> {
    const maxTokens = request.maxTokens ?? this.config.maxTokens ?? 4096;
    const messages = toOpenAIMessages(request.messages, request.system);

    const response = await this.client.chat.completions.create({
      model: this.config.model,
      max_tokens: maxTokens,
      messages,
      tools: request.tools?.length ? toOpenAITools(request.tools) : undefined,
    });

    const choice = response.choices[0];
    if (!choice) {
      return { content: [], stopReason: "unknown" };
    }

    const content: ContentBlock[] = [];

    // Add text content if present
    if (choice.message.content) {
      content.push({ type: "text", text: choice.message.content });
    }

    // Add tool calls if present
    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments),
        });
      }
    }

    return {
      content,
      stopReason: mapStopReason(choice.finish_reason),
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens ?? 0,
          }
        : undefined,
    };
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamEvent> {
    const maxTokens = request.maxTokens ?? this.config.maxTokens ?? 4096;
    const messages = toOpenAIMessages(request.messages, request.system);

    const openaiStream = await this.client.chat.completions.create({
      model: this.config.model,
      max_tokens: maxTokens,
      messages,
      tools: request.tools?.length ? toOpenAITools(request.tools) : undefined,
      stream: true,
      stream_options: { include_usage: true },
    });

    // Accumulate tool calls across chunks (OpenAI streams them incrementally)
    const toolCallAccumulators: Map<
      number,
      { id: string; name: string; arguments: string }
    > = new Map();
    let finishReason: string | null = null;
    let fullText = "";
    let usage: { inputTokens: number; outputTokens: number } | undefined;

    for await (const chunk of openaiStream as AsyncIterable<ChatCompletionChunk>) {
      // Track usage from the final chunk
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }

      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      finishReason = chunk.choices[0]?.finish_reason ?? finishReason;

      // Stream text deltas
      if (delta.content) {
        fullText += delta.content;
        yield { type: "text_delta", text: delta.content };
      }

      // Accumulate tool call deltas
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const existing = toolCallAccumulators.get(tc.index);
          if (!existing) {
            toolCallAccumulators.set(tc.index, {
              id: tc.id ?? "",
              name: tc.function?.name ?? "",
              arguments: tc.function?.arguments ?? "",
            });
          } else {
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments)
              existing.arguments += tc.function.arguments;
          }
        }
      }
    }

    // Build final content blocks
    const content: ContentBlock[] = [];
    if (fullText) {
      content.push({ type: "text", text: fullText });
    }

    // Emit accumulated tool calls
    for (const [, tc] of toolCallAccumulators) {
      const toolUseBlock: ContentBlock = {
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: JSON.parse(tc.arguments || "{}"),
      };
      content.push(toolUseBlock);
      yield {
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: toolUseBlock.input as Record<string, unknown>,
      };
    }

    yield {
      type: "done",
      response: {
        content,
        stopReason: mapStopReason(finishReason),
        usage,
      },
    };
  }
}
