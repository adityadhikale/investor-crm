import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Large Excel/CSV contact imports can exceed the 1MB default.
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
