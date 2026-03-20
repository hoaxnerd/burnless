/**
 * Core chat handler — orchestrates Claude API calls with financial context
 * and tool use. Supports both streaming and non-streaming modes.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, StreamChunk, ToolCallResult } from "./types";
import { financialTools } from "./tools";
import { buildSystemMessage } from "./prompts";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

interface ChatOptions {
  messages: ChatMessage[];
  financialContext: string;
  onToolCall?: (toolName: string, input: Record<string, unknown>) => Promise<string>;
}

/** Non-streaming chat — sends message and returns complete response. */
export async function chat(options: ChatOptions): Promise<{
  response: string;
  toolResults: ToolCallResult[];
}> {
  const anthropic = getClient();
  const systemMessage = buildSystemMessage(options.financialContext);

  const apiMessages: Anthropic.MessageParam[] = options.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const toolResults: ToolCallResult[] = [];
  let currentMessages = [...apiMessages];

  // Loop to handle multi-turn tool use
  while (true) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemMessage,
      messages: currentMessages,
      tools: options.onToolCall ? financialTools : undefined,
    });

    // Check if we need to handle tool calls
    if (response.stop_reason === "tool_use" && options.onToolCall) {
      // Collect all tool use blocks
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ContentBlockParam & { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
          b.type === "tool_use"
      );

      // Add assistant's response to messages
      currentMessages.push({ role: "assistant", content: response.content });

      // Execute tools and build tool_result content blocks
      const toolResultBlocks: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];
      for (const toolUse of toolUseBlocks) {
        const result = await options.onToolCall(toolUse.name, toolUse.input as Record<string, unknown>);
        toolResults.push({
          tool: toolUse.name,
          input: toolUse.input as Record<string, unknown>,
          result,
        });
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      currentMessages.push({ role: "user", content: toolResultBlocks });
      continue;
    }

    // Extract text response
    const textBlocks = response.content.filter(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    const responseText = textBlocks.map((b) => b.text).join("");

    return { response: responseText, toolResults };
  }
}

/** Streaming chat — yields chunks as they arrive. */
export async function* chatStream(options: ChatOptions): AsyncGenerator<StreamChunk> {
  const anthropic = getClient();
  const systemMessage = buildSystemMessage(options.financialContext);

  const apiMessages: Anthropic.MessageParam[] = options.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let currentMessages = [...apiMessages];

  while (true) {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemMessage,
      messages: currentMessages,
      tools: options.onToolCall ? financialTools : undefined,
    });

    let accumulatedContent: Anthropic.ContentBlock[] = [];
    let stopReason: string | null = null;

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        const delta = event.delta;
        if ("text" in delta) {
          yield { type: "text", content: delta.text };
        }
      } else if (event.type === "message_stop") {
        // Get the final message
        const finalMessage = await stream.finalMessage();
        accumulatedContent = finalMessage.content;
        stopReason = finalMessage.stop_reason;
      }
    }

    // Handle tool use
    if (stopReason === "tool_use" && options.onToolCall) {
      const toolUseBlocks = accumulatedContent.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      currentMessages.push({ role: "assistant", content: accumulatedContent });

      const toolResultBlocks: Array<{ type: "tool_result"; tool_use_id: string; content: string }> = [];
      for (const toolUse of toolUseBlocks) {
        yield { type: "tool_use", toolName: toolUse.name, toolInput: toolUse.input as Record<string, unknown> };

        const result = await options.onToolCall(toolUse.name, toolUse.input as Record<string, unknown>);

        yield { type: "tool_result", toolName: toolUse.name, toolResult: result };

        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }

      currentMessages.push({ role: "user", content: toolResultBlocks });
      continue;
    }

    yield { type: "done" };
    return;
  }
}
