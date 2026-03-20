/**
 * LlmProvider — the contract every AI provider must implement.
 *
 * Application code programs to this interface, never to a specific SDK.
 * To add a new provider (OpenAI, OpenRouter, Gemini, Mistral, local):
 *   1. Create a new file in providers/
 *   2. Implement LlmProvider
 *   3. Register it in the factory (see ./index.ts)
 */

import type {
  CompletionRequest,
  LlmResponse,
  StreamEvent,
  ProviderConfig,
} from "./types";

export abstract class LlmProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /** Synchronous completion — returns full response when done. */
  abstract complete(request: CompletionRequest): Promise<LlmResponse>;

  /** Streaming completion — yields events as they arrive. */
  abstract stream(request: CompletionRequest): AsyncGenerator<StreamEvent>;

  /** Simple text completion — convenience for one-shot prompts without tools. */
  async generateText(prompt: string, system?: string): Promise<string> {
    const response = await this.complete({
      messages: [{ role: "user", content: prompt }],
      system,
    });

    return response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  get modelId(): string {
    return this.config.model;
  }
}
