import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai"],
  allowedDevOrigins: ['192.168.*.*'],
};

export default nextConfig;
