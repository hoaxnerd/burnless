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
  it("checks the HOME-level decoupled runtime (where install.sh --with-node provisions Node)", () => {
    // The provisioned Node lives at <home>/runtime, sibling to versions/ (survives update),
    // i.e. two levels up from the artifact dir. Regression: a launcher that only checked the
    // in-artifact runtime/ missed it → `exec: node: not found` when system node was absent.
    expect(s).toContain('"$DIR/../../runtime/bin/node"');
  });
  it("resolves its own dir so it works through the versions/current symlink", () => {
    expect(s).toContain("dirname");
  });
});
