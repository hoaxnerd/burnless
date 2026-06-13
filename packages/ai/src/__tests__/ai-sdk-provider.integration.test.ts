import { describe, it, expect } from "vitest";
import { AiSdkProvider, buildModel } from "../providers/ai-sdk-provider";
import type { ToolDefinition } from "../providers/types";

const KEY = process.env.OPENROUTER_API_KEY;
// Cheap, reliably tool-capable model on OpenRouter. Override with BURNLESS_TEST_MODEL.
const MODEL = process.env.BURNLESS_TEST_MODEL ?? "openai/gpt-4o-mini";

function makeProvider() {
  const config = { apiKey: KEY!, model: MODEL, maxTokens: 256 };
  return new AiSdkProvider(buildModel("openrouter", config), config);
}

describe.skipIf(!KEY)("AiSdkProvider live (OpenRouter)", () => {
  it("completes a plain text prompt and reports usage", async () => {
    const provider = makeProvider();
    const res = await provider.complete({
      messages: [{ role: "user", content: "Reply with exactly the word: pong" }],
      system: "You are a terse test fixture. Reply with one word.",
    });
    const text = res.content.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("");
    expect(text.toLowerCase()).toContain("pong");
    expect(res.stopReason).toBe("end_turn");
    expect(res.usage?.inputTokens).toBeGreaterThan(0);
    expect(res.usage?.outputTokens).toBeGreaterThan(0);
  }, 30_000);

  it("returns a tool_use block (does not auto-execute) when given a tool", async () => {
    const provider = makeProvider();
    const tools: ToolDefinition[] = [
      { name: "get_weather", description: "Get the current weather for a city.",
        inputSchema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } },
    ];
    const res = await provider.complete({
      messages: [{ role: "user", content: "What is the weather in Paris? Use the tool." }],
      tools,
    });
    const toolUse = res.content.find((b) => b.type === "tool_use") as { type: "tool_use"; name: string; input: Record<string, unknown> } | undefined;
    expect(toolUse).toBeDefined();
    expect(toolUse?.name).toBe("get_weather");
    expect(res.stopReason).toBe("tool_use");
  }, 30_000);

  it("streams text deltas and a final done event", async () => {
    const provider = makeProvider();
    const events: string[] = [];
    let doneText = "";
    for await (const ev of provider.stream({
      messages: [{ role: "user", content: "Count: one two three" }],
      system: "Echo the three words.",
    })) {
      events.push(ev.type);
      if (ev.type === "done") {
        doneText = ev.response.content.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text).join("");
      }
    }
    expect(events).toContain("text_delta");
    expect(events[events.length - 1]).toBe("done");
    expect(doneText.length).toBeGreaterThan(0);
  }, 30_000);
});
