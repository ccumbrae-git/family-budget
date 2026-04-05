import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for web-push in API routes
  serverExternalPackages: ['web-push'],
};

export default nextConfig;
