import 'dotenv/config';
import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq, isNotNull } from 'drizzle-orm';

/**
 * Fix Happy Hour entries that contain food deals instead of drink deals
 * Happy Hour should only be about drinks/alcoholic beverages
 * Food deals should be moved to deals or weeklySpecials
 */
async function fixHappyHourFoodDeals() {
  console.log('🔍 Finding Happy Hour entries with food deals...\n');

  // Keywords that indicate food deals (not drinks)
  const foodKeywords = [
    'kids meal', 'kid meal', 'children meal', 'free kids', 'kids eat free',
    'schnitzel', 'schnitty', 'burger', 'pizza', 'pasta', 'taco', 'tacos',
    'steak', 'roast', 'lunch', 'dinner', 'meal', 'food', 'breakfast',
    'chicken', 'fish', 'beef', 'pork', 'lamb', 'veggie', 'vegetarian',
    'salad', 'wings', 'nuggets', 'sliders', 'sandwich', 'wrap',
    'curry', 'parma', 'parmigiana', 'risotto', 'soup', 'appetizer',
    'entree', 'main', 'mains', 'dessert', 'pie', 'pie', 'cake',
    '$15', '$16', '$17', '$18', '$19', '$20', '$21', '$22', '$23', '$24', '$25',
    'special', 'specials'
  ];

  // Keywords that indicate drinks (valid for happy hour)
  const drinkKeywords = [
    'beer', 'wine', 'cocktail', 'spirit', 'drink', 'beers', 'wines',
    'schooner', 'pint', 'glass', 'shot', 'mixed', 'house wine',
    'tap', 'taps', 'draft', 'bottle', 'jug', 'pot', 'schnapps',
    'happy hour', 'drinks', 'alcohol', 'bar', 'pub', 'wine bar',
    '$5', '$6', '$7', '$8', '$9', '$10', '$12', 'free beer',
    'discount', 'off', '% off', 'reduced', 'cheap'
  ];

  // Get all restaurants with happy hour
  const allRestaurants = await db.select({
    id: restaurants.id,
    name: restaurants.name,
    happyHour: restaurants.happyHour,
    deals: restaurants.deals,
    weeklySpecials: restaurants.weeklySpecials,
  }).from(restaurants)
    .where(isNotNull(restaurants.happyHour));

  console.log(`📊 Total restaurants with Happy Hour: ${allRestaurants.length}\n`);

  const restaurantsToFix: Array<{
    id: number;
    name: string;
    happyHour: any;
    reason: string;
  }> = [];

  for (const restaurant of allRestaurants) {
    const happyHour = restaurant.happyHour as any;
    if (!happyHour) continue;

    const description = (happyHour.description || '').toLowerCase();
    const days = Array.isArray(happyHour.days) ? happyHour.days.join(' ').toLowerCase() : '';
    const hours = (happyHour.hours || '').toLowerCase();
    const fullText = `${description} ${days} ${hours}`;

    // Check if it contains food keywords
    const hasFoodKeywords = foodKeywords.some(keyword => fullText.includes(keyword.toLowerCase()));
    
    // Check if it contains drink keywords
    const hasDrinkKeywords = drinkKeywords.some(keyword => fullText.includes(keyword.toLowerCase()));

    // If it has food keywords but no drink keywords, it's likely a food deal
    if (hasFoodKeywords && !hasDrinkKeywords) {
      restaurantsToFix.push({
        id: restaurant.id,
        name: restaurant.name,
        happyHour: happyHour,
        reason: description.substring(0, 100),
      });
    }
  }

  console.log(`⚠️  Found ${restaurantsToFix.length} restaurants with food deals in Happy Hour:\n`);

  if (restaurantsToFix.length > 0) {
    restaurantsToFix.forEach(r => {
      console.log(`   - ${r.name} (ID: ${r.id})`);
      console.log(`     Current Happy Hour: "${r.reason}"`);
    });
    console.log('');

    // Fix them
    console.log('🔧 Moving food deals from Happy Hour to Current Deals...\n');

    for (const restaurant of restaurantsToFix) {
      // Get current restaurant data
      const current = await db.select().from(restaurants)
        .where(eq(restaurants.id, restaurant.id))
        .limit(1);

      if (current.length === 0) continue;

      const currentRestaurant = current[0];
      const happyHour = restaurant.happyHour as any;
      const currentDeals = Array.isArray(currentRestaurant.deals) ? currentRestaurant.deals : [];
      const currentWeeklySpecials = Array.isArray(currentRestaurant.weeklySpecials) ? currentRestaurant.weeklySpecials : [];

      // Create a deal from the happy hour data
      const newDeal = {
        title: happyHour.description?.substring(0, 100) || 'Special Deal',
        description: happyHour.description || '',
        source: 'Manual Update',
        validUntil: null,
        price: happyHour.description?.match(/\$[\d.]+/) ? happyHour.description.match(/\$[\d.]+/)?.[0] : null,
        days: Array.isArray(happyHour.days) ? happyHour.days : [],
        hours: happyHour.hours || '',
      };

      // Check if this deal already exists
      const dealExists = currentDeals.some((d: any) => 
        d.description === newDeal.description || d.title === newDeal.title
      );

      if (!dealExists) {
        currentDeals.push(newDeal);
      }

      // Clear happy hour (set to null)
      console.log(`   Fixing: ${restaurant.name} (ID: ${restaurant.id})`);
      console.log(`     Moving Happy Hour to Current Deals`);
      console.log(`     Clearing Happy Hour field\n`);

      await db.update(restaurants)
        .set({
          happyHour: null,
          deals: currentDeals.length > 0 ? currentDeals : currentRestaurant.deals,
          updatedAt: new Date(),
        })
        .where(eq(restaurants.id, restaurant.id));
    }

    console.log(`✨ Fixed ${restaurantsToFix.length} restaurants!`);
  } else {
    console.log('✅ All Happy Hour entries appear to be about drinks!');
  }
}

fixHappyHourFoodDeals()
  .then(() => {
    console.log('\n✅ Fix completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fix failed:', error);
    process.exit(1);
  });
