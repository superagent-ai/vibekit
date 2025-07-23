import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  env: {
    TELEMETRY_API_URL: process.env.TELEMETRY_API_URL || 'http://localhost:3000',
    NEXT_PUBLIC_TELEMETRY_API_URL: process.env.NEXT_PUBLIC_TELEMETRY_API_URL || 'http://localhost:3000',
  },
}

export default nextConfig 