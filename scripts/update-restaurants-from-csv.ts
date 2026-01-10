// Load environment variables FIRST using dotenv (must use require for synchronous loading)
require('dotenv').config({ path: '.env.local' });

// Now import after env vars are loaded
import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq, or, sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { createSlug } from '../src/lib/utils';

interface CsvRow {
  [key: string]: string;
}

interface UpdateStats {
  total: number;
  processed: number;
  matched: number;
  updated: number;
  created: number;
  errors: number;
  skipped: number;
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

function normalizeFieldName(fieldName: string): string {
  // Map common CSV column names to database field names
  const fieldMap: Record<string, string> = {
    'restaurant name': 'name',
    'name': 'name',
    'restaurant': 'name',
    'address': 'address',
    'suburb': 'suburb',
    'phone': 'phone',
    'website': 'websiteUrl',
    'website url': 'websiteUrl',
    'cuisine': 'cuisine',
    'price range': 'priceRange',
    'price': 'priceRange',
    'business type': 'businessType',
    'business': 'businessType',
    'latitude': 'latitude',
    'longitude': 'longitude',
    'status': 'status',
    'eatclub url': 'eatClubUrl',
    'eatclub': 'eatClubUrl',
    'first table url': 'firstTableUrl',
    'first table': 'firstTableUrl',
    'image urls': 'imageUrls',
    'images': 'imageUrls',
    'opening hours': 'openingHours',
    'hours': 'openingHours',
    'happy hour': 'happyHour',
    'weekly specials': 'weeklySpecials',
    'deals': 'deals',
    'deal title': 'dealTitle',
    'deal description': 'dealDescription',
    'days': 'days',
    'hours': 'hours',
  };
  
  const normalized = fieldName.toLowerCase().trim();
  return fieldMap[normalized] || normalized;
}

function parseJsonField(field: string): any {
  if (!field || field.trim() === '' || field === '[object Object]' || field === '{}') {
    return null;
  }
  
  try {
    if (field.includes('[object Object]')) {
      return null;
    }
    return JSON.parse(field);
  } catch {
    return null;
  }
}

function parseImageUrls(imageUrlsStr: string): string[] {
  if (!imageUrlsStr || imageUrlsStr.trim() === '') return [];
  
  // Split by semicolon or comma
  return imageUrlsStr
    .split(/[;,]/)
    .map(url => url.trim())
    .filter(url => url && url.length > 0);
}

function parseOpeningHours(hoursStr: string): Record<string, string> | null {
  const parsed = parseJsonField(hoursStr);
  if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
    return parsed;
  }
  return null;
}

function parseHappyHour(happyHourStr: string): any {
  return parseJsonField(happyHourStr);
}

function parseWeeklySpecials(specialsStr: string): Array<any> | null {
  return parseJsonField(specialsStr);
}

function parseDeals(dealsStr: string): Array<any> | null {
  return parseJsonField(dealsStr);
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

function parseDaysForDeal(daysStr: string): string[] {
  if (!daysStr) return [];
  
  const days: string[] = [];
  const lowerDays = daysStr.toLowerCase();
  
  const dayMap: Record<string, string> = {
    'monday': 'monday', 'tuesday': 'tuesday', 'wednesday': 'wednesday',
    'thursday': 'thursday', 'friday': 'friday', 'saturday': 'saturday', 'sunday': 'sunday',
    'mon': 'monday', 'tue': 'tuesday', 'wed': 'wednesday',
    'thu': 'thursday', 'fri': 'friday', 'sat': 'saturday', 'sun': 'sunday',
    'daily': 'monday,tuesday,wednesday,thursday,friday,saturday,sunday'
  };
  
  if (lowerDays === 'daily') {
    return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  }
  
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
    const parts = lowerDays.split(' and ');
    parts.forEach(day => {
      const normalized = dayMap[day.trim()] || day.trim();
      if (normalized) days.push(normalized);
    });
  } else if (lowerDays.includes(',')) {
    lowerDays.split(',').forEach(day => {
      const normalized = dayMap[day.trim()] || day.trim();
      if (normalized) days.push(normalized);
    });
  } else {
    const normalized = dayMap[lowerDays.trim()] || lowerDays.trim();
    if (normalized) days.push(normalized);
  }
  
  return days.filter(d => d);
}

