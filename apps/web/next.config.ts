import type { NextConfig } from "next";
import path from "path";
import withBundleAnalyzer from "@next/bundle-analyzer";

const analyze = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // Point to monorepo root so Next.js doesn't infer /Users/X/ from a parent lockfile
  outputFileTracingRoot: path.join(__dirname, "../../"),
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ],
    },
  ],
  transpilePackages: [
    "@burnless/ui",
    "@burnless/types",
    "@burnless/db",
    "@burnless/ai",
    "@burnless/engine",
  ],
  serverExternalPackages: ["plaid", "razorpay", "stripe", "openai", "@anthropic-ai/sdk"],
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  eslint: {
    // Lint separately via `pnpm lint` — don't block builds on eslint-plugin compat issues
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    // plaid, razorpay, stripe are optional runtime-only SDKs loaded via dynamic import.
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : config.externals ? [config.externals] : []),
      "plaid",
      "razorpay",
      "razorpay/dist/utils/razorpay-utils.js",
    ];
    return config;
  },
};

export default analyze(nextConfig);
