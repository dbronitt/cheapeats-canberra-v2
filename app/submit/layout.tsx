import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Submit a Restaurant - CheapEats Canberra',
  description: 'Submit a restaurant, deal, or special offer to CheapEats Canberra. Help us discover the best dining deals in Canberra.',
  openGraph: {
    title: 'Submit a Restaurant - CheapEats Canberra',
    description: 'Submit a restaurant, deal, or special offer to CheapEats Canberra.',
    type: 'website',
  },
};

export default function SubmitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
