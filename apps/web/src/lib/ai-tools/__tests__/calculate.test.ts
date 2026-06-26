import { describe, it, expect } from "vitest";
import { calculateHandler, calculateSchema } from "../calculate";

const run = (expression: unknown) =>
  calculateHandler({ expression }, { userId: "u1" }).then((s) => JSON.parse(s));

describe("calculate handler", () => {
  it("evaluates plain arithmetic exactly", async () => {
    const out = await run("(1200*12)+3500/2");
    expect(out).toEqual({ expression: "(1200*12)+3500/2", result: 16150 });
  });

  it("evaluates whitelisted functions", async () => {
    expect((await run("floor(7/2)")).result).toBe(3);
    expect((await run("max(3, 9, 5)")).result).toBe(9);
    expect((await run("round(2.5)")).result).toBe(3);
    expect((await run("sqrt(144)")).result).toBe(12);
    expect((await run("pow(2, 10)")).result).toBe(1024);
  });

  it("returns a legitimate zero result (not an error)", async () => {
    const out = await run("5 - 5");
    expect(out.result).toBe(0);
    expect(out.error).toBeUndefined();
  });

  it("rejects disallowed keywords with an error, never throws", async () => {
    for (const expr of [
      "process.exit(1)",
      "import('fs')",
      "constructor.constructor('return 1')()",
      "({}).__proto__",
      "require('fs')",
    ]) {
      const out = await run(expr);
      expect(out.error, `${expr} should error`).toBeTruthy();
      expect(out.result).toBeUndefined();
    }
  });

  it("returns an error for malformed input without throwing", async () => {
    const out = await run("2 +* 3");
    expect(out.error).toBeTruthy();
    expect(out.result).toBeUndefined();
  });

  it("rejects a non-string / empty expression via the schema", async () => {
    const empty = await run("");
    expect(empty.error).toBeTruthy();
    expect(calculateSchema.safeParse({ expression: 42 }).success).toBe(false);
    expect(calculateSchema.safeParse({ expression: "1+1" }).success).toBe(true);
  });
});
