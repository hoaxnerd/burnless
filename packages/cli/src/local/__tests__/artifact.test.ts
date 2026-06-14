import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectArtifactRoot, prepareArtifactEnv, resolveNodeBinary } from "../artifact";
import { ARTIFACT_MARKER } from "../artifact-layout";

let root: string;
function entryUrlFor(r: string): string {
  return pathToFileURL(join(r, "cli", "index.js")).href;
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "burnless-artifact-"));
  mkdirSync(join(root, "cli"), { recursive: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("detectArtifactRoot", () => {
  it("returns null when no marker is present (dev/source/test)", () => {
    expect(detectArtifactRoot(entryUrlFor(root))).toBeNull();
  });
  it("returns the root (parent of cli/) when the marker exists", () => {
    writeFileSync(join(root, ARTIFACT_MARKER), "{}");
    expect(detectArtifactRoot(entryUrlFor(root))).toBe(root);
  });
});

describe("prepareArtifactEnv", () => {
  it("is a no-op outside an artifact", () => {
    const env: NodeJS.ProcessEnv = {};
    prepareArtifactEnv({ env, entryUrl: entryUrlFor(root) });
    expect(env.BURNLESS_MIGRATIONS_DIR).toBeUndefined();
    expect(env.BURNLESS_PGLITE_VECTOR_BUNDLE).toBeUndefined();
    expect(env.BURNLESS_SERVER_ENTRY).toBeUndefined();
  });
  it("injects the three staged paths inside an artifact", () => {
    writeFileSync(join(root, ARTIFACT_MARKER), "{}");
    const env: NodeJS.ProcessEnv = {};
    prepareArtifactEnv({ env, entryUrl: entryUrlFor(root) });
    expect(env.BURNLESS_MIGRATIONS_DIR).toBe(join(root, "drizzle"));
    expect(env.BURNLESS_PGLITE_VECTOR_BUNDLE).toBe(join(root, "node_modules/@electric-sql/pglite-pgvector/dist/vector.tar.gz"));
    expect(env.BURNLESS_SERVER_ENTRY).toBe(join(root, "web/apps/web/server.js"));
  });
  it("never overrides an explicitly-set env var", () => {
    writeFileSync(join(root, ARTIFACT_MARKER), "{}");
    const env: NodeJS.ProcessEnv = { BURNLESS_MIGRATIONS_DIR: "/custom/drizzle" };
    prepareArtifactEnv({ env, entryUrl: entryUrlFor(root) });
    expect(env.BURNLESS_MIGRATIONS_DIR).toBe("/custom/drizzle");
  });
});

describe("resolveNodeBinary", () => {
  it("honors BURNLESS_NODE first", () => {
    const env: NodeJS.ProcessEnv = { BURNLESS_NODE: "/opt/node/bin/node" };
    expect(resolveNodeBinary({ env, entryUrl: entryUrlFor(root) })).toBe("/opt/node/bin/node");
  });
  it("uses an in-artifact launcher-managed Node when staged", () => {
    writeFileSync(join(root, ARTIFACT_MARKER), "{}");
    mkdirSync(join(root, "runtime", "bin"), { recursive: true });
    writeFileSync(join(root, "runtime", "bin", "node"), "#!/bin/sh\n");
    const env: NodeJS.ProcessEnv = {};
    expect(resolveNodeBinary({ env, entryUrl: entryUrlFor(root) })).toBe(join(root, "runtime", "bin", "node"));
  });
  it("uses the HOME-level managed Node (install.sh --with-node, sibling of versions/) when there is no in-artifact one", () => {
    // Real installed layout: <home>/.burnless/versions/<ver> is the artifact root,
    // and the managed Node lives at <home>/.burnless/runtime/bin/node.
    const homeRoot = mkdtempSync(join(tmpdir(), "burnless-home-"));
    const artifactRoot = join(homeRoot, ".burnless", "versions", "0.1.0");
    mkdirSync(join(artifactRoot, "cli"), { recursive: true });
    writeFileSync(join(artifactRoot, ARTIFACT_MARKER), "{}");
    const homeNode = join(homeRoot, ".burnless", "runtime", "bin", "node");
    mkdirSync(join(homeRoot, ".burnless", "runtime", "bin"), { recursive: true });
    writeFileSync(homeNode, "#!/bin/sh\n");
    // NO in-artifact runtime/bin/node staged.
    const env: NodeJS.ProcessEnv = {};
    expect(resolveNodeBinary({ env, entryUrl: entryUrlFor(artifactRoot) })).toBe(homeNode);
    rmSync(homeRoot, { recursive: true, force: true });
  });
  it("prefers the HOME-level managed Node over an in-artifact one (mirrors launcher order)", () => {
    const homeRoot = mkdtempSync(join(tmpdir(), "burnless-home-"));
    const artifactRoot = join(homeRoot, ".burnless", "versions", "0.1.0");
    mkdirSync(join(artifactRoot, "cli"), { recursive: true });
    writeFileSync(join(artifactRoot, ARTIFACT_MARKER), "{}");
    const homeNode = join(homeRoot, ".burnless", "runtime", "bin", "node");
    mkdirSync(join(homeRoot, ".burnless", "runtime", "bin"), { recursive: true });
    writeFileSync(homeNode, "#!/bin/sh\n");
    // ALSO stage an in-artifact Node — the home-level one must win.
    mkdirSync(join(artifactRoot, "runtime", "bin"), { recursive: true });
    writeFileSync(join(artifactRoot, "runtime", "bin", "node"), "#!/bin/sh\n");
    const env: NodeJS.ProcessEnv = {};
    expect(resolveNodeBinary({ env, entryUrl: entryUrlFor(artifactRoot) })).toBe(homeNode);
    rmSync(homeRoot, { recursive: true, force: true });
  });
  it("falls back to the current process Node (system-Node v1)", () => {
    writeFileSync(join(root, ARTIFACT_MARKER), "{}");
    const env: NodeJS.ProcessEnv = {};
    expect(resolveNodeBinary({ env, entryUrl: entryUrlFor(root) })).toBe(process.execPath);
  });
});
