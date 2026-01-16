import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurants } from '@/src/lib/schema';
import { eq, isNotNull } from 'drizzle-orm';
import { scrapeEatClubVenue, searchEatClubCanberra, matchEatClubToRestaurant, filterEatClubLogos } from '@/src/lib/eatclub';

interface SyncStats {
  total: number;
  processed: number;
  updated: number;
  dealsFound: number;
  imagesFound: number;
  removed: number;
  errors: number;
}

async function updateRestaurantWithEatClub(
  restaurantId: number,
  eatClubVenue: any,
  hasDeal: boolean
) {
  const currentImageUrls = (await db.select({ imageUrls: restaurants.imageUrls })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1))[0]?.imageUrls as string[] | null;

  const existingImages = currentImageUrls || [];
  const newImages = eatClubVenue.imageUrls || [];
  
  const filteredExistingImages = filterEatClubLogos(existingImages);
  const allImages = [...filteredExistingImages];
  for (const img of newImages) {
    if (!allImages.includes(img)) {
      allImages.push(img);
    }
  }
  const finalImages = filterEatClubLogos(allImages);

  const currentDeals = (await db.select({ deals: restaurants.deals })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1))[0]?.deals as Array<any> | null;

  const deals = currentDeals || [];
  if (hasDeal) {
    // Check if EatClub deal already exists
    const eatClubDealIndex = deals.findIndex((d: any) => d.source === 'EatClub' || d.source === 'eatclub');
    
    // Always use standardized format for EatClub deals
    const newDeal = {
      title: 'EatClub Deal Available',
      description: 'Check out our EatClub deals!',
      validUntil: null,
      source: 'EatClub'
    };
    
    if (eatClubDealIndex >= 0) {
      // Update existing EatClub deal
      deals[eatClubDealIndex] = newDeal;
    } else {
      // Add new EatClub deal
      deals.push(newDeal);
    }
  }

  await db.update(restaurants)
    .set({
      eatClubUrl: eatClubVenue.url,
      imageUrls: finalImages.length > 0 ? finalImages : null,
      deals: deals.length > 0 ? deals : null,
      updatedAt: new Date(),
    })
    .where(eq(restaurants.id, restaurantId));
}

export async function POST() {
  try {
    console.log('[API] Starting EatClub sync...');
    
    const stats: SyncStats = {
      total: 0,
      processed: 0,
      updated: 0,
      dealsFound: 0,
      imagesFound: 0,
      removed: 0,
      errors: 0,
    };

    // Search EatClub for all Canberra venues
    const eatClubVenues = await searchEatClubCanberra();

    // Process restaurants that already have EatClub URLs
    const restaurantsWithEatClub = await db
      .select()
      .from(restaurants)
      .where(isNotNull(restaurants.eatClubUrl))
      .limit(200);

    stats.total = restaurantsWithEatClub.length;

    // Process restaurants with existing EatClub URLs
    for (let i = 0; i < restaurantsWithEatClub.length; i++) {
      const restaurant = restaurantsWithEatClub[i];
      stats.processed++;

      try {
        if (!restaurant.eatClubUrl) continue;

        const eatClubVenue = await scrapeEatClubVenue(restaurant.eatClubUrl);

        if (eatClubVenue) {
          const hasDeal = !!(eatClubVenue.dealTitle || eatClubVenue.dealDescription);
          const hasImages = !!(eatClubVenue.imageUrls && eatClubVenue.imageUrls.length > 0);

          if (hasDeal || hasImages) {
            await updateRestaurantWithEatClub(restaurant.id, eatClubVenue, hasDeal);
            stats.updated++;
            
            if (hasDeal) stats.dealsFound++;
            if (hasImages) stats.imagesFound++;
          }
        }

        // Rate limiting
        if (i < restaurantsWithEatClub.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        stats.errors++;
        console.error(`Error processing ${restaurant.name}:`, error);
      }
    }

    // Match EatClub venues to restaurants without EatClub URLs
    if (eatClubVenues.length > 0) {
      const restaurantsWithoutEatClub = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.status, 'active'))
        .limit(500);

      for (const restaurant of restaurantsWithoutEatClub) {
        if (restaurant.eatClubUrl) continue;

        for (const venue of eatClubVenues) {
          if (matchEatClubToRestaurant(venue, restaurant.name, restaurant.suburb || undefined)) {
            const hasDeal = !!(venue.dealTitle || venue.dealDescription);
            await updateRestaurantWithEatClub(restaurant.id, venue, hasDeal);
            
            if (hasDeal) stats.dealsFound++;
            if (venue.imageUrls?.length) stats.imagesFound++;
            break;
          }
        }
      }
    }

    // Check for restaurants no longer found in EatClub
    if (eatClubVenues.length > 0) {
      const allRestaurantsWithEatClub = await db
        .select({
          id: restaurants.id,
          name: restaurants.name,
          suburb: restaurants.suburb,
          eatClubUrl: restaurants.eatClubUrl,
        })
        .from(restaurants)
        .where(isNotNull(restaurants.eatClubUrl));

      for (const restaurant of allRestaurantsWithEatClub) {
        let found = false;
        
        for (const venue of eatClubVenues) {
          if (matchEatClubToRestaurant(venue, restaurant.name, restaurant.suburb || undefined)) {
            found = true;
            break;
          }
          
          if (restaurant.eatClubUrl) {
            const restaurantSlug = restaurant.eatClubUrl.match(/venue\/([^\/\?]+)/)?.[1];
            const venueSlug = venue.slug || venue.url.match(/venue\/([^\/\?]+)/)?.[1];
            
            if (restaurantSlug && venueSlug && restaurantSlug.toLowerCase() === venueSlug.toLowerCase()) {
              found = true;
              break;
            }
          }
        }

        if (!found) {
          await db.update(restaurants)
            .set({
              eatClubUrl: null,
              updatedAt: new Date(),
            })
            .where(eq(restaurants.id, restaurant.id));
          
          stats.removed++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'EatClub sync complete',
      stats,
    });
  } catch (error) {
    console.error('Error syncing EatClub:', error);
    return NextResponse.json(
      { error: 'Failed to sync EatClub', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
