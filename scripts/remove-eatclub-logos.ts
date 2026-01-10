// Load environment variables FIRST using dotenv
require('dotenv').config({ path: '.env.local' });

import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq } from 'drizzle-orm';
import { filterEatClubLogos } from '../src/lib/eatclub';

interface CleanupStats {
  total: number;
  processed: number;
  cleaned: number;
  logosRemoved: number;
  errors: number;
}

async function main() {
  console.log('🧹 Starting EatClub logo cleanup...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set!');
    process.exit(1);
  }

  const stats: CleanupStats = {
    total: 0,
    processed: 0,
    cleaned: 0,
    logosRemoved: 0,
    errors: 0,
  };

  try {
    // Get all restaurants with images
    console.log('📋 Finding restaurants with images...');
    const allRestaurants = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.status, 'active'))
      .limit(2000);

    stats.total = allRestaurants.length;
    console.log(`   Found ${stats.total} restaurants to check\n`);

    // Process each restaurant
    for (let i = 0; i < allRestaurants.length; i++) {
      const restaurant = allRestaurants[i];
      stats.processed++;

      try {
        const imageUrls = restaurant.imageUrls as string[] | null;
        
        if (!imageUrls || imageUrls.length === 0) {
          continue;
        }

        // Filter out EatClub logos
        const filteredImages = filterEatClubLogos(imageUrls);
        const logosRemoved = imageUrls.length - filteredImages.length;

        if (logosRemoved > 0) {
          await db.update(restaurants)
            .set({
              imageUrls: filteredImages.length > 0 ? filteredImages : null,
              updatedAt: new Date(),
            })
            .where(eq(restaurants.id, restaurant.id));

          stats.cleaned++;
          stats.logosRemoved += logosRemoved;
          
          if (stats.cleaned % 10 === 0) {
            console.log(`[${stats.processed}/${stats.total}] Cleaned ${stats.cleaned} restaurants, removed ${stats.logosRemoved} logo images`);
          }
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
    console.log(`   Cleaned: ${stats.cleaned}`);
    console.log(`   Logo images removed: ${stats.logosRemoved}`);
    console.log(`   Errors: ${stats.errors}`);

    if (stats.cleaned > 0) {
      console.log(`\n✅ Successfully removed EatClub logos from ${stats.cleaned} restaurant(s)!`);
    } else {
      console.log(`\n✅ No EatClub logos found in restaurant images.`);
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();

