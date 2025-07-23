/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
  env: {
    TELEMETRY_API_URL: process.env.TELEMETRY_API_URL || 'http://localhost:3000',
    NEXT_PUBLIC_TELEMETRY_API_URL: process.env.NEXT_PUBLIC_TELEMETRY_API_URL || 'http://localhost:3000',
  },
}

module.exports = nextConfig 