import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requiredArtifactPaths, verifyArtifact } from "../required-files";
import { buildManifest, verifyManifest } from "../manifest";

let root: string;
function touch(rel: string, body = "x"): void {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, body);
}
function stageComplete(): void {
  for (const rel of requiredArtifactPaths()) touch(rel, rel);
}
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "burnless-build-")); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("requiredArtifactPaths", () => {
  it("includes the marker, CLI entry, server entry, migrations journal, and PGLite assets", () => {
    const req = requiredArtifactPaths();
    expect(req).toContain(".burnless-artifact");
    expect(req).toContain("cli/index.js");
    expect(req).toContain("web/apps/web/server.js");
    expect(req).toContain("drizzle/meta/_journal.json");
    expect(req).toContain("node_modules/@electric-sql/pglite/dist/pglite.wasm");
    expect(req).toContain("node_modules/@electric-sql/pglite/dist/pglite.data");
    expect(req).toContain("node_modules/@electric-sql/pglite-pgvector/dist/vector.tar.gz");
  });
});

describe("verifyArtifact", () => {
  it("reports every missing required path", () => {
    touch("cli/index.js");
    const missing = verifyArtifact(root);
    expect(missing).toContain(".burnless-artifact");
    expect(missing).not.toContain("cli/index.js");
  });
  it("returns [] when all required paths are present", () => {
    stageComplete();
    expect(verifyArtifact(root)).toEqual([]);
  });
});

describe("manifest", () => {
  it("indexes files with a stable sha256 and excludes the manifest itself", () => {
    stageComplete();
    const m = buildManifest(root, { version: "0.1.0", builtAt: "2026-06-14T00:00:00.000Z" });
    expect(m.version).toBe("0.1.0");
    expect(m.builtAt).toBe("2026-06-14T00:00:00.000Z");
    expect(m.layoutVersion).toBeGreaterThanOrEqual(1);
    expect(m.files.length).toBeGreaterThan(0);
    expect(m.files.some((f) => f.path === "manifest.json")).toBe(false);
    const cli = m.files.find((f) => f.path === "cli/index.js")!;
    expect(cli.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(cli.bytes).toBeGreaterThan(0);
  });
  it("verifyManifest passes for an untouched tree and flags tampering", () => {
    stageComplete();
    const m = buildManifest(root, { version: "0.1.0", builtAt: "2026-06-14T00:00:00.000Z" });
    expect(verifyManifest(root, m)).toEqual([]);
    writeFileSync(join(root, "cli/index.js"), "TAMPERED");
    expect(verifyManifest(root, m)).toContain("cli/index.js");
  });
});
