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
});
