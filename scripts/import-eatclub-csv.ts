// Load environment variables FIRST using dotenv (must use require for synchronous loading)
require('dotenv').config({ path: '.env.local' });

// Now import after env vars are loaded
import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq, sql, or, like } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import { createSlug } from '../src/lib/utils';

interface CsvRestaurant {
  id?: string;
  name: string;
  suburb?: string;
  address?: string;
  cuisine?: string;
  phone?: string;
  website?: string;
  eatClubUrl?: string;
  eatClubSlug?: string;
  happyHour?: string;
  weeklySpecials?: string;
  deals?: string;
  firstTableUrl?: string;
  priceRange?: string;
  imageUrls?: string;
  openingHours?: string;
  latitude?: string;
  longitude?: string;
}

interface ImportStats {
  total: number;
  processed: number;
  added: number;
  skipped: number;
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

function parseImageUrls(imageUrlsStr: string): string[] {
  if (!imageUrlsStr || imageUrlsStr.trim() === '') return [];
  
  // Split by semicolon and filter out EatClub logo
  return imageUrlsStr
    .split(';')
    .map(url => url.trim())
    .filter(url => url && !url.includes('eatclub.305f8e86.svg') && url.length > 0);
}

function parseJsonField(field: string): any {
  if (!field || field.trim() === '' || field === '[object Object]' || field === '{}') {
    return null;
  }
  
  try {
    // Handle multiple [object Object] entries
    if (field.includes('[object Object]')) {
      return null; // Can't parse these
    }
    
    return JSON.parse(field);
  } catch {
    return null;
  }
}

function parseOpeningHours(hoursStr: string): Record<string, string> | null {
  const parsed = parseJsonField(hoursStr);
  if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
    return parsed;
  }
  return null;
}

function parseDeals(dealsStr: string): Array<any> | null {
  if (!dealsStr || dealsStr.trim() === '' || dealsStr === '[object Object]') {
    return null;
  }
  
  // Handle multiple [object Object] entries separated by semicolon
  if (dealsStr.includes('[object Object]')) {
    // Return a generic EatClub deal
    return [{
      title: 'EatClub Deal Available',
      description: 'Check out our EatClub deals!',
      source: 'EatClub'
    }];
  }
  
  try {
    const parsed = JSON.parse(dealsStr);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function parseWeeklySpecials(specialsStr: string): Array<any> | null {
  return parseDeals(specialsStr); // Same format
}

function parseHappyHour(happyHourStr: string): any {
  return parseJsonField(happyHourStr);
}

function normalizeForMatching(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric
    .replace(/\s+/g, ''); // Remove all spaces
}

function calculateSimilarity(str1: string, str2: string): number {
  const norm1 = normalizeForMatching(str1);
  const norm2 = normalizeForMatching(str2);
  
  if (norm1 === norm2) return 1.0;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.8;
  
  // Simple Levenshtein-like similarity
  const longer = norm1.length > norm2.length ? norm1 : norm2;
  const shorter = norm1.length > norm2.length ? norm2 : norm1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(norm1, norm2);
  return 1 - (distance / longer.length);
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}

async function findExistingRestaurant(csvRestaurant: CsvRestaurant): Promise<number | null> {
  try {
    // Try to find by EatClub URL first (most reliable)
    if (csvRestaurant.eatClubUrl) {
      const byUrl = await db
        .select({ id: restaurants.id })
        .from(restaurants)
        .where(eq(restaurants.eatClubUrl, csvRestaurant.eatClubUrl))
        .limit(1);
      
      if (byUrl.length > 0) {
        return byUrl[0].id;
      }
    }
    
    // Try to find by name with improved matching
    const normalizedName = normalizeForMatching(csvRestaurant.name);
    const allRestaurants = await db
      .select({ id: restaurants.id, name: restaurants.name, suburb: restaurants.suburb, eatClubUrl: restaurants.eatClubUrl })
      .from(restaurants)
      .limit(2000); // Get more restaurants for better matching
    
    let bestMatch: { id: number; similarity: number } | null = null;
    
    for (const restaurant of allRestaurants) {
      const normalizedRestName = normalizeForMatching(restaurant.name);
      
      // Exact match
      if (normalizedName === normalizedRestName) {
        return restaurant.id;
      }
      
      // Calculate similarity
      const similarity = calculateSimilarity(csvRestaurant.name, restaurant.name);
      
      // If similarity is high enough (>= 0.7), consider it a match
      if (similarity >= 0.7) {
        // Check suburb if available (but don't require it)
        const suburbMatch = !csvRestaurant.suburb || 
                           !restaurant.suburb || 
                           csvRestaurant.suburb.toLowerCase().trim() === restaurant.suburb.toLowerCase().trim();
        
        if (suburbMatch) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { id: restaurant.id, similarity };
          }
        }
      }
    }
    
    if (bestMatch) {
      console.log(`   🔍 Matched by similarity (${Math.round(bestMatch.similarity * 100)}%): ${csvRestaurant.name}`);
      return bestMatch.id;
    }
    
    return null;
  } catch (error) {
    console.error(`Error finding restaurant ${csvRestaurant.name}:`, error);
    return null;
  }
}

