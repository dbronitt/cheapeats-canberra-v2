// Load environment variables FIRST using dotenv (must use require for synchronous loading)
require('dotenv').config({ path: '.env.local' });

// Now import after env vars are loaded
import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq, or, like, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { createSlug } from '../src/lib/utils';

interface CsvDeal {
  restaurantName: string;
  dealTitle: string;
  description: string;
  days: string;
  hours: string;
  suburb: string;
  address: string;
  price?: string;
  updated?: string;
  website?: string;
}

interface ImportStats {
  total: number;
  processed: number;
  matched: number;
  created: number;
  updated: number;
  errors: number;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function parseDays(daysStr: string): string[] {
  if (!daysStr) return [];
  
  const days: string[] = [];
  const lowerDays = daysStr.toLowerCase();
  
  // Map day names to abbreviations
  const dayMap: Record<string, string> = {
    'monday': 'monday',
    'tuesday': 'tuesday',
    'wednesday': 'wednesday',
    'thursday': 'thursday',
    'friday': 'friday',
    'saturday': 'saturday',
    'sunday': 'sunday',
    'mon': 'monday',
    'tue': 'tuesday',
    'wed': 'wednesday',
    'thu': 'thursday',
    'fri': 'friday',
    'sat': 'saturday',
    'sun': 'sunday'
  };
  
  // Handle ranges like "Monday to Friday"
  if (lowerDays.includes(' to ')) {
    const parts = lowerDays.split(' to ');
    const startDay = parts[0].trim();
    const endDay = parts[1].split(',')[0].trim();
    
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const startIndex = dayOrder.indexOf(dayMap[startDay] || startDay);
    const endIndex = dayOrder.indexOf(dayMap[endDay] || endDay);
    
    if (startIndex !== -1 && endIndex !== -1) {
      for (let i = startIndex; i <= endIndex; i++) {
        days.push(dayOrder[i]);
      }
    }
    
    // Handle additional days after comma (e.g., "Monday to Thursday, Sunday")
    if (parts[1].includes(',')) {
      const additionalDays = parts[1].split(',').slice(1);
      additionalDays.forEach(day => {
        const normalized = dayMap[day.trim()] || day.trim();
        if (!days.includes(normalized)) {
          days.push(normalized);
        }
      });
    }
  } else if (lowerDays.includes(' and ')) {
    // Handle "Friday and Saturday"
    const parts = lowerDays.split(' and ');
    parts.forEach(day => {
      const normalized = dayMap[day.trim()] || day.trim();
      if (normalized) days.push(normalized);
    });
  } else if (lowerDays.includes(',')) {
    // Handle comma-separated days
    lowerDays.split(',').forEach(day => {
      const normalized = dayMap[day.trim()] || day.trim();
      if (normalized) days.push(normalized);
    });
  } else {
    // Single day
    const normalized = dayMap[lowerDays.trim()] || lowerDays.trim();
    if (normalized) days.push(normalized);
  }
  
  return days.filter(d => d);
}

async function findRestaurant(deal: CsvDeal): Promise<typeof restaurants.$inferSelect | null> {
  // Try multiple matching strategies
  const nameVariations = [
    deal.restaurantName.trim(),
    deal.restaurantName.trim().replace(/^The /i, ''), // Remove "The" prefix
    deal.restaurantName.trim().replace(/ & /g, ' and '), // Replace & with and
    deal.restaurantName.trim().replace(/ and /g, ' & '), // Replace and with &
  ];
  
  // Try to find by name (case-insensitive)
  for (const name of nameVariations) {
    const results = await db
      .select()
      .from(restaurants)
      .where(
        or(
          sql`LOWER(${restaurants.name}) = LOWER(${name})`,
          sql`LOWER(${restaurants.name}) LIKE LOWER(${'%' + name + '%'})`
        )!
      )
      .limit(5);
    
    if (results.length === 1) {
      return results[0];
    }
    
    // If multiple matches, try to match by suburb or address
    if (results.length > 1 && deal.suburb) {
      const suburbMatch = results.find(r => 
        r.suburb && r.suburb.toLowerCase() === deal.suburb.toLowerCase()
      );
      if (suburbMatch) return suburbMatch;
      
      // Try address matching
      if (deal.address) {
        const addressMatch = results.find(r => 
          r.address && r.address.toLowerCase().includes(deal.address.toLowerCase().split(' ')[0])
        );
        if (addressMatch) return addressMatch;
      }
    }
  }
  
  return null;
}

function isDrinkDeal(dealTitle: string, description: string): boolean {
  const text = `${dealTitle} ${description}`.toLowerCase();
  
  // Keywords that indicate drinks (valid for happy hour)
  const drinkKeywords = [
    'beer', 'wine', 'cocktail', 'spirit', 'drink', 'beers', 'wines',
    'schooner', 'pint', 'glass', 'shot', 'mixed', 'house wine',
    'tap', 'taps', 'draft', 'bottle', 'jug', 'pot', 'schnapps',
    'happy hour', 'drinks', 'alcohol', 'bar', 'pub', 'wine bar',
    'discount', 'off', '% off', 'reduced', 'cheap'
  ];
  
  // Keywords that indicate food (NOT valid for happy hour)
  const foodKeywords = [
    'kids meal', 'kid meal', 'children meal', 'free kids', 'kids eat free',
    'schnitzel', 'schnitty', 'burger', 'pizza', 'pasta', 'taco', 'tacos',
    'steak', 'roast', 'lunch', 'dinner', 'meal', 'food', 'breakfast',
    'chicken', 'fish', 'beef', 'pork', 'lamb', 'veggie', 'vegetarian',
    'salad', 'wings', 'nuggets', 'sliders', 'sandwich', 'wrap',
    'curry', 'parma', 'parmigiana', 'risotto', 'soup', 'appetizer',
    'entree', 'main', 'mains', 'dessert', 'pie', 'cake'
  ];
  
  const hasFoodKeywords = foodKeywords.some(keyword => text.includes(keyword));
  const hasDrinkKeywords = drinkKeywords.some(keyword => text.includes(keyword));
  
  // Only consider it a drink deal if it has drink keywords and no food keywords
  return hasDrinkKeywords && !hasFoodKeywords;
}

async function updateRestaurantWithDeal(restaurant: typeof restaurants.$inferSelect, deal: CsvDeal): Promise<void> {
  const days = parseDays(deal.days);
  const hours = deal.hours || '';
  
  // Only create happy hour if this is actually a drink deal
  const isDrink = isDrinkDeal(deal.dealTitle || '', deal.description || '');
  
  // Create happy hour object only if it's a drink deal
  const happyHour = isDrink ? {
    days: days,
    hours: hours,
    description: `${deal.dealTitle}: ${deal.description}${deal.price ? ` (${deal.price})` : ''}`
  } : null;
  
  // Get current deals
  const currentDeals = (restaurant.deals as Array<{ title?: string; description?: string; source?: string }> | null) || [];
  
  // Check if this deal already exists
  const dealExists = currentDeals.some(d => 
    d.title === deal.dealTitle && d.description?.includes(deal.description.substring(0, 50))
  );
  
  if (dealExists) {
    console.log(`   ⏭️  Deal already exists for ${restaurant.name}`);
    return;
  }
  
  // Add deal to deals array
  const newDeal = {
    title: deal.dealTitle,
    description: deal.description,
    source: 'EatDrinkCheap',
    validUntil: null
  };
  
  const updatedDeals = [...currentDeals, newDeal];
  
  // Update or merge happy hour (only if it's a drink deal)
  let updatedHappyHour = happyHour;
  if (happyHour && restaurant.happyHour) {
    const currentHH = restaurant.happyHour as { days?: string[]; hours?: string; description?: string };
    // Merge days and deduplicate (case-insensitive)
    const dayMap: Record<string, string> = {
      'monday': 'monday',
      'tuesday': 'tuesday',
      'wednesday': 'wednesday',
      'thursday': 'thursday',
      'friday': 'friday',
      'saturday': 'saturday',
      'sunday': 'sunday'
    };
    const allDays = [...(currentHH.days || []), ...days];
    const normalizedDays = allDays.map(d => dayMap[d.toLowerCase()] || d.toLowerCase());
    const mergedDays = [...new Set(normalizedDays)];
    
    // Combine descriptions
    const mergedDescription = currentHH.description 
      ? `${currentHH.description}\n${happyHour.description}`
      : happyHour.description;
    
    updatedHappyHour = {
      days: mergedDays,
      hours: currentHH.hours || hours,
      description: mergedDescription
    };
  } else if (!happyHour) {
    // Keep existing happy hour if new deal is not a drink deal
    updatedHappyHour = restaurant.happyHour as any;
  }
  
  // Update restaurant
  await db.update(restaurants)
    .set({
      happyHour: updatedHappyHour,
      deals: updatedDeals,
      status: 'active', // Ensure restaurant is active
      updatedAt: new Date()
    })
    .where(eq(restaurants.id, restaurant.id));
  
  console.log(`   ✅ Updated ${restaurant.name} with deal: ${deal.dealTitle}`);
}

async function createRestaurantFromDeal(deal: CsvDeal): Promise<void> {
  const slug = createSlug(deal.restaurantName);
  
  // Check if slug already exists
  const existing = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.slug, slug))
    .limit(1);
  
  if (existing.length > 0) {
    console.log(`   ⚠️  Restaurant with slug ${slug} already exists, updating instead`);
    await updateRestaurantWithDeal(existing[0], deal);
    return;
  }
  
  const days = parseDays(deal.days);
  const hours = deal.hours || '';
  
  // Only create happy hour if this is actually a drink deal
  const isDrink = isDrinkDeal(deal.dealTitle || '', deal.description || '');
  const happyHour = isDrink ? {
    days: days,
    hours: hours,
    description: `${deal.dealTitle}: ${deal.description}${deal.price ? ` (${deal.price})` : ''}`
  } : null;
  
  const deals = [{
    title: deal.dealTitle,
    description: deal.description,
    source: 'EatDrinkCheap',
    validUntil: null
  }];
  
  await db.insert(restaurants).values({
    name: deal.restaurantName,
    slug: slug,
    address: deal.address || null,
    suburb: deal.suburb || null,
    happyHour: happyHour,
    deals: deals,
    status: 'active',
    websiteUrl: deal.website || null
  });
  
  console.log(`   ➕ Created new restaurant: ${deal.restaurantName}`);
}

