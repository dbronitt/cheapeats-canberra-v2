import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurants } from '@/src/lib/schema';
import { eq, sql } from 'drizzle-orm';
import { searchEatClubCanberra, matchEatClubToRestaurant, scrapeEatClubVenue } from '@/src/lib/eatclub';
import { createSlug } from '@/src/lib/utils';

interface NewRestaurant {
  name: string;
  url: string;
  address?: string;
  suburb?: string;
  cuisine?: string;
  imageUrls?: string[];
  dealTitle?: string;
  dealDescription?: string;
}

interface Stats {
  totalEatClubVenues: number;
  matched: number;
  newRestaurants: number;
  errors: number;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function findMatchingRestaurant(eatClubVenue: any): Promise<number | null> {
  try {
    const allRestaurants = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        suburb: restaurants.suburb,
        eatClubUrl: restaurants.eatClubUrl,
      })
      .from(restaurants)
      .where(eq(restaurants.status, 'active'));

    const normalizedEatClubName = normalizeName(eatClubVenue.name);

    for (const restaurant of allRestaurants) {
      const normalizedRestaurantName = normalizeName(restaurant.name);
      
      if (normalizedRestaurantName === normalizedEatClubName) {
        if (!restaurant.suburb || !eatClubVenue.suburb || 
            restaurant.suburb.toLowerCase() === eatClubVenue.suburb.toLowerCase()) {
          return restaurant.id;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding matching restaurant:', error);
    return null;
  }
}

async function updateRestaurantWithEatClub(id: number, venue: any) {
  await db.update(restaurants)
    .set({
      eatClubUrl: venue.url,
      updatedAt: new Date(),
    })
    .where(eq(restaurants.id, id));
}

export async function POST() {
  try {
    console.log('[API] Starting find new EatClub restaurants...');
    
    const stats: Stats = {
      totalEatClubVenues: 0,
      matched: 0,
      newRestaurants: 0,
      errors: 0,
    };

    const newRestaurants: NewRestaurant[] = [];
    const restaurantsToUpdate: Array<{ id: number; venue: any }> = [];

    // Search EatClub for all Canberra venues
    const eatClubVenues = await searchEatClubCanberra();
    stats.totalEatClubVenues = eatClubVenues.length;

    if (eatClubVenues.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No venues found on EatClub',
        stats,
        newRestaurants: [],
      });
    }

    // Process each venue
    for (const venue of eatClubVenues) {
      try {
        const matchingId = await findMatchingRestaurant(venue);

        if (matchingId) {
          const existing = await db
            .select({ eatClubUrl: restaurants.eatClubUrl })
            .from(restaurants)
            .where(eq(restaurants.id, matchingId))
            .limit(1);

          if (!existing[0]?.eatClubUrl) {
            restaurantsToUpdate.push({ id: matchingId, venue });
          }
          stats.matched++;
        } else {
          newRestaurants.push({
            name: venue.name,
            url: venue.url,
            address: venue.address,
            suburb: venue.suburb,
            cuisine: venue.cuisine,
            imageUrls: venue.imageUrls,
            dealTitle: venue.dealTitle,
            dealDescription: venue.dealDescription,
          });
          stats.newRestaurants++;
        }
      } catch (error) {
        stats.errors++;
        console.error(`Error processing ${venue.name}:`, error);
      }
    }

    // Update restaurants that need EatClub URLs
    for (const { id, venue } of restaurantsToUpdate) {
      try {
        await updateRestaurantWithEatClub(id, venue);
      } catch (error) {
        console.error(`Failed to update restaurant ID ${id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Search complete',
      stats,
      newRestaurants,
      restaurantsUpdated: restaurantsToUpdate.length,
    });
  } catch (error) {
    console.error('Error finding new EatClub restaurants:', error);
    return NextResponse.json(
      { error: 'Failed to find new EatClub restaurants', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
