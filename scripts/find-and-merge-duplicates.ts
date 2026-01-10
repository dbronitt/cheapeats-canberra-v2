// Note: This file should be loaded after dotenv.config() is called
// Environment variables should already be loaded by the time this runs
import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq } from 'drizzle-orm';

/**
 * Normalize restaurant name by removing location suffixes and common variations
 * Examples:
 *   "Caffe Cherry Beans - Erindale" -> "Caffe Cherry Beans"
 *   "Restaurant Name (Location)" -> "Restaurant Name"
 */
function normalizeRestaurantName(name: string): string {
  return name
    .trim()
    // Remove location suffixes like "- Erindale", "- Location", etc.
    .replace(/\s*-\s*[A-Z][a-z]+(\s+[A-Z][a-z]+)*\s*$/, '')
    // Remove parenthetical location info like "(Erindale)", "(Location)"
    .replace(/\s*\([^)]+\)\s*$/, '')
    // Remove trailing location indicators
    .replace(/\s+(ACT|NSW|VIC|QLD|SA|WA|TAS|NT)\s*\d+.*$/, '')
    .trim()
    .toLowerCase();
}

/**
 * Check if two restaurants are likely duplicates
 */
function areRestaurantsDuplicates(rest1: typeof restaurants.$inferSelect, rest2: typeof restaurants.$inferSelect): boolean {
  const name1 = normalizeRestaurantName(rest1.name);
  const name2 = normalizeRestaurantName(rest2.name);
  
  // Exact normalized name match
  if (name1 === name2) {
    return true;
  }
  
  // One name contains the other (for cases like "Caffe Cherry Beans" vs "Caffe Cherry Beans - Erindale")
  if (name1.includes(name2) || name2.includes(name1)) {
    // If suburbs match, it's likely a duplicate
    if (rest1.suburb && rest2.suburb) {
      return rest1.suburb.toLowerCase() === rest2.suburb.toLowerCase();
    }
    // If addresses are similar, it's likely a duplicate
    if (rest1.address && rest2.address) {
      const addr1 = rest1.address.toLowerCase();
      const addr2 = rest2.address.toLowerCase();
      // Check if addresses share significant parts
      const addr1Words = addr1.split(/\s+/).filter(w => w.length > 3);
      const addr2Words = addr2.split(/\s+/).filter(w => w.length > 3);
      const commonWords = addr1Words.filter(w => addr2Words.includes(w));
      if (commonWords.length >= 2) {
        return true;
      }
    }
    return true; // Names are similar enough
  }
  
  return false;
}

/**
 * Merge two restaurants - combines all data from duplicate into primary
 */
