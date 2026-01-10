import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Header from './components/Header';
import Footer from './components/Footer';
import RotatingBackground from './components/RotatingBackground';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CheapEats Canberra - Find the Best Restaurant Deals',
  description: 'Discover restaurants, deals, happy hours, and weekly specials in Canberra, Australia',
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
      { url: '/logo.svg', type: 'image/svg+xml', sizes: 'any' },
    ],
    shortcut: '/logo.svg',
    apple: '/logo.svg',
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
      </body>
    </html>
  );
}
