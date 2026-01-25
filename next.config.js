/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Allow all HTTPS image domains - restaurants use images from many different websites
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**', // Wildcard pattern allows all HTTPS domains
      },
      {
        protocol: 'http',
        hostname: '**', // Also allow HTTP for local development and some sites
      },
    ],
    unoptimized: false,
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },
  // Enable compression
  compress: true,
  // Optimize production builds
  swcMinify: true,
  // Security: Force HTTPS in production
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

