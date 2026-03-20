import type { NextConfig } from "next";
import path from "path";

// IMPORTANT: Do NOT add @sentry/nextjs here until the package is installed
// via `pnpm add @sentry/nextjs`. Adding it without the dep breaks builds.

const nextConfig: NextConfig = {
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
  serverExternalPackages: ["plaid", "razorpay", "stripe"],
  eslint: {
    // Lint separately via `pnpm lint` — don't block builds on eslint-plugin compat issues
    ignoreDuringBuilds: true,
  },
  // Monorepo root — prevents Next.js from inferring wrong workspace root
  // when a stale lockfile exists in a parent directory
  outputFileTracingRoot: path.join(__dirname, "../../"),
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

export default nextConfig;
