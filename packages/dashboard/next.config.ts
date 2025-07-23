import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  env: {
    TELEMETRY_API_URL: process.env.TELEMETRY_API_URL || 'http://localhost:8080',
  },
}

export default nextConfig 