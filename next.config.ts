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

  webpack: (config, { nextRuntime }) => {
    // Stub Node process for Edge Runtime so @supabase/supabase-js and realtime-js don't fail
    if (nextRuntime === 'edge') {
      const webpack = require('webpack');
      config.plugins = config.plugins || [];
      config.plugins.push(
        new webpack.DefinePlugin({
          'process.version': JSON.stringify('v18.0.0'),
          'process.versions': JSON.stringify({ node: '18.0.0' }),
        })
      );
    }
    return config;
  },
};

export default nextConfig;
