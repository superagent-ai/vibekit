import type { NextConfig } from "next";
import path from "path";

// Load environment variables from root .env file
import "./load-env.js";

const nextConfig: NextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Note: API keys should only be accessed via process.env in server-side code
  // Never expose sensitive keys to client-side code via env config
  // Configure webpack to resolve @vibe-kit/projects
  webpack: (config, { isServer }) => {
    if (!config.resolve) {
      config.resolve = {};
    }
    if (!config.resolve.alias) {
      config.resolve.alias = {};
    }
    // Use relative path to projects package ESM build
    const projectsPath = path.resolve(__dirname, '../projects/dist/index.mjs');
    config.resolve.alias['@vibe-kit/projects'] = projectsPath;
    
    // Also ensure extensions are set properly
    if (!config.resolve.extensions) {
      config.resolve.extensions = ['.js', '.jsx', '.ts', '.tsx', '.json'];
    }
    
    // Handle OpenTelemetry issues in Dagger
    // We don't use telemetry, so provide empty modules for missing dependencies
    if (!config.resolve.fallback) {
      config.resolve.fallback = {};
    }
    
    // Use webpack's NormalModuleReplacementPlugin to replace the missing module
    const webpack = require('webpack');
    config.plugins = config.plugins || [];
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /@opentelemetry\/exporter-jaeger/,
        path.resolve(__dirname, 'lib/empty-module.js')
      )
    );
    
    // Ignore critical dependency warnings from Dagger
    config.ignoreWarnings = config.ignoreWarnings || [];
    config.ignoreWarnings.push({
      module: /dagger/,
      message: /Critical dependency/,
    });
    
    return config;
  },
  // Optimize for smallest bundle size
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  // Minimize build output
  compress: true,
  poweredByHeader: false,
  // Configure to run on port 3001 by default
  async rewrites() {
    return []
  },
  // Minimize static generation
  trailingSlash: false,
  // Optimize images
  images: {
    unoptimized: true
  }
};

export default nextConfig;
