/**
 * Anthropic provider — Claude integration via the Anthropic SDK.
 */

import Anthropic from "@anthropic-ai/sdk";
import { LlmProvider } from "./base";
import type {
  CompletionRequest,
  LlmResponse,
  StreamEvent,
  ContentBlock,
  ToolDefinition,
  StopReason,
  ProviderConfig,
} from "./types";

/** Map our generic tool definitions to Anthropic's format. */
function toAnthropicTools(
  tools: ToolDefinition[]
): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: "object" as const,
      properties: t.inputSchema.properties,
      required: t.inputSchema.required,
    },
  }));
}

/** Map Anthropic content blocks to our generic format (skip thinking blocks). */
function fromAnthropicContent(
  blocks: Anthropic.ContentBlock[]
): ContentBlock[] {
  return blocks
    .filter((b) => b.type === "text" || b.type === "tool_use")
    .map((b) => {
      if (b.type === "text") {
        return { type: "text" as const, text: b.text };
      }
      if (b.type === "tool_use") {
        return {
          type: "tool_use" as const,
          id: b.id,
          name: b.name,
          input: b.input as Record<string, unknown>,
        };
      }
      return { type: "text" as const, text: "" };
    });
}

function mapStopReason(reason: string | null): StopReason {
  switch (reason) {
    case "end_turn":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    default:
      return "unknown";
  }
}

export class AnthropicProvider extends LlmProvider {
  private client: Anthropic;

  constructor(config: ProviderConfig) {
    super(config);
    this.client = new Anthropic({
      apiKey: config.apiKey || undefined,
      baseURL: config.baseUrl || undefined,
    });
  }

  async complete(request: CompletionRequest): Promise<LlmResponse> {
    const maxTokens = request.maxTokens ?? this.config.maxTokens ?? 4096;

    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: maxTokens,
      system: request.system ?? undefined,
      messages: request.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string"
            ? m.content
            : m.content.map((b) => {
                if (b.type === "tool_result") {
                  return {
                    type: "tool_result" as const,
                    tool_use_id: b.toolUseId,
                    content: b.content,
                  };
                }
                if (b.type === "tool_use") {
                  return {
                    type: "tool_use" as const,
                    id: b.id,
                    name: b.name,
                    input: b.input,
                  };
                }
                return { type: "text" as const, text: b.text };
              }),
        })),
      tools: request.tools ? toAnthropicTools(request.tools) : undefined,
    });

    return {
      content: fromAnthropicContent(response.content),
      stopReason: mapStopReason(response.stop_reason),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamEvent> {
    const maxTokens = request.maxTokens ?? this.config.maxTokens ?? 4096;

    const anthropicStream = this.client.messages.stream({
      model: this.config.model,
      max_tokens: maxTokens,
      system: request.system ?? undefined,
      messages: request.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string"
            ? m.content
            : m.content.map((b) => {
                if (b.type === "tool_result") {
                  return {
                    type: "tool_result" as const,
                    tool_use_id: b.toolUseId,
                    content: b.content,
                  };
                }
                if (b.type === "tool_use") {
                  return {
                    type: "tool_use" as const,
                    id: b.id,
                    name: b.name,
                    input: b.input,
                  };
                }
                return { type: "text" as const, text: b.text };
              }),
        })),
      tools: request.tools ? toAnthropicTools(request.tools) : undefined,
    });

    let finalResponse: LlmResponse | null = null;

    for await (const event of anthropicStream) {
      if (event.type === "content_block_delta") {
        const delta = event.delta as unknown as Record<string, unknown>;
        if (delta.type === "text_delta" && typeof delta.text === "string") {
          yield { type: "text_delta", text: delta.text };
        } else if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
          yield { type: "thinking_delta", text: delta.thinking };
        }
      } else if (event.type === "message_stop") {
        const msg = await anthropicStream.finalMessage();
        finalResponse = {
          content: fromAnthropicContent(msg.content),
          stopReason: mapStopReason(msg.stop_reason),
          usage: {
            inputTokens: msg.usage.input_tokens,
            outputTokens: msg.usage.output_tokens,
          },
        };
      }
    }

    if (finalResponse) {
      // Emit tool_use events for any tool calls in the final response
      for (const block of finalResponse.content) {
        if (block.type === "tool_use") {
          yield { type: "tool_use", id: block.id, name: block.name, input: block.input };
        }
      }
      yield { type: "done", response: finalResponse };
    }
  }
}
