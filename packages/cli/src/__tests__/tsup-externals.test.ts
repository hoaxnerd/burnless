import { describe, expect, it } from "vitest";

// tsup.config.ts lives outside `rootDir: src`, so a statically-resolvable import
// would pull it into the tsc program and trip TS6059. Build the specifier at
// runtime (from a URL, not a literal relative path) so tsc cannot resolve it
// while vitest still loads the real config module.
describe("tsup config", () => {
  it("keeps PGLite packages external so their WASM/extension assets load from disk", async () => {
    const configUrl = new URL("../../tsup.config.ts", import.meta.url).href;
    const mod: { default: unknown } = await import(/* @vite-ignore */ configUrl);
    const config = mod.default;
    const resolved = typeof config === "function" ? config({}) : config;
    const external = (resolved as { external?: string[] }).external ?? [];
    expect(external).toContain("@electric-sql/pglite");
    expect(external).toContain("@electric-sql/pglite-pgvector");
  });
});
