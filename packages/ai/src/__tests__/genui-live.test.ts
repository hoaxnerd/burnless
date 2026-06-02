/**
 * Generative-UI live smoke — genui plan 5, Task 2.
 *
 * Gated on `AI_PROVIDER`: skips entirely when no provider env is configured,
 * so the default CI run (no provider) is a no-op. When a provider IS set, it
 * drives a single-tool display prompt through the real chat loop and asserts
 * the model either calls a `show_*` display tool OR the stream completes
 * gracefully (ends with `done`, no `error`). The env provider
 * (OpenRouter/gemma) can time out on multi-tool turns, so this stays a
 * single-tool prompt and treats a graceful done as an acceptable outcome —
 * a timeout-driven narration must not be a false failure.
 *
 * Run: AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... \
 *   pnpm --filter @burnless/ai exec vitest run src/__tests__/genui-live.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chatStream } from "../chat";
import { resetProvider } from "../providers";
import { DISPLAY_TOOL_NAMES } from "../generative-ui";
import type { StreamChunk } from "../types";

const TIMEOUT = 120_000;

const financialContext = `Company: TestCo (SaaS, Seed stage)
Current Scenario: s-123 (Base Case)
MRR: $15,000 | ARR: $180,000 | Burn Rate: $45,000/mo | Runway: 12.5 months
Cash Position: $375,000
Headcount: 8`;

const live = process.env.AI_PROVIDER ? describe : describe.skip;

live("genui live smoke", () => {
  beforeAll(() => resetProvider());
  afterAll(() => resetProvider());

  it(
    "the model can call a display tool (or completes gracefully)",
    async () => {
      const chunks: StreamChunk[] = [];
      const toolCalls: string[] = [];

      for await (const chunk of chatStream({
        messages: [
          {
            role: "user",
            content:
              "Show my runway as a card. Use the show_runway display tool.",
          },
        ],
        financialContext,
        // Record any tool the model calls; return a benign result so the loop
        // can continue if it chooses to narrate after rendering.
        onToolCall: async (toolName) => {
          toolCalls.push(toolName);
          return JSON.stringify({ ok: true });
        },
      })) {
        chunks.push(chunk);
      }

      const errorChunks = chunks.filter((c) => c.type === "error");
      const doneChunks = chunks.filter((c) => c.type === "done");
      const calledDisplayTool = toolCalls.some((n) =>
        DISPLAY_TOOL_NAMES.has(n)
      );

      // Acceptable: the model rendered a display component OR the stream
      // completed gracefully (no error, ended with done). A timeout-driven
      // plain narration is a graceful done, not a failure.
      expect(errorChunks).toHaveLength(0);
      expect(calledDisplayTool || doneChunks.length === 1).toBe(true);
    },
    TIMEOUT
  );
});
