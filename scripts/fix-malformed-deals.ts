// Load environment variables FIRST using dotenv (must use require for synchronous loading)
require('dotenv').config({ path: '.env.local' });

import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema/restaurants';
import { sql, eq } from 'drizzle-orm';

/**
 * Check if a deal has formatting issues (malformed EatClub deals)
 */
function isMalformedDeal(deal: any): boolean {
  if (!deal || typeof deal !== 'object') return false;
  
  const title = (deal.title || '').toLowerCase();
  const description = (deal.description || '').toLowerCase();
  
  // Check for concatenated day abbreviations (e.g., "today30% offfri30% off")
  const concatenatedDayPattern = /(today|fri|sat|sun|mon|tue|wed|thu|none)(\d+%|none)/;
  if (concatenatedDayPattern.test(title) || concatenatedDayPattern.test(description)) {
    return true;
  }
  
  // Check for patterns like "Today30% Offfri30% Offsat30% Off..."
  if (/today\d+%\s*off(fri|sat|sun|mon|tue|wed|thu)\d+%/.test(title) ||
      /today\d+%\s*off(fri|sat|sun|mon|tue|wed|thu)\d+%/.test(description)) {
    return true;
  }
  
  return false;
}

/**
 * Fix malformed deals by replacing them with standardized EatClub deal
 */
function fixDeals(deals: any[]): any[] {
  if (!Array.isArray(deals)) return [];
  
  const fixedDeals: any[] = [];
  let hasEatClubDeal = false;
  
  for (const deal of deals) {
    // Skip malformed EatClub deals
    if (deal.source === 'EatClub' && isMalformedDeal(deal)) {
      console.log(`     Removing malformed deal: "${deal.title?.substring(0, 50)}..."`);
      continue;
    }
    
    // Keep non-EatClub deals
    if (deal.source !== 'EatClub') {
      fixedDeals.push(deal);
      continue;
    }
    
    // Keep properly formatted EatClub deals
    if (deal.source === 'EatClub' && !isMalformedDeal(deal)) {
      fixedDeals.push(deal);
      hasEatClubDeal = true;
    }
  }
  
  // Add standardized EatClub deal if we removed malformed ones or if there's an EatClub URL
  // We'll check for EatClub URL in the main function
  return fixedDeals;
}

/**
 * Main function to fix malformed deals
 */
async function fixMalformedDeals() {
  console.log('🔧 Fixing Malformed EatClub Deals');
  console.log('==================================\n');
  
  try {
    // Get all restaurants with deals
    const allRestaurants = await db.select({
      id: restaurants.id,
      name: restaurants.name,
      deals: restaurants.deals,
      eatClubUrl: restaurants.eatClubUrl,
    }).from(restaurants);
    
    console.log(`📊 Found ${allRestaurants.length} restaurants to check\n`);
    
    let fixedCount = 0;
    let restaurantsFixed: Array<{ id: number; name: string }> = [];
    
    for (const restaurant of allRestaurants) {
      const deals = restaurant.deals as any[] | null;
      if (!deals || !Array.isArray(deals) || deals.length === 0) {
        continue;
      }
      
      // Check if any deals are malformed
      const hasMalformedDeal = deals.some(deal => deal.source === 'EatClub' && isMalformedDeal(deal));
      
      if (hasMalformedDeal) {
        console.log(`🔴 Restaurant ID ${restaurant.id}: ${restaurant.name}`);
        console.log(`   Found malformed EatClub deal(s)`);
        
        // Fix the deals
        let fixedDeals = fixDeals(deals);
        
        // If restaurant has EatClub URL but no EatClub deal after fixing, add standardized one
        if (restaurant.eatClubUrl && !fixedDeals.some((d: any) => d.source === 'EatClub')) {
          fixedDeals.push({
            title: 'EatClub Deal Available',
            description: 'Check out our EatClub deals!',
            source: 'EatClub',
            validUntil: null,
          });
          console.log(`   Added standardized EatClub deal`);
        }
        
        // Update restaurant in database
        await db.update(restaurants)
          .set({
            deals: fixedDeals.length > 0 ? fixedDeals : null,
            updatedAt: new Date(),
          })
          .where(eq(restaurants.id, restaurant.id));
        
        fixedCount++;
        restaurantsFixed.push({ id: restaurant.id, name: restaurant.name });
        console.log(`   ✅ Fixed deals for restaurant ID ${restaurant.id}\n`);
      }
    }
    
    console.log('\n📋 Summary');
    console.log('==========');
    console.log(`✅ Fixed ${fixedCount} restaurant(s) with malformed deals`);
    
    if (restaurantsFixed.length > 0) {
      console.log('\n📝 Restaurants fixed:');
      restaurantsFixed.forEach(r => {
        console.log(`   - ID ${r.id}: ${r.name}`);
      });
    }
    
    console.log('\n✅ All malformed deals have been fixed!');
    
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error fixing malformed deals:');
    console.error(`   Message: ${error.message || error}`);
    console.error(`   Stack: ${error.stack || 'No stack trace'}`);
    process.exit(1);
  }
}

// Run the fix
fixMalformedDeals();
