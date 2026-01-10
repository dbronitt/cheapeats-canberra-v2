import 'dotenv/config';
import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq, isNotNull } from 'drizzle-orm';

/**
 * Fix duplicate deals in the database
 * Removes duplicate deals based on normalized title and description
 */
function normalizeDealText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s$%]/g, '') // Remove special chars except $ and %
    .substring(0, 100); // Limit length for comparison
}

function areDealsDuplicate(deal1: any, deal2: any): boolean {
  const title1 = normalizeDealText(deal1.title || '');
  const title2 = normalizeDealText(deal2.title || '');
  const desc1 = normalizeDealText(deal1.description || '');
  const desc2 = normalizeDealText(deal2.description || '');
  
  // Exact match
  if (title1 === title2 && desc1 === desc2) {
    return true;
  }
  
  // If one title contains the other and descriptions match
  if (title1 && title2) {
    if ((title1.includes(title2) || title2.includes(title1)) && desc1 === desc2) {
      return true;
    }
  }
  
  // If one deal's title+description is contained in another's
  const full1 = `${title1} ${desc1}`.trim();
  const full2 = `${title2} ${desc2}`.trim();
  
  if (full1 && full2) {
    if (full1.includes(full2) || full2.includes(full1)) {
      // But only if they're similar enough (not just one word)
      const words1 = full1.split(/\s+/).length;
      const words2 = full2.split(/\s+/).length;
      if (words1 >= 3 && words2 >= 3) {
        return true;
      }
    }
  }
  
  return false;
}

async function fixDuplicateDeals() {
  console.log('🔍 Finding restaurants with duplicate deals...\n');

  // Get all restaurants with deals
  const allRestaurants = await db.select({
    id: restaurants.id,
    name: restaurants.name,
    deals: restaurants.deals,
  }).from(restaurants)
    .where(isNotNull(restaurants.deals));

  console.log(`📊 Total restaurants with deals: ${allRestaurants.length}\n`);

  let totalFixed = 0;
  const restaurantsToFix: Array<{
    id: number;
    name: string;
    originalCount: number;
    newCount: number;
  }> = [];

  for (const restaurant of allRestaurants) {
    const deals = restaurant.deals as Array<any> | null;
    if (!deals || !Array.isArray(deals) || deals.length === 0) continue;

    // Find duplicates
    const uniqueDeals: Array<any> = [];
    const seen = new Set<string>();

    for (const deal of deals) {
      let isDuplicate = false;
      
      // Check against already added unique deals
      for (const uniqueDeal of uniqueDeals) {
        if (areDealsDuplicate(deal, uniqueDeal)) {
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        uniqueDeals.push(deal);
        // Also track by normalized key for faster lookup
        const key = `${normalizeDealText(deal.title || '')}|${normalizeDealText(deal.description || '')}`;
        seen.add(key);
      }
    }

    if (uniqueDeals.length < deals.length) {
      const removed = deals.length - uniqueDeals.length;
      console.log(`   Fixing: ${restaurant.name} (ID: ${restaurant.id})`);
      console.log(`     Original deals: ${deals.length}`);
      console.log(`     Unique deals: ${uniqueDeals.length}`);
      console.log(`     Removed ${removed} duplicate(s)\n`);

      await db.update(restaurants)
        .set({
          deals: uniqueDeals.length > 0 ? uniqueDeals : null,
          updatedAt: new Date(),
        })
        .where(eq(restaurants.id, restaurant.id));

      restaurantsToFix.push({
        id: restaurant.id,
        name: restaurant.name,
        originalCount: deals.length,
        newCount: uniqueDeals.length,
      });
      totalFixed += removed;
    }
  }

  if (restaurantsToFix.length > 0) {
    console.log(`\n✨ Fixed ${restaurantsToFix.length} restaurants!`);
    console.log(`   Total duplicate deals removed: ${totalFixed}`);
  } else {
    console.log('✅ No duplicate deals found!');
  }
}

fixDuplicateDeals()
  .then(() => {
    console.log('\n✅ Fix completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  });