async function addRestaurant(csvRestaurant: CsvRestaurant): Promise<boolean> {
  try {
    const slug = createSlug(csvRestaurant.name);
    
    // Check if slug already exists
    const existing = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.slug, slug))
      .limit(1);
    
    if (existing.length > 0) {
      console.log(`   ⚠️  Slug already exists: ${slug}`);
      return false;
    }
    
    const imageUrls = parseImageUrls(csvRestaurant.imageUrls || '');
    const openingHours = parseOpeningHours(csvRestaurant.openingHours || '');
    const deals = parseDeals(csvRestaurant.deals || '');
    const weeklySpecials = parseWeeklySpecials(csvRestaurant.weeklySpecials || '');
    const happyHour = parseHappyHour(csvRestaurant.happyHour || '');
    
    // Combine deals if we have weekly specials or happy hour
    let allDeals = deals || [];
    if (happyHour) {
      allDeals.push({
        title: 'Happy Hour',
        description: happyHour.description || happyHour.hours || 'Happy Hour available',
        source: 'EatClub'
      });
    }
    if (weeklySpecials && Array.isArray(weeklySpecials)) {
      weeklySpecials.forEach((special: any) => {
        allDeals.push({
          title: special.title || `Weekly Special - ${special.day || ''}`,
          description: special.description || '',
          source: 'EatClub'
        });
      });
    }
    
    await db.insert(restaurants).values({
      name: csvRestaurant.name,
      slug: slug,
      address: csvRestaurant.address || null,
      suburb: csvRestaurant.suburb || null,
      phone: csvRestaurant.phone || null,
      websiteUrl: csvRestaurant.website || null,
      cuisine: csvRestaurant.cuisine || null,
      priceRange: (() => {
        // Validate priceRange: must be one of $, $$, $$$, or $$$$
        const validPriceRanges = ['$', '$$', '$$$', '$$$$'];
        const priceRange = csvRestaurant.priceRange;
        if (priceRange && validPriceRanges.includes(priceRange)) {
          return priceRange;
        }
        return null;
      })(),
      eatClubUrl: csvRestaurant.eatClubUrl || null,
      firstTableUrl: csvRestaurant.firstTableUrl || null,
      imageUrls: imageUrls.length > 0 ? imageUrls : null,
      openingHours: openingHours,
      deals: allDeals.length > 0 ? allDeals : null,
      weeklySpecials: weeklySpecials,
      happyHour: happyHour,
      latitude: csvRestaurant.latitude ? String(csvRestaurant.latitude) : null,
      longitude: csvRestaurant.longitude ? String(csvRestaurant.longitude) : null,
      status: 'active',
    });
    
    return true;
  } catch (error) {
    console.error(`Error adding restaurant ${csvRestaurant.name}:`, error);
    return false;
  }
}

async function updateRestaurant(restaurantId: number, csvRestaurant: CsvRestaurant): Promise<boolean> {
  try {
    const imageUrls = parseImageUrls(csvRestaurant.imageUrls || '');
    const openingHours = parseOpeningHours(csvRestaurant.openingHours || '');
    const deals = parseDeals(csvRestaurant.deals || '');
    const weeklySpecials = parseWeeklySpecials(csvRestaurant.weeklySpecials || '');
    const happyHour = parseHappyHour(csvRestaurant.happyHour || '');
    
    // Get current restaurant
    const current = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1);
    
    if (current.length === 0) return false;
    
    const currentRestaurant = current[0];
    const currentImageUrls = (currentRestaurant.imageUrls as string[] | null) || [];
    
    // Merge images
    const allImages = [...currentImageUrls];
    for (const img of imageUrls) {
      if (!allImages.includes(img)) {
        allImages.push(img);
      }
    }
    
    // Update restaurant
    await db.update(restaurants)
      .set({
        eatClubUrl: csvRestaurant.eatClubUrl || currentRestaurant.eatClubUrl,
        firstTableUrl: csvRestaurant.firstTableUrl || currentRestaurant.firstTableUrl,
        imageUrls: allImages.length > 0 ? allImages : currentRestaurant.imageUrls,
        openingHours: openingHours || currentRestaurant.openingHours,
        deals: deals || currentRestaurant.deals,
        weeklySpecials: weeklySpecials || currentRestaurant.weeklySpecials,
        happyHour: happyHour || currentRestaurant.happyHour,
        address: csvRestaurant.address || currentRestaurant.address,
        suburb: csvRestaurant.suburb || currentRestaurant.suburb,
        phone: csvRestaurant.phone || currentRestaurant.phone,
        websiteUrl: csvRestaurant.website || currentRestaurant.websiteUrl,
        cuisine: csvRestaurant.cuisine || currentRestaurant.cuisine,
        priceRange: (() => {
          // Validate priceRange: must be one of $, $$, $$$, or $$$$
          const validPriceRanges = ['$', '$$', '$$$', '$$$$'];
          const priceRange = csvRestaurant.priceRange || currentRestaurant.priceRange;
          if (priceRange && validPriceRanges.includes(priceRange)) {
            return priceRange;
          }
          return currentRestaurant.priceRange; // Keep existing if invalid
        })(),
        latitude: csvRestaurant.latitude ? String(csvRestaurant.latitude) : currentRestaurant.latitude,
        longitude: csvRestaurant.longitude ? String(csvRestaurant.longitude) : currentRestaurant.longitude,
        updatedAt: new Date(),
      })
      .where(eq(restaurants.id, restaurantId));
    
    return true;
  } catch (error) {
    console.error(`Error updating restaurant ${restaurantId}:`, error);
    return false;
  }
}

