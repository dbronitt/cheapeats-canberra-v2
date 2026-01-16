import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import Header from './components/Header';
import Footer from './components/Footer';
import RotatingBackground from './components/RotatingBackground';

const inter = Inter({ subsets: ['latin'] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://cheapeats-canberra.vercel.app';
const siteName = 'CheapEats Canberra';
const defaultDescription = 'Discover the best restaurant deals, happy hours, and weekly specials in Canberra, Australia. Find cheap eats, discounts, and special offers at local restaurants, cafes, and bars.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} - Find the Best Restaurant Deals`,
    template: `%s | ${siteName}`,
  },
  description: defaultDescription,
  keywords: [
    'Canberra restaurants',
    'restaurant deals Canberra',
    'happy hour Canberra',
    'cheap eats Canberra',
    'restaurant specials',
    'Canberra dining deals',
    'food discounts Canberra',
    'weekly specials Canberra',
    'EatClub Canberra',
    'First Table Canberra',
    'restaurant offers',
    'Canberra food deals',
  ],
  authors: [{ name: 'CheapEats Canberra' }],
  creator: 'CheapEats Canberra',
  publisher: 'CheapEats Canberra',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_AU',
    url: siteUrl,
    siteName: siteName,
    title: `${siteName} - Find the Best Restaurant Deals`,
    description: defaultDescription,
    images: [
      {
        url: '/logo.svg',
        width: 1200,
        height: 630,
        alt: 'CheapEats Canberra Logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteName} - Find the Best Restaurant Deals`,
    description: defaultDescription,
    images: ['/logo.svg'],
    creator: '@cheapeatscanberra',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
      { url: '/logo.svg', type: 'image/svg+xml', sizes: 'any' },
    ],
    shortcut: '/logo.svg',
    apple: '/logo.svg',
  },
  alternates: {
    canonical: siteUrl,
  },
  verification: {
    // Add Google Search Console verification when available
    // google: 'your-google-verification-code',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className}`}>
        <RotatingBackground />
        <div className="relative z-10 flex flex-col min-h-screen">
          <Header />
          <main className="flex-1 relative min-h-0">{children}</main>
          <Footer />
        </div>
        <Analytics />
      </body>
    </html>
  );
}
