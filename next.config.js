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
};

module.exports = nextConfig;

