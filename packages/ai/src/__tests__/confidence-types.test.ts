// packages/ai/src/__tests__/confidence-types.test.ts
import { describe, it, expect } from "vitest";
import type { UiBlock, GenuiResultEnvelope } from "../generative-ui";
import type { StreamChunk } from "../types";

describe("confidence + rationale plumbing types", () => {
  it("UiBlock accepts optional confidence + rationale", () => {
    const block: UiBlock = { id: "b1", component: "metric_card", props: {}, confidence: "high", rationale: "because you said add MRR" };
    expect(block.confidence).toBe("high");
    expect(block.rationale).toContain("because");
  });

  it("GenuiResultEnvelope carries render/modelResult/confidence/rationale", () => {
    const env: GenuiResultEnvelope = {
      render: { component: "metric_card", props: { value: 1 } },
      modelResult: "[metric_card shown]",
      confidence: "low",
      rationale: "estimate",
    };
    expect(env.render?.component).toBe("metric_card");
    expect(env.confidence).toBe("low");
  });

  it("StreamChunk accepts confidence + rationale on a result node", () => {
    const chunk: StreamChunk = { type: "tool_result", toolName: "show_runway", confidence: "high", rationale: "from current burn" };
    expect(chunk.confidence).toBe("high");
  });
});
