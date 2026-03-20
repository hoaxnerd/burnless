import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@burnless/ui", "@burnless/types", "@burnless/db"],
};

export default nextConfig;