async function mergeTwoRestaurants(
  primary: typeof restaurants.$inferSelect,
  duplicate: typeof restaurants.$inferSelect
): Promise<void> {
  console.log(`\n🔄 Merging "${duplicate.name}" (ID: ${duplicate.id}) into "${primary.name}" (ID: ${primary.id})`);
  
  const merged: any = {
    ...primary,
    updatedAt: new Date(),
  };

  // Merge address/suburb (use duplicate if primary is missing, or if duplicate has more complete info)
  if ((!merged.address && duplicate.address) || 
      (duplicate.address && duplicate.address.length > (merged.address?.length || 0))) {
    merged.address = duplicate.address;
  }
  if ((!merged.suburb && duplicate.suburb) || 
      (duplicate.suburb && !merged.suburb)) {
    merged.suburb = duplicate.suburb;
  }
  if (!merged.phone && duplicate.phone) {
    merged.phone = duplicate.phone;
  }
  if (!merged.websiteUrl && duplicate.websiteUrl) {
    merged.websiteUrl = duplicate.websiteUrl;
  }
  if (!merged.cuisine && duplicate.cuisine) {
    merged.cuisine = duplicate.cuisine;
  }
  if (!merged.priceRange && duplicate.priceRange) {
    merged.priceRange = duplicate.priceRange;
  }
  if (!merged.businessType && duplicate.businessType) {
    merged.businessType = duplicate.businessType;
  }
  if (!merged.eatClubUrl && duplicate.eatClubUrl) {
    merged.eatClubUrl = duplicate.eatClubUrl;
  }
  if (!merged.firstTableUrl && duplicate.firstTableUrl) {
    merged.firstTableUrl = duplicate.firstTableUrl;
  }
  if (!merged.latitude && duplicate.latitude) {
    merged.latitude = duplicate.latitude;
  }
  if (!merged.longitude && duplicate.longitude) {
    merged.longitude = duplicate.longitude;
  }
  if (!merged.overallRating && duplicate.overallRating) {
    merged.overallRating = duplicate.overallRating;
  }
  if (!merged.googlePlaceId && duplicate.googlePlaceId) {
    merged.googlePlaceId = duplicate.googlePlaceId;
  }
  if (!merged.foursquarePlaceId && duplicate.foursquarePlaceId) {
    merged.foursquarePlaceId = duplicate.foursquarePlaceId;
  }

  // Merge imageUrls (combine arrays, remove duplicates)
  const primaryImages = Array.isArray(primary.imageUrls) ? primary.imageUrls : [];
  const duplicateImages = Array.isArray(duplicate.imageUrls) ? duplicate.imageUrls : [];
  const allImages = [...new Set([...primaryImages, ...duplicateImages])];
  if (allImages.length > 0) {
    merged.imageUrls = allImages;
  }

  // Merge happyHour (combine days, use longer description)
  const primaryHappyHour = primary.happyHour as any;
  const duplicateHappyHour = duplicate.happyHour as any;
  
  if (primaryHappyHour || duplicateHappyHour) {
    const primaryDays = Array.isArray(primaryHappyHour?.days) ? primaryHappyHour.days : [];
    const duplicateDays = Array.isArray(duplicateHappyHour?.days) ? duplicateHappyHour.days : [];
    const combinedDays = [...new Set([...primaryDays, ...duplicateDays])];
    
    const primaryHours = primaryHappyHour?.hours || '';
    const duplicateHours = duplicateHappyHour?.hours || '';
    const combinedHours = primaryHours || duplicateHours;
    
    const primaryDesc = primaryHappyHour?.description || '';
    const duplicateDesc = duplicateHappyHour?.description || '';
    const combinedDesc = primaryDesc || duplicateDesc;
    
    if (combinedDays.length > 0 || combinedHours || combinedDesc) {
      merged.happyHour = {
        days: combinedDays,
        hours: combinedHours,
        description: combinedDesc,
      };
    }
  }

  // Merge weeklySpecials (combine arrays, remove duplicates by day)
  const primaryWeekly = Array.isArray(primary.weeklySpecials) ? primary.weeklySpecials : [];
  const duplicateWeekly = Array.isArray(duplicate.weeklySpecials) ? duplicate.weeklySpecials : [];
  const weeklyMap = new Map();
  
  [...primaryWeekly, ...duplicateWeekly].forEach((special: any) => {
    const day = special.day?.toLowerCase();
    if (day && !weeklyMap.has(day)) {
      weeklyMap.set(day, special);
    }
  });
  
  if (weeklyMap.size > 0) {
    merged.weeklySpecials = Array.from(weeklyMap.values());
  }

  // Merge deals (combine arrays, remove duplicates by title and description)
  const primaryDeals = Array.isArray(primary.deals) ? primary.deals : [];
  const duplicateDeals = Array.isArray(duplicate.deals) ? duplicate.deals : [];
  const dealsMap = new Map();
  
  [...primaryDeals, ...duplicateDeals].forEach((deal: any) => {
    const key = `${(deal.title || '').toLowerCase()}|${(deal.description || '').toLowerCase()}`;
    if (key !== '|' && !dealsMap.has(key)) {
      dealsMap.set(key, deal);
    }
  });
  
  if (dealsMap.size > 0) {
    merged.deals = Array.from(dealsMap.values());
  }

  // Merge openingHours (use primary, fallback to duplicate)
  if (!merged.openingHours && duplicate.openingHours) {
    merged.openingHours = duplicate.openingHours;
  }

  // Use the more complete status (prefer 'active')
  if (duplicate.status === 'active' && primary.status !== 'active') {
    merged.status = 'active';
  }

  // Update primary restaurant with merged data
  await db.update(restaurants)
    .set({
      address: merged.address,
      suburb: merged.suburb,
      phone: merged.phone,
      websiteUrl: merged.websiteUrl,
      cuisine: merged.cuisine,
      priceRange: merged.priceRange,
      businessType: merged.businessType,
      eatClubUrl: merged.eatClubUrl,
      firstTableUrl: merged.firstTableUrl,
      latitude: merged.latitude,
      longitude: merged.longitude,
      overallRating: merged.overallRating,
      googlePlaceId: merged.googlePlaceId,
      foursquarePlaceId: merged.foursquarePlaceId,
      imageUrls: merged.imageUrls,
      happyHour: merged.happyHour,
      weeklySpecials: merged.weeklySpecials,
      deals: merged.deals,
      openingHours: merged.openingHours,
      status: merged.status,
      updatedAt: merged.updatedAt,
    })
    .where(eq(restaurants.id, primary.id));

  console.log(`   ✅ Updated primary restaurant`);

  // Delete duplicate restaurant
  await db.delete(restaurants)
    .where(eq(restaurants.id, duplicate.id));

  console.log(`   ✅ Deleted duplicate restaurant`);
}

