import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'dockerode', 
    'ssh2', 
    '@opentelemetry/sdk-node',
    '@opentelemetry/auto-instrumentations-node',
    '@opentelemetry/exporter-jaeger'
  ],
  webpack: (config, { isServer }) => {
    // Help resolve the local @vibe-kit/sdk package
    config.resolve.alias = {
      ...config.resolve.alias,
      '@vibe-kit/sdk': require.resolve('@vibe-kit/sdk')
    };

    // Exclude native .node files from webpack processing
    config.module.rules.push({
      test: /\.node$/,
      use: 'ignore-loader'
    });
    
    if (!isServer) {
      // Exclude dockerode and its dependencies from client-side bundle
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        path: false,
      };
      
      config.externals = config.externals || [];
      config.externals.push({
        'dockerode': 'commonjs dockerode',
        'ssh2': 'commonjs ssh2',
        '@opentelemetry/exporter-jaeger': 'commonjs @opentelemetry/exporter-jaeger',
        '@opentelemetry/sdk-node': 'commonjs @opentelemetry/sdk-node',
        '@opentelemetry/auto-instrumentations-node': 'commonjs @opentelemetry/auto-instrumentations-node'
      });
    } else {
      // For server-side, externalize these packages completely
      config.externals = config.externals || [];
      config.externals.push({
        'dockerode': 'commonjs dockerode',
        'ssh2': 'commonjs ssh2'
      });
    }
    return config;
  },
};

export default nextConfig;