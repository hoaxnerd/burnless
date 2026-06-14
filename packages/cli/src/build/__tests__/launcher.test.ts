import { describe, expect, it } from "vitest";
import { renderLauncherScript } from "../launcher";

describe("renderLauncherScript", () => {
  const s = renderLauncherScript();
  it("is a POSIX sh script that execs the CLI entry", () => {
    expect(s.startsWith("#!/bin/sh\n")).toBe(true);
    expect(s).toContain("cli/index.js");
    expect(s).toContain("exec");
  });
  it("honors BURNLESS_NODE, then a managed runtime, then system node (mirrors resolveNodeBinary)", () => {
    expect(s).toContain("BURNLESS_NODE");
    expect(s).toContain("runtime/bin/node");
  });
  it("resolves its own dir so it works through the versions/current symlink", () => {
    expect(s).toContain("dirname");
  });
});
