/**
 * AiSdkProvider — the single LlmProvider implementation, backed by the Vercel AI SDK.
 *
 * All Vercel AI SDK usage is confined to this file. Application code (chat.ts, etc.)
 * speaks only our neutral types. To add a provider, add a `kind` to the catalog (P2);
 * the OpenAI-compatible escape hatch already covers any OpenAI-shaped endpoint.
 */
import { tool, jsonSchema, generateText, streamText, type ModelMessage, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { LlmProvider } from "./base";
import { EmptyCompletionError } from "./resilience";
import type {
  CompletionRequest,
  LlmResponse,
  StreamEvent,
  LlmMessage,
  ProviderConfig,
  ToolDefinition,
  ContentBlock,
  StopReason,
} from "./types";

export type SdkKind = "anthropic" | "openai" | "openai-compatible";

export interface ProviderSpec {
  sdk: SdkKind;
  apiKey?: string;
  baseURL?: string;
  modelId: string;
  headers?: Record<string, string>;
}

/** OpenAI-compatible base URLs for known kinds (preserves the pre-AI-SDK factory behavior). */
const OPENAI_COMPAT_BASE_URLS: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434/v1",
};

/**
 * Pure: map a provider kind + our ProviderConfig to which AI-SDK family to instantiate.
 * anthropic/openai use their first-party packages; everything else (openrouter, ollama,
 * openai-compatible, or any unknown kind) uses the OpenAI-compatible escape hatch.
 */
export function resolveProviderSpec(kind: string, config: ProviderConfig): ProviderSpec {
  const headers = config.extra?.headers as Record<string, string> | undefined;
  if (kind === "anthropic") {
    return { sdk: "anthropic", apiKey: config.apiKey, baseURL: config.baseUrl, modelId: config.model, headers };
  }
  if (kind === "openai") {
    return { sdk: "openai", apiKey: config.apiKey, baseURL: config.baseUrl, modelId: config.model, headers };
  }
  const baseURL =
    config.baseUrl ??
    (kind === "ollama" ? process.env.OLLAMA_BASE_URL ?? OPENAI_COMPAT_BASE_URLS.ollama : OPENAI_COMPAT_BASE_URLS[kind]);
  // Ollama ignores the key but the SDK requires a non-empty one.
  const apiKey = kind === "ollama" ? config.apiKey || "ollama" : config.apiKey;
  return { sdk: "openai-compatible", apiKey, baseURL, modelId: config.model, headers };
}

/**
 * Pure: map our LlmMessage[] to AI-SDK ModelMessage[]. System prompt is passed
 * separately via generateText's `system` arg, so system-role messages are dropped.
 * tool_result parts need a toolName (v6 requires it); we recover it from the
 * matching prior tool-call by toolUseId.
 */
export function toModelMessages(messages: LlmMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  const toolNameById = new Map<string, string>();

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (typeof msg.content === "string") {
      out.push({ role: msg.role as "user" | "assistant", content: msg.content });
      continue;
    }

    if (msg.role === "assistant") {
      const parts = msg.content.map((b) => {
        if (b.type === "tool_use") {
          toolNameById.set(b.id, b.name);
          return { type: "tool-call" as const, toolCallId: b.id, toolName: b.name, input: b.input };
        }
        if (b.type === "text") return { type: "text" as const, text: b.text };
        return null;
      }).filter((p): p is NonNullable<typeof p> => p !== null);
      out.push({ role: "assistant", content: parts } as Extract<ModelMessage, { role: "assistant" }>);
      continue;
    }

    // user role: tool_result parts become a separate `tool` message; text stays as user text.
    const toolResults = msg.content.filter((b) => b.type === "tool_result");
    const textBlocks = msg.content.filter((b) => b.type === "text");

    if (toolResults.length > 0) {
      out.push({
        role: "tool",
        content: toolResults.map((tr) => {
          const r = tr as { type: "tool_result"; toolUseId: string; content: string };
          return {
            type: "tool-result" as const,
            toolCallId: r.toolUseId,
            toolName: toolNameById.get(r.toolUseId) ?? "",
            output: { type: "text" as const, value: r.content },
          };
        }),
      } as Extract<ModelMessage, { role: "tool" }>);
    }
    if (textBlocks.length > 0) {
      const text = textBlocks.map((b) => (b as { type: "text"; text: string }).text).join("");
      if (text) out.push({ role: "user", content: text });
    }
  }

  return out;
}

/** Pure: map our JSON-Schema tool defs to an AI-SDK ToolSet (no execute → manual loop). */
export function toAiSdkTools(tools: ToolDefinition[]): Record<string, ReturnType<typeof tool>> {
  const set: Record<string, ReturnType<typeof tool>> = {};
  for (const t of tools) {
    set[t.name] = tool({
      description: t.description,
      inputSchema: jsonSchema(t.inputSchema as Record<string, unknown>),
    });
  }
  return set;
}

/** Pure: AI-SDK finishReason → our StopReason. */
export function mapFinishReason(reason: string): StopReason {
  switch (reason) {
    case "stop": return "end_turn";
    case "tool-calls": return "tool_use";
    case "length": return "max_tokens";
    default: return "unknown";
  }
}

interface AiContentPart { type: string; text?: string; toolCallId?: string; toolName?: string; input?: unknown }

