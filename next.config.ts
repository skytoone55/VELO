import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for smaller deployments
  output: 'standalone',

  // Don't bundle heavy server-only packages
  serverExternalPackages: ['googleapis'],

  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
  },

  // Reduce powered-by header
  poweredByHeader: false,
};

export default nextConfig;
