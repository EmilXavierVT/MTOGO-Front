
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    agentFeedback: true,
  },
  

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:7070/api/:path*",
      },
    ];
  },
};

export default nextConfig;
