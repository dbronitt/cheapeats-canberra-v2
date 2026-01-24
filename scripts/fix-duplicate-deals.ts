/**
 * Find and remove duplicate deals from restaurants.
 * Checks for duplicates by title + description (case-insensitive).
 *
 * Usage:
 *   npm run fix:duplicate-deals
 *   npm run fix:duplicate-deals -- --dry-run
 */
require('dotenv').config({ path: '.env.local' });

import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq } from 'drizzle-orm';

function deduplicateDeals(deals: Array<any> | null): Array<any> | null {
  if (!deals || !Array.isArray(deals) || deals.length === 0) return deals;
  
  const seen = new Map<string, any>();
  const unique: any[] = [];
  
  for (const deal of deals) {
    const title = (deal.title || '').toLowerCase().trim();
    const desc = (deal.description || '').toLowerCase().trim();
    const key = `${title}-${desc}`;
    
    // Skip empty deals
    if (key === '-') continue;
    
    // Check if we've seen this exact combination
    if (!seen.has(key)) {
      seen.set(key, deal);
      unique.push(deal);
    }
  }
  
  return unique.length > 0 ? unique : null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log('🔍 Finding and fixing duplicate deals\n');
  if (dryRun) console.log('🔍 [DRY RUN] No changes will be saved\n');
  
  const allRestaurants = await db.select({
    id: restaurants.id,
    name: restaurants.name,
    deals: restaurants.deals,
  }).from(restaurants);
  
  let totalFixed = 0;
  let totalRemoved = 0;
  
  for (const r of allRestaurants) {
    const deals = r.deals as Array<any> | null;
    if (!deals || !Array.isArray(deals) || deals.length <= 1) continue;
    
    const originalCount = deals.length;
    const deduplicated = deduplicateDeals(deals);
    const newCount = deduplicated?.length || 0;
    const removed = originalCount - newCount;
    
    if (removed > 0) {
      console.log(`[${r.id}] ${r.name}: Removed ${removed} duplicate(s) (${originalCount} → ${newCount})`);
      totalFixed++;
      totalRemoved += removed;
      
      if (!dryRun) {
        await db.update(restaurants)
          .set({ deals: deduplicated, updatedAt: new Date() })
          .where(eq(restaurants.id, r.id));
      }
    }
  }
  
  console.log('\n✅ Done.');
  console.log(`Restaurants fixed: ${totalFixed}`);
  console.log(`Total duplicates removed: ${totalRemoved}`);
  if (dryRun) console.log('\n[DRY RUN] Run without --dry-run to apply changes');
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
