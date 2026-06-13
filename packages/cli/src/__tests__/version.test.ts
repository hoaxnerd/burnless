import { describe, expect, it } from "vitest";
import { CLI_VERSION, versionString } from "../version";

describe("versionString", () => {
  it("returns the bare version when no build metadata", () => {
    expect(versionString({})).toBe(CLI_VERSION);
  });
  it("appends commit + date when injected at build", () => {
    expect(versionString({ BURNLESS_BUILD_SHA: "abc1234", BURNLESS_BUILD_DATE: "2026-06-13" })).toBe(
      `${CLI_VERSION} (abc1234, 2026-06-13)`,
    );
  });
  it("tolerates only one metadata field", () => {
    expect(versionString({ BURNLESS_BUILD_SHA: "abc1234" })).toBe(`${CLI_VERSION} (abc1234)`);
  });
});
