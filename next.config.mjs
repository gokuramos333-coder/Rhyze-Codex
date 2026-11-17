// Netlify build metadata is not guaranteed in function runtime. Stamp only
// non-secret, exact artifact identity; the hosted release guard validates source.
const financialBuildIdentity = {
  RHYZE_FINANCIAL_DEPLOY_ID: process.env.DEPLOY_ID || '',
  RHYZE_FINANCIAL_SOURCE_SHA: process.env.COMMIT_REF || '',
};
if (process.env.NETLIFY === 'true' &&
    (!/^[a-f0-9]{24}$/.test(financialBuildIdentity.RHYZE_FINANCIAL_DEPLOY_ID) ||
     !/^[a-f0-9]{40}$/.test(financialBuildIdentity.RHYZE_FINANCIAL_SOURCE_SHA))) {
  throw new Error('Exact hosted financial build identity required');
}
/** @type {import('next').NextConfig} */
const nextConfig = {
  env: financialBuildIdentity,
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