async function findRestaurantByName(name: string, suburb?: string): Promise<typeof restaurants.$inferSelect | null> {
  // Try multiple matching strategies
  const nameVariations = [
    name.trim(),
    name.trim().replace(/^The /i, ''),
    name.trim().replace(/ & /g, ' and '),
    name.trim().replace(/ and /g, ' & '),
  ];
  
  for (const searchName of nameVariations) {
    const results = await db
      .select()
      .from(restaurants)
      .where(
        or(
          sql`LOWER(${restaurants.name}) = LOWER(${searchName})`,
          sql`LOWER(${restaurants.name}) LIKE LOWER(${'%' + searchName + '%'})`
        )!
      )
      .limit(5);
    
    if (results.length === 1) {
      return results[0];
    }
    
    // If multiple matches, try to match by suburb
    if (results.length > 1 && suburb) {
      const suburbMatch = results.find(r => 
        r.suburb && r.suburb.toLowerCase() === suburb.toLowerCase()
      );
      if (suburbMatch) return suburbMatch;
    }
  }
  
  return null;
}

async function updateRestaurantFromCsv(
  restaurant: typeof restaurants.$inferSelect,
  csvRow: CsvRow,
  headers: string[]
): Promise<void> {
  const updates: any = {};
  let hasUpdates = false;
  
  // Check if this is a deal-focused CSV (has Deal Title, Description, Days, Hours columns)
  const hasDealColumns = headers.some(h => 
    normalizeFieldName(h) === 'dealtitle' || 
    normalizeFieldName(h) === 'description' ||
    normalizeFieldName(h) === 'days' ||
    normalizeFieldName(h) === 'hours'
  );
  
  // If deal-focused CSV, process deals first
  if (hasDealColumns) {
    const dealTitle = csvRow['Deal Title'] || csvRow['deal title'] || csvRow['Deal Title'] || '';
    const dealDescription = csvRow['Description'] || csvRow['description'] || '';
    const dealDays = csvRow['Days'] || csvRow['days'] || '';
    const dealHours = csvRow['Hours'] || csvRow['hours'] || '';
    const dealPrice = csvRow['Price'] || csvRow['price'] || '';
    
    if (dealTitle || dealDescription) {
      const existingDeals = (restaurant.deals as Array<any> | null) || [];
      
      // Check if deal already exists
      const dealExists = existingDeals.some(d => 
        d.title === dealTitle && d.description?.includes(dealDescription.substring(0, 50))
      );
      
      if (!dealExists) {
        const newDeal: any = {
          title: dealTitle || 'Special Deal',
          description: dealDescription,
          source: 'Manual Update',
          validUntil: null
        };
        
        updates.deals = [...existingDeals, newDeal];
        hasUpdates = true;
        
        // Only update happy hour if this is actually a drink deal AND we have days/hours
        const isDrink = isDrinkDeal(dealTitle, dealDescription);
        if (isDrink && (dealDays || dealHours)) {
          const days = parseDaysForDeal(dealDays);
          const currentHH = restaurant.happyHour as { days?: string[]; hours?: string; description?: string } | null;
          
          const dayMap: Record<string, string> = {
            'monday': 'monday', 'tuesday': 'tuesday', 'wednesday': 'wednesday',
            'thursday': 'thursday', 'friday': 'friday', 'saturday': 'saturday', 'sunday': 'sunday'
          };
          
          if (currentHH) {
            const allDays = [...(currentHH.days || []), ...days];
            const normalizedDays = allDays.map(d => dayMap[d.toLowerCase()] || d.toLowerCase());
            const mergedDays = [...new Set(normalizedDays)];
            
            updates.happyHour = {
              ...currentHH,
              days: mergedDays,
              hours: dealHours || currentHH.hours || '',
              description: currentHH.description 
                ? `${currentHH.description}\n${dealTitle}: ${dealDescription}${dealPrice ? ` (${dealPrice})` : ''}`
                : `${dealTitle}: ${dealDescription}${dealPrice ? ` (${dealPrice})` : ''}`
            };
          } else if (days.length > 0 || dealHours) {
            updates.happyHour = {
              days: days,
              hours: dealHours || '',
              description: `${dealTitle}: ${dealDescription}${dealPrice ? ` (${dealPrice})` : ''}`
            };
          }
          hasUpdates = true;
        }
      }
    }
  }
  
  // Process each column for regular restaurant fields
  for (const header of headers) {
    const normalizedField = normalizeFieldName(header);
    const value = csvRow[header]?.trim();
    
    // Skip deal-specific columns (already processed above) and name (used for matching)
    if (normalizedField === 'dealtitle' || 
        normalizedField === 'deal title' ||
        normalizedField === 'description' ||
        normalizedField === 'days' ||
        normalizedField === 'hours' ||
        normalizedField === 'name') {
      continue;
    }
    
    if (!value || value === '') continue;
    
    // Handle different field types
    switch (normalizedField) {
      case 'name':
        // Skip name updates (used for matching only)
        break;
        
      case 'address':
        updates.address = value || null;
        hasUpdates = true;
        break;
        
      case 'suburb':
        updates.suburb = value || null;
        hasUpdates = true;
        break;
        
      case 'phone':
        updates.phone = value || null;
        hasUpdates = true;
        break;
        
      case 'websiteUrl':
      case 'website':
        updates.websiteUrl = value || null;
        hasUpdates = true;
        break;
        
      case 'cuisine':
        updates.cuisine = value || null;
        hasUpdates = true;
        break;
        
      case 'priceRange':
        // Only set priceRange if it's a valid format ($, $$, $$$, $$$$)
        if (['$', '$$', '$$$', '$$$$'].includes(value)) {
          updates.priceRange = value;
          hasUpdates = true;
        }
        break;
      case 'price':
        // Price column in deal CSV is not the same as priceRange - skip it
        // (Price is used in deal descriptions, not restaurant priceRange)
        break;
        
      case 'businessType':
      case 'business':
        updates.businessType = value || null;
        hasUpdates = true;
        break;
        
      case 'latitude':
        updates.latitude = value ? String(value) : null;
        hasUpdates = true;
        break;
        
      case 'longitude':
        updates.longitude = value ? String(value) : null;
        hasUpdates = true;
        break;
        
      case 'status':
        if (['active', 'inactive', 'closed'].includes(value.toLowerCase())) {
          updates.status = value.toLowerCase();
          hasUpdates = true;
        }
        break;
        
      case 'eatClubUrl':
      case 'eatclub':
        updates.eatClubUrl = value || null;
        hasUpdates = true;
        break;
        
      case 'firstTableUrl':
      case 'firsttable':
        updates.firstTableUrl = value || null;
        hasUpdates = true;
        break;
        
      case 'imageUrls':
      case 'images':
        const imageUrls = parseImageUrls(value);
        if (imageUrls.length > 0) {
          // Merge with existing images
          const existingImages = (restaurant.imageUrls as string[] | null) || [];
          const mergedImages = [...new Set([...existingImages, ...imageUrls])];
          updates.imageUrls = mergedImages.length > 0 ? mergedImages : null;
          hasUpdates = true;
        }
        break;
        
      case 'openingHours':
      case 'hours':
        const openingHours = parseOpeningHours(value);
        if (openingHours) {
          updates.openingHours = openingHours;
          hasUpdates = true;
        }
        break;
        
      case 'happyHour':
        const happyHour = parseHappyHour(value);
        if (happyHour) {
          updates.happyHour = happyHour;
          hasUpdates = true;
        }
        break;
        
      case 'weeklySpecials':
        const weeklySpecials = parseWeeklySpecials(value);
        if (weeklySpecials) {
          updates.weeklySpecials = weeklySpecials;
          hasUpdates = true;
        }
        break;
        
      case 'deals':
        const deals = parseDeals(value);
        if (deals) {
          // Merge with existing deals
          const existingDeals = (restaurant.deals as Array<any> | null) || [];
          const mergedDeals = [...existingDeals, ...deals];
          updates.deals = mergedDeals.length > 0 ? mergedDeals : null;
          hasUpdates = true;
        }
        break;
    }
  }
  
  if (hasUpdates) {
    updates.updatedAt = new Date();
    await db.update(restaurants)
      .set(updates)
      .where(eq(restaurants.id, restaurant.id));
    
    console.log(`   ✅ Updated ${restaurant.name}`);
  } else {
    console.log(`   ⏭️  No updates needed for ${restaurant.name}`);
  }
}

