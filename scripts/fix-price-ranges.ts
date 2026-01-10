import 'dotenv/config';
import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq, sql, or, isNotNull, notInArray, and } from 'drizzle-orm';

/**
 * Fix invalid priceRange values in the database
 * Valid values are only: $, $$, $$$, or $$$$
 */
async function fixPriceRanges() {
  console.log('🔍 Finding restaurants with invalid priceRange values...\n');

  // Get all restaurants with non-null priceRange
  const allRestaurants = await db.select({
    id: restaurants.id,
    name: restaurants.name,
    priceRange: restaurants.priceRange,
  }).from(restaurants)
    .where(isNotNull(restaurants.priceRange));

  console.log(`📊 Total restaurants with priceRange: ${allRestaurants.length}\n`);

  const validPriceRanges = ['$', '$$', '$$$', '$$$$'];
  const invalidRestaurants = allRestaurants.filter(r => 
    r.priceRange && !validPriceRanges.includes(r.priceRange)
  );

  console.log(`⚠️  Found ${invalidRestaurants.length} restaurants with invalid priceRange:\n`);

  if (invalidRestaurants.length > 0) {
    invalidRestaurants.forEach(r => {
      console.log(`   - ${r.name} (ID: ${r.id}): "${r.priceRange}"`);
    });
    console.log('');

    // Ask if we should fix them
    console.log('🔧 Fixing invalid priceRange values...\n');

    for (const restaurant of invalidRestaurants) {
      console.log(`   Fixing: ${restaurant.name} (ID: ${restaurant.id})`);
      console.log(`     Invalid value: "${restaurant.priceRange}"`);
      
      // Set to null (no price range)
      await db.update(restaurants)
        .set({
          priceRange: null,
          updatedAt: new Date(),
        })
        .where(eq(restaurants.id, restaurant.id));
      
      console.log(`     ✅ Set to null (no price range)\n`);
    }

    console.log(`✨ Fixed ${invalidRestaurants.length} restaurants!`);
  } else {
    console.log('✅ All priceRange values are valid!');
  }

  // Also check for any that might be empty strings
  const emptyStringRestaurants = await db.select({
    id: restaurants.id,
    name: restaurants.name,
    priceRange: restaurants.priceRange,
  }).from(restaurants)
    .where(sql`${restaurants.priceRange} = ''`);

  if (emptyStringRestaurants.length > 0) {
    console.log(`\n⚠️  Found ${emptyStringRestaurants.length} restaurants with empty string priceRange:\n`);
    
    for (const restaurant of emptyStringRestaurants) {
      console.log(`   Fixing: ${restaurant.name} (ID: ${restaurant.id})`);
      await db.update(restaurants)
        .set({
          priceRange: null,
          updatedAt: new Date(),
        })
        .where(eq(restaurants.id, restaurant.id));
      console.log(`     ✅ Set to null\n`);
    }
  }

  // Final verification
  console.log('\n🔍 Final verification...');
  const finalInvalid = await db.select({
    id: restaurants.id,
    name: restaurants.name,
    priceRange: restaurants.priceRange,
  }).from(restaurants)
    .where(
      and(
        isNotNull(restaurants.priceRange),
        notInArray(restaurants.priceRange, validPriceRanges)
      )
    );

  if (finalInvalid.length === 0) {
    console.log('✅ All priceRange values are now valid!');
  } else {
    console.log(`⚠️  Still found ${finalInvalid.length} invalid values (this shouldn't happen):`);
    finalInvalid.forEach(r => {
      console.log(`   - ${r.name} (ID: ${r.id}): "${r.priceRange}"`);
    });
  }
}

fixPriceRanges()
  .then(() => {
    console.log('\n✅ Fix completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  });
