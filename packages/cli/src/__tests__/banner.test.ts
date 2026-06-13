import { afterEach, describe, expect, it } from "vitest";
import { renderBanner } from "../banner";
import { setColorOverride } from "../ansi";

afterEach(() => setColorOverride(undefined));

describe("renderBanner", () => {
  it("includes the wordmark and tagline", () => {
    setColorOverride(false);
    const out = renderBanner("1.2.3");
    expect(out).toContain("burnless");
    expect(out).toContain("1.2.3");
    expect(out).not.toContain("\x1b["); // no color when off
  });
  it("emits ANSI when color is on", () => {
    setColorOverride(true);
    expect(renderBanner("1.2.3")).toContain("\x1b[");
  });
});
