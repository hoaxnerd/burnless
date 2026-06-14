import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/index.thin.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  // Shebang + a `require`/`__filename`/`__dirname` shim. The bundled deps below include
  // CommonJS packages (commander) that call `require("events")` etc.; esbuild does not
  // auto-polyfill `require` when emitting ESM, so define it via createRequire or the bundle
  // dies at boot with "Dynamic require of 'events' is not supported".
  banner: {
    js: [
      "#!/usr/bin/env node",
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __pathDirname } from 'node:path';",
      "const require = __createRequire(import.meta.url);",
      "const __filename = __fileURLToPath(import.meta.url);",
      "const __dirname = __pathDirname(__filename);",
    ].join("\n"),
  },
  clean: true,
  sourcemap: false,
  dts: false,
  // Workspace packages are private and must never appear as published deps.
  // If a runtime workspace import ever sneaks in, bundle it instead (spec §7.1, C1).
  //
  // Also bundle the CLI's pure-JS runtime deps (commander, drizzle-orm, the MCP SDK).
  // They carry no runtime-resolved assets (unlike PGLite below), so inlining them is safe
  // and makes the CLI bundle self-contained — required for the fat-artifact, whose staged
  // `node_modules/` carries ONLY @electric-sql/pglite* (build-artifact.ts §5). Without this
  // the artifact CLI dies at boot with ERR_MODULE_NOT_FOUND resolving these bare imports.
  noExternal: [/^@burnless\//, "commander", "drizzle-orm", /^@modelcontextprotocol\/sdk/],
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
