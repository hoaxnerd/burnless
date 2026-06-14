import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeAll } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "../..");
const dist = join(pkgRoot, "dist");
describe("thin npm bundle", () => {
  beforeAll(() => { execFileSync("pnpm", ["build"], { cwd: pkgRoot }); }, 180_000);
  it("emits both entries", () => {
    expect(existsSync(join(dist, "index.js"))).toBe(true);
    expect(existsSync(join(dist, "index.thin.js"))).toBe(true);
  });
  it("the thin entry's reachable graph excludes @burnless/db + PGLite", () => {
    // Scan the thin entry AND only the chunks it statically imports (tsup may code-split).
    const seen = new Set<string>();
    const scan = (file: string): string => {
      if (seen.has(file) || !existsSync(file)) return "";
      seen.add(file);
      const src = readFileSync(file, "utf8");
      let agg = src;
      for (const m of src.matchAll(/from\s+["'](\.\/[^"']+)["']/g)) {
        agg += "\n" + scan(join(dist, m[1]!));
      }
      for (const m of src.matchAll(/import\(["'](\.\/[^"']+)["']\)/g)) {
        agg += "\n" + scan(join(dist, m[1]!));
      }
      return agg;
    };
    const graph = scan(join(dist, "index.thin.js"));
    expect(graph).not.toMatch(/@electric-sql\/pglite/);
    expect(graph).not.toMatch(/drizzle-orm\/pglite/);
    expect(graph).not.toMatch(/applyMigrations|createClient\b/); // @burnless/db client surface
  });
});
