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
  // Configure webpack to resolve @vibe-kit/projects and handle native modules
  webpack: (config, { isServer }) => {
    if (!config.resolve) {
      config.resolve = {};
    }
    if (!config.resolve.alias) {
      config.resolve.alias = {};
    }
    // Use absolute path to projects package
    const projectsPath = path.join(__dirname, '..', '..', '..', '..', '..', 'projects', 'dist', 'index.js');
    config.resolve.alias['@vibe-kit/projects'] = projectsPath;
    
    // Also ensure extensions are set properly
    if (!config.resolve.extensions) {
      config.resolve.extensions = ['.js', '.jsx', '.ts', '.tsx', '.json'];
    }
    
    // Handle native modules and external dependencies
    if (!isServer) {
      // Don't bundle these modules for the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        chokidar: false,
      };
    }
    
    // Ignore fsevents (macOS file watching) 
    config.externals = [...(config.externals || []), 'fsevents'];
    
    return config;
  },
  // Configure to run on port 3001 by default
  async rewrites() {
    return []
  },
};

export default nextConfig;
