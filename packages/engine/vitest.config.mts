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
        "src/**/index.ts",
        "src/services/**",     // external web/crawl services — require network
        "src/payments.ts",     // Stripe integration — requires API keys
        "src/bank-connectors.ts", // external bank API connectors
        "src/metric-registry.ts", // large generated registry — tested via metrics.test.ts
        "src/vendor.d.ts",        // type declarations only
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 85,
        lines: 80,
      },
    },
  },
});
