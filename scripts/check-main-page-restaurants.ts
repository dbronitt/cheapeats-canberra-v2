import 'dotenv/config';
import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq } from 'drizzle-orm';

/**
 * Check how many restaurants qualify for the main page
 * A restaurant qualifies if:
 * - status === 'active'
 * - Has at least one deal (happy hour, weekly specials, deals, EatClub URL, or First Table URL)
 */
async function checkMainPageRestaurants() {
  console.log('🔍 Checking restaurants that qualify for main page...\n');

  // Get all active restaurants
  const allActive = await db.select().from(restaurants)
    .where(eq(restaurants.status, 'active'));

  console.log(`📊 Total active restaurants: ${allActive.length}\n`);

  // Filter restaurants that qualify for main page
  const qualifyingRestaurants = allActive.filter(restaurant => {
    const happyHour = restaurant.happyHour;
    const weeklySpecials = restaurant.weeklySpecials;
    const deals = restaurant.deals;
    const hasEatClubUrl = restaurant.eatClubUrl !== null && restaurant.eatClubUrl !== undefined && restaurant.eatClubUrl !== '';
    const hasFirstTableUrl = restaurant.firstTableUrl !== null && restaurant.firstTableUrl !== undefined && restaurant.firstTableUrl !== '';

    // Check if restaurant has any direct deals
    const hasDirectDeals = (
      (happyHour !== null && happyHour !== undefined) ||
      (weeklySpecials !== null && weeklySpecials !== undefined && Array.isArray(weeklySpecials) && weeklySpecials.length > 0) ||
      (deals !== null && deals !== undefined && Array.isArray(deals) && deals.length > 0)
    );

    // Include restaurants with direct deals OR platform links (EatClub/FirstTable)
    return hasDirectDeals || hasEatClubUrl || hasFirstTableUrl;
  });

  console.log(`✅ Restaurants that qualify for main page: ${qualifyingRestaurants.length}\n`);

  // Show breakdown
  const withHappyHour = qualifyingRestaurants.filter(r => r.happyHour !== null && r.happyHour !== undefined).length;
  const withWeeklySpecials = qualifyingRestaurants.filter(r => 
    r.weeklySpecials !== null && 
    r.weeklySpecials !== undefined && 
    Array.isArray(r.weeklySpecials) && 
    r.weeklySpecials.length > 0
  ).length;
  const withDeals = qualifyingRestaurants.filter(r => 
    r.deals !== null && 
    r.deals !== undefined && 
    Array.isArray(r.deals) && 
    r.deals.length > 0
  ).length;
  const withEatClub = qualifyingRestaurants.filter(r => 
    r.eatClubUrl !== null && r.eatClubUrl !== undefined && r.eatClubUrl !== ''
  ).length;
  const withFirstTable = qualifyingRestaurants.filter(r => 
    r.firstTableUrl !== null && r.firstTableUrl !== undefined && r.firstTableUrl !== ''
  ).length;

  console.log('📈 Breakdown by deal type:');
  console.log(`   Happy Hour: ${withHappyHour}`);
  console.log(`   Weekly Specials: ${withWeeklySpecials}`);
  console.log(`   Current Deals: ${withDeals}`);
  console.log(`   EatClub URL: ${withEatClub}`);
  console.log(`   First Table URL: ${withFirstTable}`);
  console.log('');

  // Find restaurants that DON'T qualify
  const notQualifying = allActive.filter(restaurant => {
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

    return !(hasDirectDeals || hasEatClubUrl || hasFirstTableUrl);
  });

  if (notQualifying.length > 0) {
    console.log(`⚠️  Active restaurants WITHOUT deals (${notQualifying.length}):`);
    notQualifying.slice(0, 20).forEach(r => {
      console.log(`   - ${r.name} (ID: ${r.id})`);
    });
    if (notQualifying.length > 20) {
      console.log(`   ... and ${notQualifying.length - 20} more`);
    }
    console.log('');
  }

  // Check pagination
  console.log('📄 Pagination info:');
  console.log(`   Default limit per page: 50`);
  console.log(`   Total qualifying restaurants: ${qualifyingRestaurants.length}`);
  console.log(`   Total pages needed: ${Math.ceil(qualifyingRestaurants.length / 50)}`);
  console.log(`   Restaurants on page 1: ${Math.min(50, qualifyingRestaurants.length)}`);
  if (qualifyingRestaurants.length > 50) {
    console.log(`   Restaurants on page 2+: ${qualifyingRestaurants.length - 50}`);
  }
  console.log('');

  // List all qualifying restaurants
  console.log('📋 All qualifying restaurants:');
  qualifyingRestaurants.forEach((r, index) => {
    const dealTypes = [];
    if (r.happyHour) dealTypes.push('HH');
    if (r.weeklySpecials && Array.isArray(r.weeklySpecials) && r.weeklySpecials.length > 0) dealTypes.push('WS');
    if (r.deals && Array.isArray(r.deals) && r.deals.length > 0) dealTypes.push('Deals');
    if (r.eatClubUrl) dealTypes.push('EatClub');
    if (r.firstTableUrl) dealTypes.push('FirstTable');
    
    console.log(`   ${index + 1}. ${r.name} [${dealTypes.join(', ')}]`);
  });
}

checkMainPageRestaurants()
  .then(() => {
    console.log('\n✅ Check completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Check failed:', error);
    process.exit(1);
  });
