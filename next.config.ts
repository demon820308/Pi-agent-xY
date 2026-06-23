import type { NextConfig } from "next";
import pkg from "./package.json";
import piPkg from "./node_modules/@earendil-works/pi-coding-agent/package.json";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai"],
  allowedDevOrigins: ['192.168.*.*'],
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_PI_VERSION: piPkg.version,
  },
  async headers() {
    return [
      {
        // Cross-origin isolation for SharedArrayBuffer (ffmpeg.wasm multi-thread).
        // Using 'credentialless' instead of 'require-corp' to allow loading
        // external resources (e.g. Whisper models from HuggingFace CDN).
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ];
  },
};

export default nextConfig;

