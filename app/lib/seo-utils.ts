/**
 * SEO utility functions
 */

export const siteConfig = {
  name: 'CheapEats Canberra',
  description: 'Discover the best restaurant deals, happy hours, and weekly specials in Canberra, Australia',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://cheapeats-canberra.vercel.app',
  ogImage: '/logo.svg',
  twitterHandle: '@cheapeatscanberra',
};

/**
 * Generate structured data for a restaurant
 */
export function generateRestaurantStructuredData(restaurant: {
  name: string;
  address?: string | null;
  suburb?: string | null;
  cuisine?: string | null;
  phone?: string | null;
  websiteUrl?: string | null;
  imageUrls?: string[] | null;
  overallRating?: number | null;
  openingHours?: any;
}) {
  const siteUrl = siteConfig.url;
  
  const structuredData: any = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: restaurant.name,
    address: {
      '@type': 'PostalAddress',
      addressLocality: restaurant.suburb || 'Canberra',
      addressRegion: 'ACT',
      addressCountry: 'AU',
      streetAddress: restaurant.address || undefined,
    },
  };

  if (restaurant.cuisine) {
    structuredData.servesCuisine = restaurant.cuisine;
  }

  if (restaurant.phone) {
    structuredData.telephone = restaurant.phone;
  }

  if (restaurant.websiteUrl) {
    structuredData.url = restaurant.websiteUrl;
  }

  if (restaurant.imageUrls && restaurant.imageUrls.length > 0) {
    structuredData.image = restaurant.imageUrls[0];
  }

  if (restaurant.overallRating) {
    structuredData.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: restaurant.overallRating.toString(),
      bestRating: '5',
      worstRating: '1',
    };
  }

  if (restaurant.openingHours) {
    const hours = restaurant.openingHours;
    const openingHoursSpecification: any[] = [];
    
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    days.forEach((day, index) => {
      const dayHours = hours[day];
      if (dayHours && dayHours !== 'CLOSED') {
        openingHoursSpecification.push({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: `https://schema.org/${day.charAt(0).toUpperCase() + day.slice(1)}`,
          opens: '00:00', // Parse from dayHours if needed
          closes: '23:59',
        });
      }
    });

    if (openingHoursSpecification.length > 0) {
      structuredData.openingHoursSpecification = openingHoursSpecification;
    }
  }

  return structuredData;
}

/**
 * Generate breadcrumb structured data
 */
export function generateBreadcrumbStructuredData(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
