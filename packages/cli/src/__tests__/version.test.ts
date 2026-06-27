import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLI_VERSION, versionString } from "../version";

describe("CLI_VERSION", () => {
  // Guards the source-of-truth drift that shipped burnless@0.3.0 mislabeled: CLI_VERSION
  // (baked into the binary) and package.json (the npm version) must always agree. The
  // prepublishOnly guard catches a stale BUILT dist; this catches the bump being forgotten.
  it("matches package.json (both must be bumped together)", () => {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
    const pkgVersion = JSON.parse(readFileSync(pkgPath, "utf8")).version;
    expect(CLI_VERSION).toBe(pkgVersion);
  });
});

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
