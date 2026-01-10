// Load environment variables FIRST using dotenv
require('dotenv').config({ path: '.env.local' });

import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq, sql } from 'drizzle-orm';
import { searchEatClubCanberra, matchEatClubToRestaurant, scrapeEatClubVenue } from '../src/lib/eatclub';
import { createSlug } from '../src/lib/utils';

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
    // Get all active restaurants
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

    // Try to find a match
    for (const restaurant of allRestaurants) {
      const normalizedRestName = normalizeName(restaurant.name);

      // Exact name match
      if (normalizedEatClubName === normalizedRestName) {
        return restaurant.id;
      }

      // Partial match (one name contains the other)
      if (
        normalizedEatClubName.includes(normalizedRestName) ||
        normalizedRestName.includes(normalizedEatClubName)
      ) {
        // Check suburb match if available
        if (
          !eatClubVenue.suburb ||
          !restaurant.suburb ||
          eatClubVenue.suburb.toLowerCase() === restaurant.suburb.toLowerCase()
        ) {
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

async function addNewRestaurant(eatClubVenue: any): Promise<boolean> {
  try {
    const slug = createSlug(eatClubVenue.name);
    
    // Check if slug already exists (might be a duplicate)
    const existing = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      console.log(`   ⚠️  Slug already exists: ${slug} (${existing[0].name})`);
      return false;
    }

    // Insert new restaurant
    await db.insert(restaurants).values({
      name: eatClubVenue.name,
      slug: slug,
      address: eatClubVenue.address || null,
      suburb: eatClubVenue.suburb || null,
      cuisine: eatClubVenue.cuisine || null,
      eatClubUrl: eatClubVenue.url,
      imageUrls: eatClubVenue.imageUrls && eatClubVenue.imageUrls.length > 0 
        ? eatClubVenue.imageUrls 
        : null,
      deals: (eatClubVenue.dealTitle || eatClubVenue.dealDescription) 
        ? [{
            title: 'EatClub Deal Available',
            description: 'Check out our EatClub deals!',
            source: 'EatClub'
          }]
        : null,
      status: 'active',
    });

    return true;
  } catch (error) {
    console.error(`Error adding restaurant ${eatClubVenue.name}:`, error);
    return false;
  }
}

async function updateRestaurantWithEatClub(restaurantId: number, eatClubVenue: any): Promise<void> {
  try {
    const currentRestaurant = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1);

    if (currentRestaurant.length === 0) return;

    const restaurant = currentRestaurant[0];
    const currentImageUrls = (restaurant.imageUrls as string[] | null) || [];
    const newImages = eatClubVenue.imageUrls || [];
    
    // Combine images, avoiding duplicates
    const allImages = [...currentImageUrls];
    for (const img of newImages) {
      if (!allImages.includes(img)) {
        allImages.push(img);
      }
    }

    // Update deals if there's a deal
    const currentDeals = (restaurant.deals as Array<any> | null) || [];
    let deals = [...currentDeals];
    
    if (eatClubVenue.dealTitle || eatClubVenue.dealDescription) {
      const eatClubDealIndex = deals.findIndex((d: any) => d.source === 'EatClub');
      // Always use standardized format for EatClub deals
      const newDeal = {
        title: 'EatClub Deal Available',
        description: 'Check out our EatClub deals!',
        source: 'EatClub'
      };
      
      if (eatClubDealIndex >= 0) {
        deals[eatClubDealIndex] = newDeal;
      } else {
        deals.push(newDeal);
      }
    }

    await db.update(restaurants)
      .set({
        eatClubUrl: eatClubVenue.url,
        imageUrls: allImages.length > 0 ? allImages : null,
        deals: deals.length > 0 ? deals : null,
        updatedAt: new Date(),
      })
      .where(eq(restaurants.id, restaurantId));
  } catch (error) {
    console.error(`Error updating restaurant ${restaurantId}:`, error);
    throw error;
  }
}

async function main() {
  console.log('🔍 Searching EatClub for new restaurants...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set!');
    process.exit(1);
  }

  const stats: Stats = {
    totalEatClubVenues: 0,
    matched: 0,
    newRestaurants: 0,
    errors: 0,
  };

  const newRestaurants: NewRestaurant[] = [];
  const restaurantsToUpdate: Array<{ id: number; venue: any }> = [];

  try {
    // Search EatClub for all Canberra venues
    console.log('📋 Searching EatClub for Canberra venues...');
    const eatClubVenues = await searchEatClubCanberra();
    stats.totalEatClubVenues = eatClubVenues.length;
    console.log(`   Found ${eatClubVenues.length} venues on EatClub\n`);

    if (eatClubVenues.length === 0) {
      console.log('⚠️  No venues found via search page scraping.');
      console.log('💡 This might be because EatClub uses JavaScript to load content.');
      console.log('💡 Alternative: We can check restaurants that already have EatClub URLs.\n');
      
      // Alternative approach: Get restaurants with EatClub URLs and check for updates
      console.log('📋 Checking restaurants with existing EatClub URLs...');
      const restaurantsWithEatClub = await db
        .select({
          id: restaurants.id,
          name: restaurants.name,
          eatClubUrl: restaurants.eatClubUrl,
        })
        .from(restaurants)
        .where(eq(restaurants.status, 'active'))
        .limit(200);

      console.log(`   Found ${restaurantsWithEatClub.length} restaurants with EatClub URLs`);
      console.log('   These can be synced using: npm run sync:eatclub\n');
      
      if (restaurantsWithEatClub.length === 0) {
        console.log('⚠️  No restaurants with EatClub URLs found in database.');
        console.log('💡 To discover new restaurants, you may need to:');
        console.log('   1. Manually browse EatClub and add URLs to restaurants');
        console.log('   2. Use the sync script to update existing restaurants: npm run sync:eatclub');
        console.log('   3. Check if EatClub has an API or different search method');
        return;
      }
      
      return;
    }

    // Process each venue
    console.log('🔎 Checking each venue against database...\n');
    
    for (let i = 0; i < eatClubVenues.length; i++) {
      const venue = eatClubVenues[i];
      console.log(`[${i + 1}/${eatClubVenues.length}] Checking: ${venue.name}`);

      try {
        // Try to find a matching restaurant
        const matchingId = await findMatchingRestaurant(venue);

        if (matchingId) {
          console.log(`   ✅ Matched with existing restaurant (ID: ${matchingId})`);
          
          // Check if restaurant already has EatClub URL
          const existing = await db
            .select({ eatClubUrl: restaurants.eatClubUrl })
            .from(restaurants)
            .where(eq(restaurants.id, matchingId))
            .limit(1);

          if (!existing[0]?.eatClubUrl) {
            console.log(`   📝 Will update with EatClub URL`);
            restaurantsToUpdate.push({ id: matchingId, venue });
          } else {
            console.log(`   ℹ️  Already has EatClub URL`);
          }
          stats.matched++;
        } else {
          console.log(`   🆕 NEW RESTAURANT FOUND!`);
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
        console.error(`   ❌ Error processing ${venue.name}:`, error);
      }

      console.log('');
    }

    // Print summary
    console.log('\n📊 Summary:');
    console.log(`   Total EatClub venues: ${stats.totalEatClubVenues}`);
    console.log(`   Matched existing: ${stats.matched}`);
    console.log(`   New restaurants found: ${stats.newRestaurants}`);
    console.log(`   Restaurants to update: ${restaurantsToUpdate.length}`);
    console.log(`   Errors: ${stats.errors}`);

    // Show new restaurants
    if (newRestaurants.length > 0) {
      console.log('\n🆕 NEW RESTAURANTS FOUND:');
      newRestaurants.forEach((restaurant, idx) => {
        console.log(`\n${idx + 1}. ${restaurant.name}`);
        if (restaurant.address) console.log(`   Address: ${restaurant.address}`);
        if (restaurant.suburb) console.log(`   Suburb: ${restaurant.suburb}`);
        if (restaurant.cuisine) console.log(`   Cuisine: ${restaurant.cuisine}`);
        console.log(`   EatClub URL: ${restaurant.url}`);
        if (restaurant.imageUrls && restaurant.imageUrls.length > 0) {
          console.log(`   Images: ${restaurant.imageUrls.length} found`);
        }
        if (restaurant.dealTitle || restaurant.dealDescription) {
          console.log(`   Deal: ${restaurant.dealTitle || restaurant.dealDescription}`);
        }
      });

      // Ask if user wants to add them (in interactive mode)
      console.log('\n💡 To add these restaurants, run with --add flag:');
      console.log('   npm run find:eatclub -- --add');
    }

    // Update restaurants that need EatClub URLs
    if (restaurantsToUpdate.length > 0) {
      console.log(`\n📝 Updating ${restaurantsToUpdate.length} restaurant(s) with EatClub data...`);
      
      for (const { id, venue } of restaurantsToUpdate) {
        try {
          await updateRestaurantWithEatClub(id, venue);
          console.log(`   ✅ Updated restaurant ID ${id}: ${venue.name}`);
        } catch (error) {
          console.error(`   ❌ Failed to update restaurant ID ${id}:`, error);
        }
      }
    }

    // Add new restaurants if --add flag is present
    const shouldAdd = process.argv.includes('--add');
    if (shouldAdd && newRestaurants.length > 0) {
      console.log(`\n➕ Adding ${newRestaurants.length} new restaurant(s)...`);
      
      for (const restaurant of newRestaurants) {
        try {
          const added = await addNewRestaurant(restaurant);
          if (added) {
            console.log(`   ✅ Added: ${restaurant.name}`);
          } else {
            console.log(`   ⚠️  Skipped: ${restaurant.name} (duplicate or error)`);
          }
        } catch (error) {
          console.error(`   ❌ Failed to add ${restaurant.name}:`, error);
        }
      }
    } else if (newRestaurants.length > 0) {
      console.log('\n💡 Run with --add flag to automatically add new restaurants to the database.');
    }

    console.log('\n✅ Search complete!');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();