async function main() {
  console.log('📥 Importing EatClub restaurants from CSV...\n');
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set!');
    process.exit(1);
  }
  
  const csvFile = path.join(process.cwd(), 'eatclub-restaurants-2026-01-08.csv');
  
  if (!fs.existsSync(csvFile)) {
    console.error(`❌ CSV file not found: ${csvFile}`);
    process.exit(1);
  }
  
  const stats: ImportStats = {
    total: 0,
    processed: 0,
    added: 0,
    skipped: 0,
    updated: 0,
    errors: 0,
  };
  
  try {
    const csvContent = fs.readFileSync(csvFile, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      console.error('❌ CSV file appears to be empty or invalid');
      process.exit(1);
    }
    
    // Skip header
    const dataLines = lines.slice(1);
    stats.total = dataLines.length;
    
    console.log(`📋 Found ${stats.total} restaurants in CSV\n`);
    
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      stats.processed++;
      
      try {
        const fields = parseCsvLine(line);
        
        if (fields.length < 8) {
          console.log(`[${stats.processed}/${stats.total}] ⚠️  Skipping invalid line`);
          stats.skipped++;
          continue;
        }
        
        const csvRestaurant: CsvRestaurant = {
          id: fields[0] || undefined,
          name: fields[1] || '',
          suburb: fields[2] || undefined,
          address: fields[3] || undefined,
          cuisine: fields[4] || undefined,
          phone: fields[5] || undefined,
          website: fields[6] || undefined,
          eatClubUrl: fields[7] || undefined,
          eatClubSlug: fields[8] || undefined,
          happyHour: fields[9] || undefined,
          weeklySpecials: fields[10] || undefined,
          deals: fields[11] || undefined,
          firstTableUrl: fields[12] || undefined,
          priceRange: fields[13] || undefined,
          imageUrls: fields[14] || undefined,
          openingHours: fields[15] || undefined,
          latitude: fields[16] || undefined,
          longitude: fields[17] || undefined,
        };
        
        if (!csvRestaurant.name || csvRestaurant.name.trim() === '') {
          console.log(`[${stats.processed}/${stats.total}] ⚠️  Skipping restaurant without name`);
          stats.skipped++;
          continue;
        }
        
        console.log(`[${stats.processed}/${stats.total}] Processing: ${csvRestaurant.name}`);
        
        // Check if restaurant exists
        const existingId = await findExistingRestaurant(csvRestaurant);
        
        if (existingId) {
          console.log(`   ✅ Found existing restaurant (ID: ${existingId}), updating...`);
          const updated = await updateRestaurant(existingId, csvRestaurant);
          if (updated) {
            stats.updated++;
            console.log(`   ✅ Updated successfully`);
          } else {
            stats.errors++;
            console.log(`   ❌ Failed to update`);
          }
        } else {
          console.log(`   🆕 New restaurant, adding...`);
          console.log(`   📍 Details: ${csvRestaurant.suburb || 'No suburb'}, ${csvRestaurant.address || 'No address'}`);
          const added = await addRestaurant(csvRestaurant);
          if (added) {
            stats.added++;
            console.log(`   ✅ Added successfully`);
          } else {
            stats.skipped++;
            console.log(`   ⚠️  Skipped (duplicate slug or error)`);
          }
        }
        
        console.log('');
      } catch (error) {
        stats.errors++;
        console.error(`[${stats.processed}/${stats.total}] ❌ Error processing line:`, error);
        console.log('');
      }
    }
    
    // Print summary
    console.log('\n📊 Import Summary:');
    console.log(`   Total restaurants in CSV: ${stats.total}`);
    console.log(`   Processed: ${stats.processed}`);
    console.log(`   Added: ${stats.added}`);
    console.log(`   Updated: ${stats.updated}`);
    console.log(`   Skipped: ${stats.skipped}`);
    console.log(`   Errors: ${stats.errors}`);
    
    if (stats.added > 0 || stats.updated > 0) {
      console.log(`\n✅ Successfully imported ${stats.added + stats.updated} restaurant(s)!`);
    } else {
      console.log(`\n⚠️  No new restaurants were added. All restaurants from CSV already exist in the database.`);
      console.log(`   If restaurants are not showing on the main page, they may:`);
      console.log(`   - Not have deals (main page filters by hasDeals=true by default)`);
      console.log(`   - Be marked as inactive`);
      console.log(`   - Need their EatClub URL or deal information updated`);
    }
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
