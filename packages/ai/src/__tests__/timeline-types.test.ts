import { describe, it, expect } from "vitest";
import type { TimelineNode, TimelineNodeKind } from "../generative-ui";
import type { StreamChunk } from "../types";

describe("timeline node plumbing types", () => {
  it("TimelineNode union covers plan/tool/diff_gate/result/input", () => {
    const kinds: TimelineNodeKind[] = ["plan", "tool", "diff_gate", "result", "input"];
    expect(kinds).toHaveLength(5);
    const tool: TimelineNode = { id: "n1", kind: "tool", toolName: "show_runway", phase: "done" };
    const result: TimelineNode = { id: "n2", kind: "result", text: "Done", confidence: "high" };
    expect(tool.kind).toBe("tool");
    expect(result.kind).toBe("result");
  });

  it("StreamChunk carries optional nodeId + nodeKind", () => {
    const chunk: StreamChunk = { type: "tool_status", toolName: "show_runway", phase: "running", nodeId: "tu-1", nodeKind: "tool" };
    expect(chunk.nodeId).toBe("tu-1");
    expect(chunk.nodeKind).toBe("tool");
  });
});
