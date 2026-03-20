import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@burnless/ui", "@burnless/types", "@burnless/db"],
  serverExternalPackages: ["plaid", "razorpay"],
  webpack: (config) => {
    // plaid and razorpay are optional runtime-only SDKs used via dynamic import.
    // Mark them as external so webpack doesn't try to bundle them.
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
