import { MetadataRoute } from 'next';
import { db } from '@/src/lib/db';
import { restaurants } from '@/src/lib/schema/restaurants';
import { eq } from 'drizzle-orm';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://cheapeats-canberra.vercel.app';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Get all active restaurants
  const activeRestaurants = await db
    .select({
      id: restaurants.id,
      slug: restaurants.slug,
      updatedAt: restaurants.updatedAt,
    })
    .from(restaurants)
    .where(eq(restaurants.status, 'active'));

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/map`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/submit`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  // Restaurant pages (if you have individual restaurant pages)
  // For now, we'll just include the main pages
  // If you add restaurant detail pages later, uncomment and modify:
  /*
  const restaurantPages: MetadataRoute.Sitemap = activeRestaurants.map((restaurant) => ({
    url: `${siteUrl}/restaurant/${restaurant.slug}`,
    lastModified: restaurant.updatedAt ? new Date(restaurant.updatedAt) : new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));
  */

  return [...staticPages];
}
