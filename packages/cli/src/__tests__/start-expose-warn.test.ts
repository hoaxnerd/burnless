import { describe, expect, it } from "vitest";
import { exposeWarning } from "../commands/start";

describe("exposeWarning", () => {
  it("warns when exposing a non-loopback host with an unclaimed owner", () => {
    expect(exposeWarning("0.0.0.0", false)).toMatch(/unclaimed|password/i);
  });
  it("is empty for loopback", () => {
    expect(exposeWarning("127.0.0.1", false)).toBe("");
  });
  it("is empty when the owner is claimed", () => {
    expect(exposeWarning("0.0.0.0", true)).toBe("");
  });
});
