/**
 * One-time script to set all restaurants without deals to inactive status
 * Run with: npx tsx -r dotenv/config scripts/set-no-deals-to-inactive.ts dotenv_config_path=.env.local
 */

import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq } from 'drizzle-orm';

async function setNoDealsToInactive() {
  try {
    console.log('Fetching all restaurants...');
    
    // Get all restaurants
    const allRestaurants = await db.select().from(restaurants);
    
    console.log(`Found ${allRestaurants.length} restaurants`);
    
    // Helper function to check if restaurant has deals
    const hasDeals = (restaurant: any): boolean => {
      const happyHour = restaurant.happyHour;
      const weeklySpecials = restaurant.weeklySpecials;
      const deals = restaurant.deals;
      const hasEatClubUrl = restaurant.eatClubUrl !== null && restaurant.eatClubUrl !== undefined && restaurant.eatClubUrl !== '';
      const hasFirstTableUrl = restaurant.firstTableUrl !== null && restaurant.firstTableUrl !== undefined && restaurant.firstTableUrl !== '';
      
      return (
        (happyHour !== null && happyHour !== undefined) ||
        (weeklySpecials !== null && weeklySpecials !== undefined && Array.isArray(weeklySpecials) && weeklySpecials.length > 0) ||
        (deals !== null && deals !== undefined && Array.isArray(deals) && deals.length > 0) ||
        hasEatClubUrl ||
        hasFirstTableUrl
      );
    };

    // Find restaurants without deals
    const restaurantsWithoutDeals = allRestaurants.filter(r => !hasDeals(r));
    
    console.log(`Found ${restaurantsWithoutDeals.length} restaurants without deals`);
    
    if (restaurantsWithoutDeals.length === 0) {
      console.log('No restaurants to update. Exiting.');
      process.exit(0);
    }

    // Show preview
    console.log('\nRestaurants that will be set to inactive:');
    restaurantsWithoutDeals.slice(0, 10).forEach(r => {
      console.log(`  - ${r.name} (ID: ${r.id}, Current status: ${r.status})`);
    });
    if (restaurantsWithoutDeals.length > 10) {
      console.log(`  ... and ${restaurantsWithoutDeals.length - 10} more`);
    }

    // Ask for confirmation
    console.log(`\n⚠️  This will set ${restaurantsWithoutDeals.length} restaurants to inactive status.`);
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
    
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Update restaurants
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const restaurant of restaurantsWithoutDeals) {
      // Only update if not already inactive or closed
      if (restaurant.status === 'active') {
        await db
          .update(restaurants)
          .set({
            status: 'inactive',
            updatedAt: new Date(),
          })
          .where(eq(restaurants.id, restaurant.id));
        updatedCount++;
      } else {
        skippedCount++;
      }
    }

    console.log(`\n✅ Update complete!`);
    console.log(`   - Updated: ${updatedCount} restaurants set to inactive`);
    console.log(`   - Skipped: ${skippedCount} restaurants (already inactive/closed)`);
    console.log(`   - Total processed: ${restaurantsWithoutDeals.length}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    process.exit(1);
  }
}

setNoDealsToInactive();
