import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@earendil-works/pi-coding-agent", "@earendil-works/pi-ai"],
  allowedDevOrigins: ['192.168.*.*'],
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
