/**
 * The must-exist files in a built fat-artifact. The build orchestrator and the
 * isolated-env acceptance both gate on `verifyArtifact() === []`. Catches the 2a
 * failure modes (missing PGLite WASM / migrations) at build time, not at a user's boot.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ARTIFACT_LAYOUT, ARTIFACT_MARKER } from "../local/artifact-layout";

export function requiredArtifactPaths(): string[] {
  return [
    ARTIFACT_MARKER,
    "manifest.json",
    ARTIFACT_LAYOUT.launcher,
    ARTIFACT_LAYOUT.cliEntry,
    ARTIFACT_LAYOUT.serverEntry,
    `${ARTIFACT_LAYOUT.migrationsDir}/meta/_journal.json`,
    "web/apps/web/.next/static",
    "node_modules/@electric-sql/pglite/dist/pglite.wasm",
    "node_modules/@electric-sql/pglite/dist/pglite.data",
    ARTIFACT_LAYOUT.vectorBundle,
  ];
}

/** Returns the subset of required paths missing under `root` ([] = complete). */
export function verifyArtifact(root: string): string[] {
  return requiredArtifactPaths().filter((rel) => !existsSync(join(root, rel)));
}