async function importDeals(): Promise<void> {
  const csvPath = path.join(process.cwd(), 'EATDRINKCHEAP deals.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV file not found: ${csvPath}`);
    process.exit(1);
  }
  
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    console.error('❌ CSV file is empty or has no data rows');
    process.exit(1);
  }
  
  // Parse header
  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine);
  
  console.log('📋 Headers:', headers);
  console.log('');
  
  const stats: ImportStats = {
    total: 0,
    processed: 0,
    matched: 0,
    created: 0,
    updated: 0,
    errors: 0
  };
  
  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const values = parseCsvLine(line);
    
    if (values.length < headers.length) {
      console.log(`⚠️  Skipping line ${i + 1}: insufficient columns`);
      continue;
    }
    
    const deal: CsvDeal = {
      restaurantName: values[0] || '',
      dealTitle: values[1] || '',
      description: values[2] || '',
      days: values[3] || '',
      hours: values[4] || '',
      suburb: values[5] || '',
      address: values[6] || '',
      price: values[7] || undefined,
      updated: values[8] || undefined,
      website: values[9] || undefined
    };
    
    if (!deal.restaurantName) {
      console.log(`⚠️  Skipping line ${i + 1}: missing restaurant name`);
      continue;
    }
    
    stats.total++;
    
    try {
      console.log(`\n[${stats.total}] Processing: ${deal.restaurantName} - ${deal.dealTitle}`);
      
      const restaurant = await findRestaurant(deal);
      
      if (restaurant) {
        stats.matched++;
        await updateRestaurantWithDeal(restaurant, deal);
        stats.updated++;
      } else {
        console.log(`   ➕ Restaurant not found, creating new entry`);
        await createRestaurantFromDeal(deal);
        stats.created++;
      }
      
      stats.processed++;
    } catch (error) {
      console.error(`   ❌ Error processing ${deal.restaurantName}:`, error);
      stats.errors++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Import Summary');
  console.log('='.repeat(60));
  console.log(`Total deals: ${stats.total}`);
  console.log(`Processed: ${stats.processed}`);
  console.log(`Matched existing: ${stats.matched}`);
  console.log(`Created new: ${stats.created}`);
  console.log(`Updated: ${stats.updated}`);
  console.log(`Errors: ${stats.errors}`);
  console.log('='.repeat(60));
}

// Main execution
importDeals()
  .then(() => {
    console.log('\n✅ Import completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  });