async function createRestaurantFromCsv(
  csvRow: CsvRow,
  headers: string[]
): Promise<void> {
  const name = csvRow[headers.find(h => normalizeFieldName(h) === 'name') || 'Restaurant Name'] || 
               csvRow['Restaurant Name'] || 
               csvRow['name'] || 
               '';
  
  if (!name) {
    throw new Error('Restaurant name is required to create a new restaurant');
  }
  
  const slug = createSlug(name);
  
  // Check if slug already exists
  const existing = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.slug, slug))
    .limit(1);
  
  if (existing.length > 0) {
    console.log(`   ⚠️  Restaurant with slug ${slug} already exists, updating instead`);
    await updateRestaurantFromCsv(existing[0], csvRow, headers);
    return;
  }
  
  const newRestaurant: any = {
    name: name,
    slug: slug,
    status: 'active',
  };
  
  // Process each column
  for (const header of headers) {
    const normalizedField = normalizeFieldName(header);
    const value = csvRow[header]?.trim();
    
    if (!value || value === '' || normalizedField === 'name') continue;
    
    switch (normalizedField) {
      case 'address':
        newRestaurant.address = value || null;
        break;
      case 'suburb':
        newRestaurant.suburb = value || null;
        break;
      case 'phone':
        newRestaurant.phone = value || null;
        break;
      case 'websiteUrl':
      case 'website':
        newRestaurant.websiteUrl = value || null;
        break;
      case 'cuisine':
        newRestaurant.cuisine = value || null;
        break;
      case 'priceRange':
      case 'price':
        newRestaurant.priceRange = value || null;
        break;
      case 'businessType':
        newRestaurant.businessType = value || null;
        break;
      case 'latitude':
        newRestaurant.latitude = value ? String(value) : null;
        break;
      case 'longitude':
        newRestaurant.longitude = value ? String(value) : null;
        break;
      case 'status':
        if (['active', 'inactive', 'closed'].includes(value.toLowerCase())) {
          newRestaurant.status = value.toLowerCase();
        }
        break;
      case 'eatClubUrl':
        newRestaurant.eatClubUrl = value || null;
        break;
      case 'firstTableUrl':
        newRestaurant.firstTableUrl = value || null;
        break;
      case 'imageUrls':
        const imageUrls = parseImageUrls(value);
        if (imageUrls.length > 0) {
          newRestaurant.imageUrls = imageUrls;
        }
        break;
      case 'openingHours':
        const openingHours = parseOpeningHours(value);
        if (openingHours) {
          newRestaurant.openingHours = openingHours;
        }
        break;
      case 'happyHour':
        const happyHour = parseHappyHour(value);
        if (happyHour) {
          newRestaurant.happyHour = happyHour;
        }
        break;
      case 'weeklySpecials':
        const weeklySpecials = parseWeeklySpecials(value);
        if (weeklySpecials) {
          newRestaurant.weeklySpecials = weeklySpecials;
        }
        break;
      case 'deals':
        const deals = parseDeals(value);
        if (deals) {
          newRestaurant.deals = deals;
        }
        break;
    }
  }
  
  await db.insert(restaurants).values(newRestaurant);
  console.log(`   ➕ Created new restaurant: ${name}`);
}

