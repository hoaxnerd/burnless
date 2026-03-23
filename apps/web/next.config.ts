import type { NextConfig } from "next";
import path from "path";
import withBundleAnalyzer from "@next/bundle-analyzer";

const analyze = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // Standalone output for Docker — bundles server + dependencies into .next/standalone
  output: "standalone",
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
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
        {
          key: "Content-Security-Policy",
          value: [
            "default-src 'self'",
            `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https://lh3.googleusercontent.com https://avatars.githubusercontent.com",
            "font-src 'self'",
            "connect-src 'self' https://api.anthropic.com https://api.openai.com https://openrouter.ai https://*.sentry.io",
            "frame-ancestors 'none'",
          ].join("; "),
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
  serverExternalPackages: [
    "plaid",
    "razorpay",
    "stripe",
    "openai",
    "@anthropic-ai/sdk",
    "@sentry/nextjs",
    "@sentry/node",
    "@opentelemetry/instrumentation",
    "@opentelemetry/api",
    "@auth/drizzle-adapter",
    "drizzle-orm",
    "ioredis",
    "qrcode",
  ],
  experimental: {
    optimizePackageImports: ["recharts"],
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
