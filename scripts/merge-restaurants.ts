import 'dotenv/config';
import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq, or, like } from 'drizzle-orm';

/**
 * Merge two restaurant entries into one
 * Combines all data from both entries and keeps the primary one
 */
async function mergeRestaurants(primaryName: string, duplicateName: string) {
  console.log(`🔍 Searching for restaurants to merge...`);
  console.log(`   Primary: "${primaryName}"`);
  console.log(`   Duplicate: "${duplicateName}"`);
  console.log('');

  // Find both restaurants
  const allRestaurants = await db.select().from(restaurants);
  
  const primary = allRestaurants.find(r => 
    r.name.toLowerCase() === primaryName.toLowerCase()
  );
  
  const duplicate = allRestaurants.find(r => 
    r.name.toLowerCase() === duplicateName.toLowerCase()
  );

  if (!primary) {
    console.error(`❌ Primary restaurant "${primaryName}" not found!`);
    return;
  }

  if (!duplicate) {
    console.error(`❌ Duplicate restaurant "${duplicateName}" not found!`);
    return;
  }

  console.log(`✅ Found primary: "${primary.name}" (ID: ${primary.id})`);
  console.log(`✅ Found duplicate: "${duplicate.name}" (ID: ${duplicate.id})`);
  console.log('');

  // Merge data - combine arrays and use non-null values
  const merged: any = {
    ...primary,
    updatedAt: new Date(),
  };

  // Merge address/suburb (use duplicate if primary is missing)
  if (!merged.address && duplicate.address) {
    merged.address = duplicate.address;
  }
  if (!merged.suburb && duplicate.suburb) {
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
    const primaryDays = primaryHappyHour?.days || [];
    const duplicateDays = duplicateHappyHour?.days || [];
    const combinedDays = [...new Set([...primaryDays, ...duplicateDays])];
    
    const primaryHours = primaryHappyHour?.hours || '';
    const duplicateHours = duplicateHappyHour?.hours || '';
    const combinedHours = primaryHours || duplicateHours;
    
    const primaryDesc = primaryHappyHour?.description || '';
    const duplicateDesc = duplicateHappyHour?.description || '';
    const combinedDesc = primaryDesc || duplicateDesc;
    
    merged.happyHour = {
      days: combinedDays,
      hours: combinedHours,
      description: combinedDesc,
    };
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

  // Merge deals (combine arrays, remove duplicates by title)
  const primaryDeals = Array.isArray(primary.deals) ? primary.deals : [];
  const duplicateDeals = Array.isArray(duplicate.deals) ? duplicate.deals : [];
  const dealsMap = new Map<string, any>();
  
  [...primaryDeals, ...duplicateDeals].forEach((deal: any) => {
    const title = (deal.title || '').toLowerCase().trim();
    const desc = (deal.description || '').toLowerCase().trim();
    const key = `${title}-${desc}`;
    // Use title+description as key for better duplicate detection
    if (key !== '-' && !dealsMap.has(key)) {
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

  console.log('📊 Merged data summary:');
  console.log(`   Images: ${allImages.length} total`);
  console.log(`   Happy Hour days: ${merged.happyHour?.days?.length || 0}`);
  console.log(`   Weekly Specials: ${merged.weeklySpecials?.length || 0}`);
  console.log(`   Deals: ${merged.deals?.length || 0}`);
  console.log('');

  // Update primary restaurant with merged data
  console.log(`💾 Updating primary restaurant (ID: ${primary.id})...`);
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

  console.log(`✅ Updated primary restaurant`);
  console.log('');

  // Delete duplicate restaurant
  console.log(`🗑️  Deleting duplicate restaurant (ID: ${duplicate.id})...`);
  await db.delete(restaurants)
    .where(eq(restaurants.id, duplicate.id));

  console.log(`✅ Deleted duplicate restaurant`);
  console.log('');
  console.log(`✨ Merge complete! All data from "${duplicate.name}" has been merged into "${primary.name}"`);
}

// Main execution
const primaryName = 'Hopscotch Bar';
const duplicateName = 'Hopscotch';

mergeRestaurants(primaryName, duplicateName)
  .then(() => {
    console.log('✅ Merge completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Merge failed:', error);
    process.exit(1);
  });
