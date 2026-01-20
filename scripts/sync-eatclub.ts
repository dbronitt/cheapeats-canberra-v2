// Load environment variables FIRST using dotenv - MUST be before any imports
require('dotenv').config({ path: '.env.local' });

// Now import after dotenv has loaded
const { db } = require('../src/lib/db');
const { restaurants } = require('../src/lib/schema');
const { eq, isNotNull } = require('drizzle-orm');
const { scrapeEatClubVenue, searchEatClubCanberra, matchEatClubToRestaurant, filterEatClubLogos, fetchEatClubCanberraVenueUrls } = require('../src/lib/eatclub');

interface SyncStats {
  total: number;
  processed: number;
  updated: number;
  dealsFound: number;
  imagesFound: number;
  removed: number; // Restaurants removed because not found in EatClub
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
  
  // Filter out EatClub logos from existing images
  const filteredExistingImages = filterEatClubLogos(existingImages);
  
  // Combine images, avoiding duplicates and filtering logos
  const allImages = [...filteredExistingImages];
  for (const img of newImages) {
    if (!allImages.includes(img)) {
      allImages.push(img);
    }
  }
  
  // Final filter to remove any logos that might have slipped through
  const finalImages = filterEatClubLogos(allImages);

  // Get current deals
  const currentDeals = (await db.select({ deals: restaurants.deals })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1))[0]?.deals as Array<any> | null;

  // Update deals if there's a deal
  let deals = currentDeals || [];
  
  if (hasDeal) {
    // Check if EatClub deal already exists
    const eatClubDealIndex = deals.findIndex((d: any) => d.source === 'EatClub');
    
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

async function main() {
  console.log('🍽️ Starting EatClub sync...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set!');
    process.exit(1);
  }

  const stats: SyncStats = {
    total: 0,
    processed: 0,
    updated: 0,
    dealsFound: 0,
    imagesFound: 0,
    removed: 0,
    errors: 0,
  };

  try {
    // Option 1: Search EatClub for all Canberra venues
    console.log('🔍 Searching EatClub for Canberra venues...');
    const eatClubVenueUrls = await fetchEatClubCanberraVenueUrls();
    const eatClubVenueUrlSet = new Set(eatClubVenueUrls.map((u: string) => (u || '').split('?')[0]));
    const eatClubVenues = await searchEatClubCanberra();
    console.log(`   Found ${eatClubVenues.length} venues on EatClub\n`);

    // Option 2: Process restaurants that already have EatClub URLs
    console.log('📋 Finding restaurants with EatClub URLs...');
    const restaurantsWithEatClub = await db
      .select()
      .from(restaurants)
      .where(
        isNotNull(restaurants.eatClubUrl)
      )
      .limit(200);

    stats.total = restaurantsWithEatClub.length;
    console.log(`   Found ${stats.total} restaurants with EatClub URLs\n`);

    // Process restaurants with existing EatClub URLs
    for (let i = 0; i < restaurantsWithEatClub.length; i++) {
      const restaurant = restaurantsWithEatClub[i];
      stats.processed++;

      console.log(`[${stats.processed}/${stats.total}] Processing: ${restaurant.name} (ID: ${restaurant.id})`);

      try {
        if (!restaurant.eatClubUrl) {
          continue;
        }

        // Scrape the EatClub page
        const eatClubVenue = await scrapeEatClubVenue(restaurant.eatClubUrl);

        if (eatClubVenue) {
          const hasDeal = !!(eatClubVenue.dealTitle || eatClubVenue.dealDescription);
          const hasImages = !!(eatClubVenue.imageUrls && eatClubVenue.imageUrls.length > 0);

          if (hasDeal || hasImages) {
            await updateRestaurantWithEatClub(restaurant.id, eatClubVenue, hasDeal);
            stats.updated++;
            
            if (hasDeal) {
              stats.dealsFound++;
              console.log(`   ✅ Found deal`);
            }
            if (hasImages) {
              stats.imagesFound++;
              console.log(`   ✅ Found ${eatClubVenue.imageUrls?.length || 0} image(s)`);
            }
            console.log(`   ✅ Updated restaurant`);
          } else {
            console.log(`   ⏭️  No deals or images found`);
          }
        } else {
          console.log(`   ⏭️  Could not scrape EatClub page`);
        }

        // Rate limiting
        if (i < restaurantsWithEatClub.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        stats.errors++;
        console.error(`   ❌ Error:`, error);
      }

      console.log('');
    }

    // Also try to match EatClub venues to restaurants without EatClub URLs
    if (eatClubVenues.length > 0) {
      console.log('\n🔍 Matching EatClub venues to restaurants without EatClub URLs...');
      
      const restaurantsWithoutEatClub = await db
        .select()
        .from(restaurants)
        .where(
          eq(restaurants.status, 'active')
        )
        .limit(500);

      let matched = 0;
      for (const restaurant of restaurantsWithoutEatClub) {
        if (restaurant.eatClubUrl) {
          continue; // Skip if already has EatClub URL
        }

        // Try to find a match
        for (const venue of eatClubVenues) {
          if (matchEatClubToRestaurant(venue, restaurant.name, restaurant.suburb)) {
            console.log(`   ✅ Matched: ${restaurant.name} -> ${venue.name}`);
            
            const hasDeal = !!(venue.dealTitle || venue.dealDescription);
            await updateRestaurantWithEatClub(restaurant.id, venue, hasDeal);
            matched++;
            
            if (hasDeal) stats.dealsFound++;
            if (venue.imageUrls?.length) stats.imagesFound++;
            
            break; // Found a match, move to next restaurant
          }
        }
      }
      
      console.log(`   Matched ${matched} restaurants\n`);
    }

    // Check for restaurants with EatClub URLs that are no longer in EatClub search results
    if (eatClubVenueUrls.length > 0) {
      console.log('\n🔍 Checking for restaurants no longer found in EatClub...');
      
      // Get all restaurants with EatClub URLs
      const allRestaurantsWithEatClub = await db
        .select({
          id: restaurants.id,
          name: restaurants.name,
          suburb: restaurants.suburb,
          eatClubUrl: restaurants.eatClubUrl,
        })
        .from(restaurants)
        .where(
          isNotNull(restaurants.eatClubUrl)
        );

      console.log(`   Checking ${allRestaurantsWithEatClub.length} restaurants with EatClub URLs...`);

      for (const restaurant of allRestaurantsWithEatClub) {
        const restaurantUrl = (restaurant.eatClubUrl || '').split('?')[0];
        const restaurantSlug = restaurantUrl.match(/venue\/([^\/\?]+)/)?.[1]?.toLowerCase();

        const urlMatchInCanberraList = restaurantUrl && eatClubVenueUrlSet.has(restaurantUrl);
        const slugMatchInCanberraList =
          !!restaurantSlug && Array.from(eatClubVenueUrlSet).some((u: string) => u.toLowerCase().includes(`/venue/${restaurantSlug}`));

        const found = urlMatchInCanberraList || slugMatchInCanberraList;

        if (!found) {
          // Extra safety: only remove if the venue page is actually gone (404).
          let confirmedGone = false;
          try {
            if (restaurantUrl) {
              const resp = await fetch(restaurantUrl, { redirect: 'follow' });
              if (resp.status === 404) confirmedGone = true;
            }
          } catch (e) {
            confirmedGone = false;
          }

          if (!confirmedGone) {
            console.log(`   ⚠️  Skipping removal (not confirmed gone): ${restaurant.name} (ID: ${restaurant.id}) ${restaurantUrl}`);
            continue;
          }

          console.log(`   ❌ Confirmed gone (404), removing EatClub URL: ${restaurant.name} (ID: ${restaurant.id})`);

          await db.update(restaurants)
            .set({
              eatClubUrl: null,
              updatedAt: new Date(),
            })
            .where(eq(restaurants.id, restaurant.id));

          stats.removed++;
          console.log(`   ✅ Removed EatClub URL from restaurant`);
        }
      }

      if (stats.removed > 0) {
        console.log(`\n   Removed EatClub URLs from ${stats.removed} restaurant(s) that are no longer on EatClub`);
      } else {
        console.log(`\n   ✅ All restaurants with EatClub URLs are still found in EatClub search`);
      }
    }

    // Print summary
    console.log('\n📊 Summary:');
    console.log(`   Total restaurants processed: ${stats.total}`);
    console.log(`   Updated: ${stats.updated}`);
    console.log(`   Deals found: ${stats.dealsFound}`);
    console.log(`   Images found: ${stats.imagesFound}`);
    console.log(`   Removed (not found in EatClub): ${stats.removed}`);
    console.log(`   Errors: ${stats.errors}`);

    if (stats.updated > 0) {
      console.log(`\n✅ Successfully synced ${stats.updated} restaurant(s) with EatClub data!`);
    }
    
    if (stats.removed > 0) {
      console.log(`\n✅ Removed EatClub URLs from ${stats.removed} restaurant(s) that are no longer on EatClub`);
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();

