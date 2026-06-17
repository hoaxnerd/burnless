import { describe, it, expect } from "vitest";
import { toolSignature, seedSignatureCounts, checkGuard } from "../tool-loop-guard";
import type { LlmMessage } from "../providers";

const LIMITS = { soft: 3, hard: 5 };

describe("toolSignature", () => {
  it("is order-insensitive on input keys", () => {
    expect(toolSignature("create_scenario", { a: 1, b: 2 }))
      .toBe(toolSignature("create_scenario", { b: 2, a: 1 }));
  });
  it("differs by tool name and by input", () => {
    expect(toolSignature("x", { a: 1 })).not.toBe(toolSignature("y", { a: 1 }));
    expect(toolSignature("x", { a: 1 })).not.toBe(toolSignature("x", { a: 2 }));
  });
});

describe("seedSignatureCounts", () => {
  it("counts assistant tool_use blocks only since the last user TEXT message", () => {
    const messages: LlmMessage[] = [
      { role: "user", content: "old turn" },
      { role: "assistant", content: [{ type: "tool_use", id: "1", name: "create_scenario", input: { name: "X" } }] },
      { role: "user", content: "new turn" },
      { role: "assistant", content: [{ type: "tool_use", id: "2", name: "create_scenario", input: { name: "Y" } }] },
      { role: "user", content: [{ type: "tool_result", toolUseId: "2", content: "ok" }] },
    ];
    const counts = seedSignatureCounts(messages);
    expect(counts.get(toolSignature("create_scenario", { name: "Y" }))).toBe(1);
    expect(counts.get(toolSignature("create_scenario", { name: "X" }))).toBeUndefined();
  });
});

describe("checkGuard", () => {
  it("executes distinct calls, never accumulating", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 6; i++) {
      const d = checkGuard(counts, "record_transaction", { amount: i }, LIMITS);
      expect(d.action).toBe("execute");
    }
  });
  it("steers on the soft-th identical call, hard-stops on the hard-th", () => {
    const counts = new Map<string, number>();
    const call = () => checkGuard(counts, "create_scenario", { name: "X" }, LIMITS);
    expect(call().action).toBe("execute"); // 1
    expect(call().action).toBe("execute"); // 2
    expect(call().action).toBe("steer");   // 3 (soft)
    expect(call().action).toBe("steer");   // 4
    expect(call().action).toBe("stop");    // 5 (hard)
  });
  it("seeded counts carry across a resume", () => {
    const counts = new Map<string, number>();
    counts.set(toolSignature("create_scenario", { name: "X" }), 2);
    expect(checkGuard(counts, "create_scenario", { name: "X" }, LIMITS).action).toBe("steer");
  });
});
