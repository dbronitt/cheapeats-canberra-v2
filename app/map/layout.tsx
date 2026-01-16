import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Restaurant Map - CheapEats Canberra',
  description: 'Explore Canberra restaurants with deals on an interactive map. Find happy hours, weekly specials, and restaurant offers near you.',
  openGraph: {
    title: 'Restaurant Map - CheapEats Canberra',
    description: 'Explore Canberra restaurants with deals on an interactive map.',
    type: 'website',
  },
};

export default function MapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
