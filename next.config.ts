import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable Incremental Static Regeneration (ISR)
  // Remove output: 'export' to enable ISR
  
  // Image optimization
  images: {
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  
  // Optimize bundle size
  experimental: {
    optimizePackageImports: ['react', 'react-dom'],
  },
  
  // Compression
  compress: true,
};

export default nextConfig;
