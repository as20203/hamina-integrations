import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@repo/ui"],
  async redirects() {
    return [
      { source: "/mist", destination: "/sites", permanent: false },
      { source: "/mist/:deviceId", destination: "/sites", permanent: false },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
