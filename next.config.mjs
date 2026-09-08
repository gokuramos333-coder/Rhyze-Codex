/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  serverExternalPackages: ['@node-rs/argon2'],
  outputFileTracingIncludes: {
    '/*': [
      './node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node',
      './node_modules/@node-rs/argon2-linux-x64-gnu/**/*',
    ],
  },
  images: {
    unoptimized: true,
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
