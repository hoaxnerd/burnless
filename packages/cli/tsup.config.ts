import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  banner: { js: "#!/usr/bin/env node" },
  clean: true,
  sourcemap: false,
  dts: false,
  // Workspace packages are private and must never appear as published deps.
  // If a runtime workspace import ever sneaks in, bundle it instead (spec §7.1, C1).
  noExternal: [/^@burnless\//],
  // Keep PGLite external (the 2a fix per spec §9). @burnless/db imports
  // @electric-sql/pglite + the pgvector extension, both of which ship WASM
  // (pglite.wasm/pglite.data) and a loadable-extension tarball (vector.tar.gz)
  // resolved at runtime via `import.meta.url`. Bundling them inline (which
  // noExternal above would otherwise force, since they are transitive) rewrites
  // those asset paths and breaks PGLite at boot. Marking them external preserves
  // a real runtime import that resolves from on-disk node_modules — the repo's
  // node_modules in dev/tests, the staged node_modules in the fat-artifact.
  external: ["@electric-sql/pglite", "@electric-sql/pglite-pgvector"],
});
