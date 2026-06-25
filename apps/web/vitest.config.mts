import { defineConfig, configDefaults } from "vitest/config";
import { readdirSync, readFileSync } from "node:fs";
import path from "path";

const root = import.meta.dirname;

// ── DB / unit partition ──────────────────────────────────────────────────────
// `vitest.setup.db.ts` spins up a PGLite instance and runs ALL migrations in a
// per-file `beforeAll`. As a GLOBAL setup it charged that ~1s+ to every one of
// the ~458 web test files — but only ~30 actually touch the database, so the
// other ~427 pure unit tests paid for a DB they never use. That was the bulk of
// the ~17-minute CI "Unit Tests" job.
//
// We split into two vitest projects: `unit` (no DB setup — fast) and `db` (the
// files that talk to a real database, with the PGLite setup). The partition is
// computed by content scan so it stays self-maintaining: a new test that uses a
// real @burnless/db value, the @db-test helpers, or PGLite — and does NOT fully
// `vi.mock("@burnless/db")` — lands in the `db` project automatically. Bias is
// toward over-including into `db` (correct, just slower) over under-including
// (which would run a DB test without a connected DB and fail).
function listTestFiles(): string[] {
  return readdirSync(path.join(root, "src"), { recursive: true, encoding: "utf8" })
    .filter((f) => /\.test\.tsx?$/.test(f))
    .map((f) => "src/" + f.split(path.sep).join("/"));
}

function needsDb(rel: string): boolean {
  const src = readFileSync(path.join(root, rel), "utf8");
  // A full mock of @burnless/db means the file never reaches the real DB.
  if (/vi\.mock\(\s*["']@burnless\/db["']/.test(src)) return false;
  return (
    /@db-test/.test(src) ||
    /pglite/i.test(src) ||
    /__burnless_db/.test(src) ||
    // A non-type import of a real value from @burnless/db (queries, db, schema
    // values). `import type { … }` does not match and stays in the unit project.
    /(^|\n)\s*import\s+(?!type\b)[^;]*from\s+["']@burnless\/db["']/.test(src)
  );
}

const dbTests = listTestFiles().filter(needsDb);

// Settings shared by both projects (each vitest project is otherwise isolated).
const sharedTest = {
  environment: "happy-dom",
  css: false,
  server: {
    deps: { external: ["ioredis"] },
    // Allow imports from the monorepo root so DB test helpers
    // (packages/db/src/__tests__/setup.ts, factories.ts) resolve.
    fs: { allow: [path.resolve(root, "../..")] },
  },
} as const;

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
      // Allow test files to import packages/db test helpers via a stable alias.
      "@db-test": path.resolve(root, "../../packages/db/src/__tests__"),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/components/**/*.tsx", "src/lib/**/*.ts"],
      exclude: ["src/**/*.test.*", "src/**/__tests__/**"],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          ...sharedTest,
          name: "unit",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          // None of the db-test paths contain glob-special chars (verified), so
          // they are safe literal exclude patterns.
          exclude: [...configDefaults.exclude, ...dbTests],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          ...sharedTest,
          name: "db",
          include: dbTests,
          setupFiles: ["./vitest.setup.ts", "./vitest.setup.db.ts"],
        },
      },
    ],
  },
});
