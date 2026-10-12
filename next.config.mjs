/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // Narrow protections that preserve Stripe, analytics, fonts and inline
      // Next.js scripts. A nonce-based script policy is separate work.
      { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
    ] }];
  },
  serverExternalPackages: ['@node-rs/argon2', 'heic-convert'],
  outputFileTracingIncludes: {
    '/*': [
      './node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node',
      './node_modules/@node-rs/argon2-linux-x64-gnu/**/*',
      './node_modules/@img/sharp-linux-x64/**/*',
      './node_modules/@img/sharp-libvips-linux-x64/**/*',
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
