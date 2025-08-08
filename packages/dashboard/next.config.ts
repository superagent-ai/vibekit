import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
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
  // Environment variables
  env: {
    SKIP_ENV_VALIDATION: 'true',
    NEXT_TELEMETRY_DISABLED: '1',
  },
};

export default nextConfig;