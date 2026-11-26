import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @sparticuz/chromium resolves binaries via filesystem; must not be bundled.
  serverExternalPackages: [
    "@sparticuz/chromium",
    "playwright-core",
    "playwright",
    "ffmpeg-static",
  ],

  // Include extension sources in serverless bundles (version API + zip download).
  outputFileTracingIncludes: {
    '/api/extension/download': ['./extension/**/*'],
    '/api/extension/version': ['./extension/ikfaidmmhokhgocfhhddhlahmbikjaed/manifest.json'],
    '/api/social-scheduling/media/import-link': [
      './node_modules/ffmpeg-static/**/*',
      './.bin/**/*',
    ],
    '/api/cron/social-link-import': [
      './node_modules/ffmpeg-static/**/*',
      './.bin/**/*',
    ],
    '/api/social-scheduling/media/preview': [
      './node_modules/ffmpeg-static/**/*',
    ],
    '/api/social-scheduling/media/upload': [
      './node_modules/ffmpeg-static/**/*',
    ],
    '/api/social-scheduling/media/trim': [
      './node_modules/ffmpeg-static/**/*',
    ],
    '/api/social-scheduling/telegram-media/import': [
      './node_modules/ffmpeg-static/**/*',
    ],
    '/api/admin/media': [
      './node_modules/ffmpeg-static/**/*',
    ],
  },

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
    // Must cover social video uploads (R2 video limit defaults to 100MB).
    middlewareClientMaxBodySize: '110mb',
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
