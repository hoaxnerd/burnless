import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/__tests__/**",
        "src/**/index.ts",
        "src/types.ts",            // type definitions only
        "src/providers/types.ts",   // type definitions only
        "src/providers/anthropic.ts", // requires live API key
        "src/providers/openai.ts",    // requires live API key
        "src/embeddings.ts",          // requires live API key
      ],
      thresholds: {
        statements: 60,
        branches: 55,
        functions: 60,
        lines: 60,
      },
    },
  },
});
