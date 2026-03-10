import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent Next.js from trying to bundle these server-only packages
  serverExternalPackages: ["youtubei.js", "@treasure-dev/twitter-scraper"],
};

export default nextConfig;
