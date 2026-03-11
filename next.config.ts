import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next.js from trying to bundle these server-only packages
  serverExternalPackages: ["youtubei.js"],
};

export default nextConfig;
