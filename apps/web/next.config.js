const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@nettapu/shared'],
  productionBrowserSourceMaps: true,

  async rewrites() {
    const apiTarget = process.env.API_URL || 'http://localhost:3000';
    const auctionTarget = process.env.AUCTION_API_URL || 'http://localhost:3001';
    return [
      // Auction-service admin routes (must come before monolith catch-all)
      {
        source: '/api/v1/admin/settlements/:path*',
        destination: `${auctionTarget}/api/v1/auctions/admin/settlements/:path*`,
      },
      {
        source: '/api/v1/admin/finance/:path*',
        destination: `${auctionTarget}/api/v1/auctions/admin/finance/:path*`,
      },
      // Auction-service routes (prefix on auction-service is api/v1/auctions)
      {
        source: '/api/v1/auctions/:path*',
        destination: `${auctionTarget}/api/v1/auctions/:path*`,
      },
      {
        source: '/api/v1/bids/:path*',
        destination: `${auctionTarget}/api/v1/auctions/bids/:path*`,
      },
      // Static uploads (images, documents)
      {
        source: '/uploads/:path*',
        destination: `${apiTarget}/uploads/:path*`,
      },
      // Monolith catch-all (must be last)
      {
        source: '/api/v1/:path*',
        destination: `${apiTarget}/api/v1/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
        ],
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
