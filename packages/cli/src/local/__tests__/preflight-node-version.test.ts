import { describe, expect, it } from "vitest";
import { assertNodeVersion } from "../preflight";
import { UsageError } from "../../errors";

describe("assertNodeVersion", () => {
  it("passes for the current runtime (>= 20.9.0)", () => { expect(() => assertNodeVersion()).not.toThrow(); });
  it("passes at exactly the floor", () => { expect(() => assertNodeVersion("20.9.0")).not.toThrow(); });
  it("throws a UsageError below the floor", () => {
    expect(() => assertNodeVersion("20.8.0")).toThrow(UsageError);
    expect(() => assertNodeVersion("18.20.4")).toThrow(/20\.9\.0/);
  });
});
