/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.foursquare.com',
      },
      {
        protocol: 'https',
        hostname: '**.foursquareapi.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '**.pexels.com',
      },
    ],
    unoptimized: false,
  },
};

module.exports = nextConfig;