/** Pure: AI-SDK result.content parts → our ContentBlock[] (text + tool_use only). */
export function fromContentParts(parts: AiContentPart[]): ContentBlock[] {
  const out: ContentBlock[] = [];
  for (const p of parts) {
    if (p.type === "text" && typeof p.text === "string") {
      out.push({ type: "text", text: p.text });
    } else if (p.type === "tool-call" && p.toolCallId && p.toolName) {
      out.push({ type: "tool_use", id: p.toolCallId, name: p.toolName, input: (p.input ?? {}) as Record<string, unknown> });
    }
  }
  return out;
}

interface AiStreamPart {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  finishReason?: string;
  error?: unknown;
}

/** Pure: a single fullStream part → our StreamEvent, or null if we don't surface it. */
export function streamPartToEvent(part: AiStreamPart): StreamEvent | null {
  switch (part.type) {
    case "text-delta":
      return { type: "text_delta", text: part.text ?? "" };
    case "reasoning-delta":
      return { type: "thinking_delta", text: part.text ?? "" };
    case "tool-call":
      return { type: "tool_use", id: part.toolCallId ?? "", name: part.toolName ?? "", input: (part.input ?? {}) as Record<string, unknown> };
    case "error":
      // Errors are surfaced as a throw from stream() (so the resilience layer can
      // retry), not emitted as an event.
      return null;
    default:
      return null;
  }
}

/** Build an AI-SDK LanguageModel for a provider kind + config. */
export function buildModel(kind: string, config: ProviderConfig): LanguageModel {
  const spec = resolveProviderSpec(kind, config);
  if (spec.sdk === "anthropic") {
    return createAnthropic({ apiKey: spec.apiKey || undefined, baseURL: spec.baseURL || undefined, headers: spec.headers })(spec.modelId);
  }
  if (spec.sdk === "openai") {
    return createOpenAI({ apiKey: spec.apiKey || undefined, baseURL: spec.baseURL || undefined, headers: spec.headers })(spec.modelId);
  }
  return createOpenAICompatible({
    name: kind,
    apiKey: spec.apiKey || undefined,
    baseURL: spec.baseURL ?? "",
    headers: spec.headers,
  })(spec.modelId);
}

/** The single LlmProvider implementation, backed by the Vercel AI SDK. */
export class AiSdkProvider extends LlmProvider {
  private model: LanguageModel;

  constructor(model: LanguageModel, config: ProviderConfig) {
    super(config);
    this.model = model;
  }

  async complete(request: CompletionRequest): Promise<LlmResponse> {
    const result = await generateText({
      model: this.model,
      system: request.system,
      messages: toModelMessages(request.messages),
      tools: request.tools?.length ? toAiSdkTools(request.tools) : undefined,
      maxOutputTokens: request.maxTokens ?? this.config.maxTokens ?? 4096,
    });
    const content = fromContentParts(result.content as AiContentPart[]);
    if (content.length === 0) {
      throw new EmptyCompletionError(typeof this.model === "string" ? this.model : (this.config.model ?? "unknown"));
    }
    return {
      content,
      stopReason: mapFinishReason(result.finishReason),
      usage: result.usage
        ? { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 }
        : undefined,
    };
  }

  async *stream(request: CompletionRequest): AsyncGenerator<StreamEvent> {
    const result = streamText({
      model: this.model,
      system: request.system,
      messages: toModelMessages(request.messages),
      tools: request.tools?.length ? toAiSdkTools(request.tools) : undefined,
      maxOutputTokens: request.maxTokens ?? this.config.maxTokens ?? 4096,
    });

    let fullText = "";
    const toolBlocks: ContentBlock[] = [];
    let finishReason: StopReason = "unknown";
    let usage: { inputTokens: number; outputTokens: number } | undefined;

    let streamError: Error | undefined;
    for await (const part of result.fullStream as AsyncIterable<AiStreamPart>) {
      if (part.type === "error") {
        // Surface as a throw after the loop so the resilience layer can retry.
        streamError = part.error instanceof Error ? part.error : new Error(String(part.error));
        continue;
      }
      if (part.type === "text-delta") fullText += part.text ?? "";
      if (part.type === "tool-call") {
        toolBlocks.push({ type: "tool_use", id: part.toolCallId ?? "", name: part.toolName ?? "", input: (part.input ?? {}) as Record<string, unknown> });
      }
      if (part.type === "finish") {
        finishReason = mapFinishReason(part.finishReason ?? "unknown");
        const u = (part as { totalUsage?: { inputTokens?: number; outputTokens?: number } }).totalUsage;
        if (u) usage = { inputTokens: u.inputTokens ?? 0, outputTokens: u.outputTokens ?? 0 };
      }
      const event = streamPartToEvent(part);
      if (event) yield event;
    }

    if (streamError) throw streamError;
    if (!fullText && toolBlocks.length === 0) {
      throw new EmptyCompletionError(typeof this.model === "string" ? this.model : (this.config.model ?? "unknown"));
    }

    const content: ContentBlock[] = [];
    if (fullText) content.push({ type: "text", text: fullText });
    content.push(...toolBlocks);
    yield { type: "done", response: { content, stopReason: finishReason, usage } };
  }
}
