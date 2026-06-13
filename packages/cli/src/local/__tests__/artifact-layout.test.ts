import { isAbsolute } from "node:path";
import { describe, expect, it } from "vitest";
import { ARTIFACT_LAYOUT, ARTIFACT_LAYOUT_VERSION, ARTIFACT_MARKER } from "../artifact-layout";

describe("artifact-layout", () => {
  it("marker is a dotfile and every layout path is relative", () => {
    expect(ARTIFACT_MARKER).toBe(".burnless-artifact");
    for (const p of Object.values(ARTIFACT_LAYOUT)) {
      expect(isAbsolute(p)).toBe(false);
      expect(p.startsWith("/")).toBe(false);
    }
  });
  it("exposes the load-bearing staged paths", () => {
    expect(ARTIFACT_LAYOUT.cliEntry).toBe("cli/index.js");
    expect(ARTIFACT_LAYOUT.serverEntry).toBe("web/apps/web/server.js");
    expect(ARTIFACT_LAYOUT.migrationsDir).toBe("drizzle");
    expect(ARTIFACT_LAYOUT.vectorBundle).toBe("node_modules/@electric-sql/pglite-pgvector/dist/vector.tar.gz");
    expect(ARTIFACT_LAYOUT.managedNode).toBe("runtime/bin/node");
  });
  it("declares a layout version (bump on any incompatible move)", () => {
    expect(ARTIFACT_LAYOUT_VERSION).toBeGreaterThanOrEqual(1);
  });
});
