/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    BACKEND_URL: process.env.BACKEND_URL || 'http://127.0.0.1:8000',
  },
  // Disable HMR for AG-Grid to prevent issues
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // Add fallback for AG-Grid modules during HMR
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
}

module.exports = nextConfig
