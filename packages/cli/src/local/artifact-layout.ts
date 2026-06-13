/**
 * Relative paths within a built fat-artifact (spec §3, §5, §6). Shared by the build
 * script (`scripts/build-artifact.ts`, which WRITES here) and the runtime
 * (`artifact.ts`, which READS here) so the two never drift. All paths are relative to
 * the artifact root (the dir holding the marker). Bump ARTIFACT_LAYOUT_VERSION on any
 * incompatible move.
 */
export const ARTIFACT_MARKER = ".burnless-artifact";
export const ARTIFACT_LAYOUT_VERSION = 1;

export const ARTIFACT_LAYOUT = {
  /** tsup CLI bundle entry (both faces). */
  cliEntry: "cli/index.js",
  /** Next standalone server entry → BURNLESS_SERVER_ENTRY. */
  serverEntry: "web/apps/web/server.js",
  /** drizzle migrations dir → BURNLESS_MIGRATIONS_DIR. */
  migrationsDir: "drizzle",
  /** pgvector loadable-extension tarball → BURNLESS_PGLITE_VECTOR_BUNDLE. */
  vectorBundle: "node_modules/@electric-sql/pglite-pgvector/dist/vector.tar.gz",
  /** Optional launcher-managed Node the installer (P5) may stage; else system Node. */
  managedNode: "runtime/bin/node",
} as const;

export type ArtifactLayout = typeof ARTIFACT_LAYOUT;
