import { afterEach, describe, expect, it } from "vitest";
import { bold, red, setColorOverride } from "../ansi";

afterEach(() => setColorOverride(undefined));

describe("color gate", () => {
  it("disables color when overridden off (the --no-color path)", () => {
    setColorOverride(false);
    expect(bold("x")).toBe("x");
    expect(red("x")).toBe("x");
  });
  it("enables color when overridden on regardless of TTY", () => {
    setColorOverride(true);
    expect(bold("x")).toBe("\x1b[1mx\x1b[22m");
    expect(red("x")).toBe("\x1b[31mx\x1b[39m");
  });
});
