import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isEntryPoint } from "../index";

// Regression: the fat-artifact entry guard used to compare import.meta.url
// (symlink-resolved by Node) against the RAW process.argv[1]. Any symlink in the
// invocation path (npm global-bin shims, nvm/volta/asdf, macOS /tmp →
// /private/tmp) made them differ, so the CLI exited 0 doing nothing. isEntryPoint
// realpaths BOTH sides; a symlinked argv must still resolve as the entry.
describe("isEntryPoint (symlink-robust main-module guard)", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "burnless-entry-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("matches when argv1 is a symlink pointing at the module's real file", () => {
    const real = join(dir, "cli.js");
    writeFileSync(real, "// entry");
    const link = join(dir, "cli-link.js");
    symlinkSync(real, link);
    const selfUrl = pathToFileURL(real).href; // import.meta.url is already realpath'd
    expect(isEntryPoint(selfUrl, link)).toBe(true); // invoked via the symlink
    expect(isEntryPoint(selfUrl, real)).toBe(true); // invoked directly
  });

  it("does not match an unrelated file", () => {
    const real = join(dir, "cli.js");
    const other = join(dir, "other.js");
    writeFileSync(real, "// entry");
    writeFileSync(other, "// other");
    expect(isEntryPoint(pathToFileURL(real).href, other)).toBe(false);
  });

  it("returns false when argv1 is undefined (imported, not executed)", () => {
    const real = join(dir, "cli.js");
    writeFileSync(real, "// entry");
    expect(isEntryPoint(pathToFileURL(real).href, undefined)).toBe(false);
  });
});
