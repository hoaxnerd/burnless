import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