async function updateFromCsv(csvFilePath: string, createIfNotFound: boolean = false): Promise<void> {
  if (!fs.existsSync(csvFilePath)) {
    console.error(`❌ CSV file not found: ${csvFilePath}`);
    process.exit(1);
  }
  
  const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    console.error('❌ CSV file is empty or has no data rows');
    process.exit(1);
  }
  
  // Parse header
  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine);
  
  console.log('📋 CSV Headers:', headers);
  console.log('');
  
  const stats: UpdateStats = {
    total: 0,
    processed: 0,
    matched: 0,
    updated: 0,
    created: 0,
    errors: 0,
    skipped: 0
  };
  
  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const values = parseCsvLine(line);
    
    if (values.length < headers.length) {
      console.log(`⚠️  Skipping line ${i + 1}: insufficient columns`);
      stats.skipped++;
      continue;
    }
    
    // Create row object
    const csvRow: CsvRow = {};
    headers.forEach((header, index) => {
      csvRow[header] = values[index] || '';
    });
    
    // Get restaurant name (try multiple possible column names)
    const restaurantName = csvRow['Restaurant Name'] || 
                          csvRow['restaurant name'] || 
                          csvRow['name'] || 
                          csvRow['Name'] ||
                          '';
    
    if (!restaurantName) {
      console.log(`⚠️  Skipping line ${i + 1}: missing restaurant name`);
      stats.skipped++;
      continue;
    }
    
    stats.total++;
    
    try {
      console.log(`\n[${stats.total}] Processing: ${restaurantName}`);
      
      const suburb = csvRow['Suburb'] || csvRow['suburb'] || undefined;
      const restaurant = await findRestaurantByName(restaurantName, suburb);
      
      if (restaurant) {
        stats.matched++;
        await updateRestaurantFromCsv(restaurant, csvRow, headers);
        stats.updated++;
      } else {
        if (createIfNotFound) {
          console.log(`   ➕ Restaurant not found, creating new entry`);
          await createRestaurantFromCsv(csvRow, headers);
          stats.created++;
        } else {
          console.log(`   ⏭️  Restaurant not found (use --create flag to create new restaurants)`);
          stats.skipped++;
        }
      }
      
      stats.processed++;
    } catch (error) {
      console.error(`   ❌ Error processing ${restaurantName}:`, error);
      stats.errors++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 Update Summary');
  console.log('='.repeat(60));
  console.log(`Total rows: ${stats.total}`);
  console.log(`Processed: ${stats.processed}`);
  console.log(`Matched: ${stats.matched}`);
  console.log(`Updated: ${stats.updated}`);
  console.log(`Created: ${stats.created}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);
  console.log('='.repeat(60));
}

// Main execution
// Parse command line arguments
// npm passes arguments after the script name
const allArgs = process.argv.slice(2);
const csvFilePath = allArgs.find(arg => !arg.startsWith('-') && (arg.endsWith('.csv') || !arg.includes('.'))) || path.join(process.cwd(), 'new deals.csv');
// Check for --create flag in any form
const createIfNotFound = allArgs.some(arg => 
  arg === '--create' || 
  arg === '-c' || 
  arg.toLowerCase().includes('create') ||
  process.env.npm_config_create === 'true'
);

console.log(`📁 CSV File: ${csvFilePath}`);
console.log(`🆕 Create if not found: ${createIfNotFound ? 'Yes' : 'No'}`);
console.log('');

updateFromCsv(csvFilePath, createIfNotFound)
  .then(() => {
    console.log('\n✅ Update completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Update failed:', error);
    process.exit(1);
  });
