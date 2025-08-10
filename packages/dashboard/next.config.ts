import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'standalone',
  eslint: {
    // Only ignore during development, not production
    ignoreDuringBuilds: process.env.NODE_ENV === 'development',
  },
  typescript: {
    // Only ignore during development, not production  
    ignoreBuildErrors: process.env.NODE_ENV === 'development',
  },
  // Load environment variables from root .env file
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  },
  // Configure webpack to resolve @vibe-kit/projects
  webpack: (config) => {
    if (!config.resolve) {
      config.resolve = {};
    }
    if (!config.resolve.alias) {
      config.resolve.alias = {};
    }
    // Use relative path to projects package  
    const projectsPath = path.resolve(__dirname, '../projects/dist/index.js');
    config.resolve.alias['@vibe-kit/projects'] = projectsPath;
    
    // Also ensure extensions are set properly
    if (!config.resolve.extensions) {
      config.resolve.extensions = ['.js', '.jsx', '.ts', '.tsx', '.json'];
    }
    
    return config;
  },
  // Configure to run on port 3001 by default
  async rewrites() {
    return []
  },
};

export default nextConfig;