/**
 * Find and merge all duplicate restaurants automatically
 */
async function findAndMergeDuplicates() {
  console.log('🔍 Finding duplicate restaurants...\n');

  // Get all restaurants
  const allRestaurants = await db.select().from(restaurants);
  console.log(`📊 Total restaurants: ${allRestaurants.length}\n`);

  // Group restaurants by normalized name
  const nameGroups = new Map<string, typeof restaurants.$inferSelect[]>();
  
  for (const restaurant of allRestaurants) {
    const normalizedName = normalizeRestaurantName(restaurant.name);
    if (!nameGroups.has(normalizedName)) {
      nameGroups.set(normalizedName, []);
    }
    nameGroups.get(normalizedName)!.push(restaurant);
  }

  // Find groups with multiple restaurants (potential duplicates)
  const duplicateGroups: Array<{ normalizedName: string; restaurants: typeof restaurants.$inferSelect[] }> = [];
  
  for (const [normalizedName, group] of nameGroups.entries()) {
    if (group.length > 1) {
      duplicateGroups.push({ normalizedName, restaurants: group });
    }
  }

  console.log(`🔍 Found ${duplicateGroups.length} groups with potential duplicates:\n`);
  
  let totalMerged = 0;
  
  for (const group of duplicateGroups) {
    const restaurants = group.restaurants;
    
    // For each group, find all pairs that are duplicates
    const processed = new Set<number>();
    
    for (let i = 0; i < restaurants.length; i++) {
      if (processed.has(restaurants[i].id)) continue;
      
      const primary = restaurants[i];
      const duplicates: typeof restaurants.$inferSelect[] = [];
      
      for (let j = i + 1; j < restaurants.length; j++) {
        if (processed.has(restaurants[j].id)) continue;
        
        if (areRestaurantsDuplicates(primary, restaurants[j])) {
          duplicates.push(restaurants[j]);
        }
      }
      
      if (duplicates.length > 0) {
        console.log(`\n📋 Group: "${group.normalizedName}"`);
        console.log(`   Primary: "${primary.name}" (ID: ${primary.id})`);
        duplicates.forEach(d => {
          console.log(`   Duplicate: "${d.name}" (ID: ${d.id})`);
        });
        
        // Merge all duplicates into primary
        for (const duplicate of duplicates) {
          await mergeTwoRestaurants(primary, duplicate);
          processed.add(duplicate.id);
          totalMerged++;
        }
      }
    }
  }

  console.log(`\n✨ Merge complete! Merged ${totalMerged} duplicate restaurant(s).`);
}

// Main execution
findAndMergeDuplicates()
  .then(() => {
    console.log('\n✅ Process completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Process failed:', error);
    process.exit(1);
  });
