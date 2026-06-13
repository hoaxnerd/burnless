/**
 * Fat-artifact runtime support (spec §5, §6). When the CLI runs from inside a built
 * artifact, the heavy assets (migrations, PGLite vector tarball, Next server) live at
 * fixed staged paths — NOT where the dev-time source-relative resolution expects them.
 * `prepareArtifactEnv()` injects the staged paths into env BEFORE any `@burnless/db` or
 * server call (explicit env always wins). Outside an artifact (dev/source/test) it is a
 * no-op and the existing resolution + node_modules path is used. `resolveNodeBinary()`
 * picks the Node to exec the server with: a launcher-managed runtime if the installer
 * (P5) staged one, else this process's Node (system-Node v1).
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ARTIFACT_LAYOUT, ARTIFACT_MARKER } from "./artifact-layout";

export function detectArtifactRoot(entryUrl: string = import.meta.url): string | null {
  let here: string;
  try {
    here = dirname(fileURLToPath(entryUrl));
  } catch {
    return null;
  }
  const root = resolve(here, "..");
  return existsSync(join(root, ARTIFACT_MARKER)) ? root : null;
}

export interface ArtifactEnvOptions {
  env?: NodeJS.ProcessEnv;
  entryUrl?: string;
}

export function prepareArtifactEnv(opts: ArtifactEnvOptions = {}): void {
  const env = opts.env ?? process.env;
  const root = detectArtifactRoot(opts.entryUrl);
  if (!root) return;
  const setIfUnset = (key: string, value: string): void => {
    if (!env[key]?.trim()) env[key] = value;
  };
  setIfUnset("BURNLESS_MIGRATIONS_DIR", join(root, ARTIFACT_LAYOUT.migrationsDir));
  setIfUnset("BURNLESS_PGLITE_VECTOR_BUNDLE", join(root, ARTIFACT_LAYOUT.vectorBundle));
  setIfUnset("BURNLESS_SERVER_ENTRY", join(root, ARTIFACT_LAYOUT.serverEntry));
}

export function resolveNodeBinary(opts: ArtifactEnvOptions = {}): string {
  const env = opts.env ?? process.env;
  const override = env.BURNLESS_NODE?.trim();
  if (override) return override;
  const root = detectArtifactRoot(opts.entryUrl);
  if (root) {
    const managed = join(root, ARTIFACT_LAYOUT.managedNode);
    if (existsSync(managed)) return managed;
  }
  return process.execPath;
}
