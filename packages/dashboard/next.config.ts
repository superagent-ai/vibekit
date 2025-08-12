import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
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
