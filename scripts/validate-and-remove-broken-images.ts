// Load environment variables FIRST using dotenv
require('dotenv').config({ path: '.env.local' });

import { db } from '../src/lib/db';
import { restaurants, incorrectImages } from '../src/lib/schema';
import { eq, and, or, isNotNull, ne, sql } from 'drizzle-orm';

interface CleanupStats {
  total: number;
  processed: number;
  cleaned: number;
  imagesRemoved: number;
  imagesChecked: number;
  errors: number;
}

/**
 * Check if an image URL is accessible
 */
async function checkImageUrl(url: string, timeout = 10000): Promise<boolean> {
  try {
    // Try HEAD request first (faster)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      clearTimeout(timeoutId);
      
      // Check if response is OK and content-type is an image
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.startsWith('image/')) {
          return true;
        }
        // Some servers don't return content-type for HEAD, so try GET
      }
    } catch (headError: any) {
      clearTimeout(timeoutId);
      
      // If HEAD fails, try GET request
      if (headError.name !== 'AbortError') {
        const getController = new AbortController();
        const getTimeoutId = setTimeout(() => getController.abort(), timeout);
        
        try {
          const getResponse = await fetch(url, {
            method: 'GET',
            signal: getController.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          });
          
          clearTimeout(getTimeoutId);
          
          if (getResponse.ok) {
            const contentType = getResponse.headers.get('content-type') || '';
            if (contentType.startsWith('image/')) {
              return true;
            }
          }
        } catch (getError: any) {
          clearTimeout(getTimeoutId);
          // Image failed to load
          return false;
        }
      }
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Check if restaurant has deals (would appear on main page)
 */
function hasDeals(restaurant: any): boolean {
  const happyHour = restaurant.happyHour;
  const weeklySpecials = restaurant.weeklySpecials;
  const deals = restaurant.deals;
  const hasEatClubUrl = restaurant.eatClubUrl !== null && restaurant.eatClubUrl !== undefined && restaurant.eatClubUrl !== '';
  const hasFirstTableUrl = restaurant.firstTableUrl !== null && restaurant.firstTableUrl !== undefined && restaurant.firstTableUrl !== '';
  
  const hasDirectDeals = (
    (happyHour !== null && happyHour !== undefined) ||
    (weeklySpecials !== null && weeklySpecials !== undefined && Array.isArray(weeklySpecials) && weeklySpecials.length > 0) ||
    (deals !== null && deals !== undefined && Array.isArray(deals) && deals.length > 0)
  );
  
  return hasDirectDeals || hasEatClubUrl || hasFirstTableUrl;
}

async function main() {
  console.log('🔍 Starting image validation for restaurants with deals...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set!');
    process.exit(1);
  }

  const stats: CleanupStats = {
    total: 0,
    processed: 0,
    cleaned: 0,
    imagesRemoved: 0,
    imagesChecked: 0,
    errors: 0,
  };

  try {
    // Get all active restaurants with images
    console.log('📋 Finding restaurants with deals and images...');
    const allRestaurants = await db
      .select()
      .from(restaurants)
      .where(
        and(
          eq(restaurants.status, 'active'),
          isNotNull(restaurants.imageUrls)
        )
      )
      .limit(2000);
    
    // Filter out restaurants with empty image arrays
    const restaurantsWithImages = allRestaurants.filter(r => {
      const imageUrls = r.imageUrls as string[] | null;
      return imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0;
    });

    // Filter to only restaurants with deals (main page restaurants)
    const restaurantsWithDeals = restaurantsWithImages.filter(hasDeals);
    
    stats.total = restaurantsWithDeals.length;
    console.log(`   Found ${stats.total} restaurants with deals and images\n`);

    if (stats.total === 0) {
      console.log('✅ No restaurants with deals and images found.');
      return;
    }

    // Process each restaurant
    for (let i = 0; i < restaurantsWithDeals.length; i++) {
      const restaurant = restaurantsWithDeals[i];
      stats.processed++;

      try {
        const imageUrls = restaurant.imageUrls as string[] | null;
        
        if (!imageUrls || imageUrls.length === 0) {
          continue;
        }

        const validImages: string[] = [];
        const brokenImages: string[] = [];

        // Check each image URL
        for (const imageUrl of imageUrls) {
          stats.imagesChecked++;
          
          // Skip if already marked as incorrect
          const existingIncorrect = await db
            .select()
            .from(incorrectImages)
            .where(eq(incorrectImages.imageUrl, imageUrl))
            .limit(1);
          
          if (existingIncorrect.length > 0) {
            console.log(`   ⏭️  Skipping already marked incorrect: ${imageUrl.substring(0, 60)}...`);
            continue;
          }

          // Check if image loads
          const isValid = await checkImageUrl(imageUrl);
          
          if (isValid) {
            validImages.push(imageUrl);
          } else {
            brokenImages.push(imageUrl);
            console.log(`   ❌ Broken image: ${imageUrl.substring(0, 80)}...`);
          }
          
          // Rate limiting - wait 500ms between checks
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (brokenImages.length > 0) {
          // Mark broken images as incorrect
          for (const imageUrl of brokenImages) {
            try {
              await db.insert(incorrectImages).values({
                imageUrl,
                restaurantId: restaurant.id.toString(),
                restaurantName: restaurant.name,
                reason: 'Image failed to load',
              }).onConflictDoNothing();
            } catch (e) {
              // Ignore if already exists
            }
          }

          // Update restaurant with only valid images
          await db.update(restaurants)
            .set({
              imageUrls: validImages.length > 0 ? validImages : null,
              updatedAt: new Date(),
            })
            .where(eq(restaurants.id, restaurant.id));

          stats.cleaned++;
          stats.imagesRemoved += brokenImages.length;
          
          console.log(`[${stats.processed}/${stats.total}] ${restaurant.name}: Removed ${brokenImages.length} broken image(s), kept ${validImages.length} valid`);
        } else if (stats.processed % 50 === 0) {
          console.log(`[${stats.processed}/${stats.total}] All images valid for ${restaurant.name}`);
        }
      } catch (error) {
        stats.errors++;
        console.error(`   ❌ Error processing ${restaurant.name} (ID: ${restaurant.id}):`, error);
      }
    }

    // Print summary
    console.log('\n📊 Summary:');
    console.log(`   Total restaurants checked: ${stats.total}`);
    console.log(`   Processed: ${stats.processed}`);
    console.log(`   Restaurants cleaned: ${stats.cleaned}`);
    console.log(`   Images checked: ${stats.imagesChecked}`);
    console.log(`   Broken images removed: ${stats.imagesRemoved}`);
    console.log(`   Errors: ${stats.errors}`);

    if (stats.cleaned > 0) {
      console.log(`\n✅ Successfully removed ${stats.imagesRemoved} broken image(s) from ${stats.cleaned} restaurant(s)!`);
      console.log(`   Images marked as incorrect to prevent re-adding`);
    } else {
      console.log(`\n✅ All images are loading correctly!`);
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
