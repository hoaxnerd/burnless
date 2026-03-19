import type { NextConfig } from "next";
import { resolve } from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@burnless/ui", "@burnless/types", "@burnless/db"],
  outputFileTracingRoot: resolve(__dirname, "../../"),
};

export default nextConfig;
