import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts", "./vitest.setup.db.ts"],
    css: false,
    server: {
      deps: {
        external: ["ioredis"],
      },
      // Allow imports from the monorepo root so DB test helpers
      // (packages/db/src/__tests__/setup.ts, factories.ts) can be used
      // in apps/web integration tests.
      fs: {
        allow: [
          path.resolve(import.meta.dirname, "../.."),
        ],
      },
    },
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
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // Allow test files to import packages/db test helpers via a stable alias.
      // Used by: src/lib/__tests__/scenario-read-path.test.ts
      "@db-test": path.resolve(import.meta.dirname, "../../packages/db/src/__tests__"),
    },
  },
});
