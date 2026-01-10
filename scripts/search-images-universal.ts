// Load environment variables FIRST using dotenv (must use require for synchronous loading)
require('dotenv').config({ path: '.env.local' });

// Now import after env vars are loaded
import { db } from '../src/lib/db';
import { restaurants, incorrectImages } from '../src/lib/schema';
import { eq } from 'drizzle-orm';
import { scrapeEatClubVenue, filterEatClubLogos } from '../src/lib/eatclub';
import { searchUberEatsRestaurant, filterUberEatsLogos } from '../src/lib/ubereats';
import * as cheerio from 'cheerio';

interface SearchStats {
  total: number;
  processed: number;
  foundEatClub: number;
  foundUberEats: number;
  foundWebsite: number;
  foundFacebook: number;
  foundInstagram: number;
  updated: number;
  skipped: number;
  errors: number;
}

async function getIncorrectImageUrls(): Promise<Set<string>> {
  console.log('📋 [DEBUG] Loading incorrect image URLs from database...');
  try {
    const incorrect = await db.select({ imageUrl: incorrectImages.imageUrl })
      .from(incorrectImages);
    const urlSet = new Set(incorrect.map(img => img.imageUrl));
    console.log(`   ✅ [DEBUG] Loaded ${urlSet.size} incorrect image URLs to exclude`);
    return urlSet;
  } catch (error) {
    console.log('   ⚠️  [DEBUG] Could not load incorrect images list, continuing without it');
    console.log(`   [DEBUG] Error: ${error}`);
    return new Set<string>();
  }
}

function hasDeals(restaurant: any): boolean {
  const happyHour = restaurant.happyHour;
  const weeklySpecials = restaurant.weeklySpecials;
  const deals = restaurant.deals;
  const hasEatClubUrl = restaurant.eatClubUrl !== null && restaurant.eatClubUrl !== undefined && restaurant.eatClubUrl !== '';
  const hasFirstTableUrl = restaurant.firstTableUrl !== null && restaurant.firstTableUrl !== undefined && restaurant.firstTableUrl !== '';
  
  // Check if restaurant has any direct deals (happy hour, weekly specials, or deals)
  const hasDirectDeals = (
    (happyHour !== null && happyHour !== undefined) ||
    (weeklySpecials !== null && weeklySpecials !== undefined && Array.isArray(weeklySpecials) && weeklySpecials.length > 0) ||
    (deals !== null && deals !== undefined && Array.isArray(deals) && deals.length > 0)
  );
  
  // Include restaurants with direct deals OR platform links (EatClub/FirstTable)
  return hasDirectDeals || hasEatClubUrl || hasFirstTableUrl;
}

async function findRestaurantsWithoutImages() {
  console.log('🔎 [DEBUG] Querying database for active restaurants...');
  const allRestaurants = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.status, 'active'))
    .limit(1000);

  console.log(`   ✅ [DEBUG] Found ${allRestaurants.length} active restaurants in database`);

  // Filter client-side for more accurate detection
  const restaurantsWithoutImages = allRestaurants.filter(restaurant => {
    const imageUrls = restaurant.imageUrls as string[] | null;
    const imageUrl = restaurant.imageUrl as string | null;
    
    // No images if:
    // - imageUrls is null/undefined
    // - imageUrls is empty array
    // - imageUrl is also null/undefined
    const hasNoImages = (
      (!imageUrls || (Array.isArray(imageUrls) && imageUrls.length === 0)) &&
      !imageUrl
    );
    
    // Must also have deals to appear on main page
    const appearsOnMainPage = hasDeals(restaurant);
    
    if (hasNoImages && appearsOnMainPage) {
      console.log(`   📝 [DEBUG] Restaurant "${restaurant.name}" (ID: ${restaurant.id}) has no images but appears on main page`);
    }
    
    return hasNoImages && appearsOnMainPage;
  }).slice(0, 100); // Process first 100

  console.log(`   ✅ [DEBUG] Filtered to ${restaurantsWithoutImages.length} restaurants without images that appear on main page`);
  return restaurantsWithoutImages;
}

function isLogoOrIcon(url: string, baseUrl: string): boolean {
  const lowerUrl = url.toLowerCase();
  
  // Common logo/icon keywords
  const logoKeywords = [
    'logo', 'icon', 'brand', 'mark', 'symbol', 'favicon',
    'avatar', 'profile', 'thumbnail', 'placeholder', 'default'
  ];
  
  // Check if URL contains logo keywords
  if (logoKeywords.some(keyword => lowerUrl.includes(keyword))) {
    return true;
  }
  
  // Check for common logo paths
  const logoPaths = [
    '/logo', '/logos', '/branding', '/assets/logo', '/images/logo',
    '/img/logo', '/static/logo', '/media/logo'
  ];
  
  if (logoPaths.some(path => lowerUrl.includes(path))) {
    return true;
  }
  
  // Check for very small images (likely icons)
  const smallImageMatch = lowerUrl.match(/(\d+)x(\d+)/);
  if (smallImageMatch) {
    const width = parseInt(smallImageMatch[1]);
    const height = parseInt(smallImageMatch[2]);
    if (width < 200 || height < 200) {
      return true;
    }
  }
  
  // Check file extension for icons
  if (lowerUrl.match(/\.(ico|svg)$/)) {
    return true;
  }
  
  return false;
}

function isValidImageUrl(url: string): boolean {
  // Must be a valid image URL
  if (!url || url.trim() === '') return false;
  
  // Must start with http:// or https://
  if (!url.match(/^https?:\/\//i)) return false;
  
  // Must have a valid image extension or be a data URL
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  const hasImageExtension = imageExtensions.some(ext => 
    url.toLowerCase().includes(ext)
  );
  
  // Allow URLs without extension if they look like image URLs (e.g., CDN URLs)
  const looksLikeImage = url.match(/\/images?\//i) || 
                         url.match(/\/media\//i) ||
                         url.match(/\/photos?\//i) ||
                         url.match(/\/gallery\//i) ||
                         url.match(/\/assets\/.*\.(jpg|jpeg|png|gif|webp)/i);
  
  return hasImageExtension || looksLikeImage;
}

function normalizeImageUrl(url: string, baseUrl: string): string {
  // Handle relative URLs
  if (url.startsWith('//')) {
    return 'https:' + url;
  }
  
  if (url.startsWith('/')) {
    try {
      const base = new URL(baseUrl);
      return base.origin + url;
    } catch {
      return url;
    }
  }
  
  if (!url.startsWith('http')) {
    try {
      return new URL(url, baseUrl).toString();
    } catch {
      return url;
    }
  }
  
  return url;
}

async function searchImagesFromEatClub(restaurant: any, incorrectUrls: Set<string>): Promise<string[]> {
  console.log(`   🍽️  [DEBUG] Step 1: Checking EatClub for "${restaurant.name}"...`);
  
  if (!restaurant.eatClubUrl) {
    console.log(`   ⏭️  [DEBUG] No EatClub URL found, skipping EatClub search`);
    return [];
  }

  console.log(`   🔗 [DEBUG] EatClub URL: ${restaurant.eatClubUrl}`);
  
  try {
    console.log(`   📡 [DEBUG] Scraping EatClub venue page...`);
    const eatClubVenue = await scrapeEatClubVenue(restaurant.eatClubUrl);
    
    if (!eatClubVenue) {
      console.log(`   ⚠️  [DEBUG] Failed to scrape EatClub venue page`);
      return [];
    }

    console.log(`   ✅ [DEBUG] Successfully scraped EatClub venue`);
    console.log(`   📊 [DEBUG] EatClub returned ${eatClubVenue.imageUrls?.length || 0} image(s)`);

    if (!eatClubVenue.imageUrls || eatClubVenue.imageUrls.length === 0) {
      console.log(`   ⏭️  [DEBUG] No images found on EatClub page`);
      return [];
    }

    // Filter out logos and incorrect images
    let filteredImages = filterEatClubLogos(eatClubVenue.imageUrls);
    filteredImages = filteredImages.filter(url => !incorrectUrls.has(url));
    
    console.log(`   ✅ [DEBUG] After filtering: ${filteredImages.length} valid image(s) from EatClub`);
    
    if (filteredImages.length > 0) {
      console.log(`   🎯 [DEBUG] EatClub images found: ${filteredImages.slice(0, 3).join(', ')}${filteredImages.length > 3 ? '...' : ''}`);
    }
    
    return filteredImages;
  } catch (error) {
    console.error(`   ❌ [DEBUG] Error searching EatClub:`, error);
    return [];
  }
}

async function searchImagesFromUberEats(restaurant: any, incorrectUrls: Set<string>): Promise<string[]> {
  console.log(`   🚗 [DEBUG] Step 2: Checking Uber Eats for "${restaurant.name}"...`);
  
  try {
    console.log(`   📡 [DEBUG] Searching Uber Eats with name: "${restaurant.name}", suburb: "${restaurant.suburb || 'N/A'}"`);
    const uberEatsResult = await searchUberEatsRestaurant(restaurant.name, restaurant.suburb);
    
    if (!uberEatsResult) {
      console.log(`   ⚠️  [DEBUG] No results found on Uber Eats`);
      return [];
    }

    console.log(`   ✅ [DEBUG] Found restaurant on Uber Eats`);
    console.log(`   📊 [DEBUG] Uber Eats returned ${uberEatsResult.imageUrls?.length || 0} image(s)`);

    if (!uberEatsResult.imageUrls || uberEatsResult.imageUrls.length === 0) {
      console.log(`   ⏭️  [DEBUG] No images found on Uber Eats`);
      return [];
    }

    // Filter out logos and incorrect images
    let filteredImages = filterUberEatsLogos(uberEatsResult.imageUrls);
    filteredImages = filteredImages.filter(url => !incorrectUrls.has(url));
    
    console.log(`   ✅ [DEBUG] After filtering: ${filteredImages.length} valid image(s) from Uber Eats`);
    
    if (filteredImages.length > 0) {
      console.log(`   🎯 [DEBUG] Uber Eats images found: ${filteredImages.slice(0, 3).join(', ')}${filteredImages.length > 3 ? '...' : ''}`);
    }
    
    return filteredImages;
  } catch (error) {
    console.error(`   ❌ [DEBUG] Error searching Uber Eats:`, error);
    return [];
  }
}

async function searchImagesFromWebsite(websiteUrl: string, incorrectUrls: Set<string>): Promise<string[]> {
  console.log(`   🌐 [DEBUG] Step 3: Checking website: ${websiteUrl}`);
  
  try {
    console.log(`   📡 [DEBUG] Fetching website HTML...`);
    
    // More realistic browser headers to avoid 403 errors
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    };
    
    const response = await fetch(websiteUrl, {
      headers,
      redirect: 'follow',
    });

    console.log(`   📊 [DEBUG] HTTP Response Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      if (response.status === 403) {
        console.log(`   ⚠️  [DEBUG] HTTP 403 Forbidden - Website blocked the request`);
        console.log(`   💡 [DEBUG] This website may require JavaScript or have anti-bot protection`);
        return [];
      }
      console.log(`   ⚠️  [DEBUG] HTTP ${response.status}: ${response.statusText}`);
      return [];
    }

    console.log(`   ✅ [DEBUG] Successfully fetched website HTML`);
    const html = await response.text();
    console.log(`   📏 [DEBUG] HTML length: ${html.length} characters`);
    
    const $ = cheerio.load(html);
    const imageUrls = new Set<string>();

    // Try og:image meta tag first (usually the best image)
    console.log(`   🔍 [DEBUG] Checking for og:image meta tag...`);
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      console.log(`   ✅ [DEBUG] Found og:image: ${ogImage}`);
      const normalizedOgImage = normalizeImageUrl(ogImage, websiteUrl);
      if (isValidImageUrl(normalizedOgImage) && 
          !isLogoOrIcon(normalizedOgImage, websiteUrl) &&
          !incorrectUrls.has(normalizedOgImage)) {
        imageUrls.add(normalizedOgImage);
        console.log(`   ✅ [DEBUG] Added og:image to results`);
      } else {
        console.log(`   ⏭️  [DEBUG] og:image filtered out (invalid/logo/incorrect)`);
      }
    } else {
      console.log(`   ⏭️  [DEBUG] No og:image meta tag found`);
    }

    // Try twitter:image
    console.log(`   🔍 [DEBUG] Checking for twitter:image meta tag...`);
    const twitterImage = $('meta[name="twitter:image"]').attr('content') || 
                         $('meta[property="twitter:image"]').attr('content');
    if (twitterImage) {
      console.log(`   ✅ [DEBUG] Found twitter:image: ${twitterImage}`);
      const normalizedTwitterImage = normalizeImageUrl(twitterImage, websiteUrl);
      if (isValidImageUrl(normalizedTwitterImage) && 
          !isLogoOrIcon(normalizedTwitterImage, websiteUrl) &&
          !incorrectUrls.has(normalizedTwitterImage)) {
        imageUrls.add(normalizedTwitterImage);
        console.log(`   ✅ [DEBUG] Added twitter:image to results`);
      } else {
        console.log(`   ⏭️  [DEBUG] twitter:image filtered out (invalid/logo/incorrect)`);
      }
    } else {
      console.log(`   ⏭️  [DEBUG] No twitter:image meta tag found`);
    }

    // Scrape all images from the page
    console.log(`   🔍 [DEBUG] Scanning page for <img> tags...`);
    let imgCount = 0;
    $('img').each((_, el) => {
      imgCount++;
      const src = $(el).attr('src') || 
                  $(el).attr('data-src') || 
                  $(el).attr('data-lazy-src') ||
                  $(el).attr('data-original');
      
      if (src) {
        const normalizedUrl = normalizeImageUrl(src, websiteUrl);
        
        if (isValidImageUrl(normalizedUrl) && 
            !isLogoOrIcon(normalizedUrl, websiteUrl) &&
            !incorrectUrls.has(normalizedUrl)) {
          imageUrls.add(normalizedUrl);
        }
      }
    });
    console.log(`   📊 [DEBUG] Found ${imgCount} <img> tags, ${imageUrls.size} valid images after filtering`);

    // Also check picture elements
    console.log(`   🔍 [DEBUG] Scanning <picture> elements...`);
    let pictureCount = 0;
    $('picture source').each((_, el) => {
      pictureCount++;
      const srcset = $(el).attr('srcset');
      if (srcset) {
        // Parse srcset (format: "url1 1x, url2 2x" or "url1 200w, url2 400w")
        const sources = srcset.split(',').map(s => s.trim().split(/\s+/)[0]);
        sources.forEach(src => {
          if (src) {
            const normalizedUrl = normalizeImageUrl(src, websiteUrl);
            if (isValidImageUrl(normalizedUrl) && 
                !isLogoOrIcon(normalizedUrl, websiteUrl) &&
                !incorrectUrls.has(normalizedUrl)) {
              imageUrls.add(normalizedUrl);
            }
          }
        });
      }
    });
    console.log(`   📊 [DEBUG] Found ${pictureCount} <picture> elements`);

    // Convert Set to Array and limit to 10 images
    const imageArray = Array.from(imageUrls).slice(0, 10);
    
    console.log(`   ✅ [DEBUG] Total unique images found from website: ${imageArray.length}`);
    if (imageArray.length > 0) {
      console.log(`   🎯 [DEBUG] Website images: ${imageArray.slice(0, 3).join(', ')}${imageArray.length > 3 ? '...' : ''}`);
    }
    
    return imageArray;
  } catch (error) {
    console.error(`   ❌ [DEBUG] Error scraping website:`, error);
    return [];
  }
}

async function searchImagesFromFacebook(restaurant: any, incorrectUrls: Set<string>): Promise<string[]> {
  console.log(`   📘 [DEBUG] Step 4: Checking Facebook for "${restaurant.name}"...`);
  
  // Try to find Facebook URL from website or search
  let facebookUrl: string | null = null;
  
  if (restaurant.websiteUrl) {
    // Check if website URL is a Facebook page
    if (restaurant.websiteUrl.includes('facebook.com')) {
      facebookUrl = restaurant.websiteUrl;
      console.log(`   ✅ [DEBUG] Found Facebook URL from website: ${facebookUrl}`);
    }
  }
  
  if (!facebookUrl) {
    console.log(`   ⏭️  [DEBUG] No Facebook URL found, skipping Facebook search`);
    return [];
  }

  try {
    console.log(`   📡 [DEBUG] Fetching Facebook page: ${facebookUrl}`);
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    
    const response = await fetch(facebookUrl, { headers });
    
    if (!response.ok) {
      console.log(`   ⚠️  [DEBUG] HTTP ${response.status}: ${response.statusText}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const imageUrls = new Set<string>();

    // Facebook pages often have og:image
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      const normalized = normalizeImageUrl(ogImage, facebookUrl);
      if (isValidImageUrl(normalized) && !isLogoOrIcon(normalized, facebookUrl) && !incorrectUrls.has(normalized)) {
        imageUrls.add(normalized);
        console.log(`   ✅ [DEBUG] Found Facebook og:image`);
      }
    }

    // Look for profile/cover images
    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src) {
        const normalized = normalizeImageUrl(src, facebookUrl);
        if (isValidImageUrl(normalized) && !isLogoOrIcon(normalized, facebookUrl) && !incorrectUrls.has(normalized)) {
          imageUrls.add(normalized);
        }
      }
    });

    const imageArray = Array.from(imageUrls).slice(0, 5);
    console.log(`   ✅ [DEBUG] Found ${imageArray.length} image(s) from Facebook`);
    return imageArray;
  } catch (error) {
    console.error(`   ❌ [DEBUG] Error searching Facebook:`, error);
    return [];
  }
}

async function searchImagesFromInstagram(restaurant: any, incorrectUrls: Set<string>): Promise<string[]> {
  console.log(`   📷 [DEBUG] Step 5: Checking Instagram for "${restaurant.name}"...`);
  
  // Try to find Instagram URL from website or search
  let instagramUrl: string | null = null;
  
  if (restaurant.websiteUrl) {
    // Check if website URL is an Instagram page
    if (restaurant.websiteUrl.includes('instagram.com')) {
      instagramUrl = restaurant.websiteUrl;
      console.log(`   ✅ [DEBUG] Found Instagram URL from website: ${instagramUrl}`);
    }
  }
  
  if (!instagramUrl) {
    console.log(`   ⏭️  [DEBUG] No Instagram URL found, skipping Instagram search`);
    return [];
  }

  try {
    console.log(`   📡 [DEBUG] Fetching Instagram page: ${instagramUrl}`);
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    
    const response = await fetch(instagramUrl, { headers });
    
    if (!response.ok) {
      console.log(`   ⚠️  [DEBUG] HTTP ${response.status}: ${response.statusText}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const imageUrls = new Set<string>();

    // Instagram pages have og:image
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      const normalized = normalizeImageUrl(ogImage, instagramUrl);
      if (isValidImageUrl(normalized) && !isLogoOrIcon(normalized, instagramUrl) && !incorrectUrls.has(normalized)) {
        imageUrls.add(normalized);
        console.log(`   ✅ [DEBUG] Found Instagram og:image`);
      }
    }

    const imageArray = Array.from(imageUrls).slice(0, 5);
    console.log(`   ✅ [DEBUG] Found ${imageArray.length} image(s) from Instagram`);
    return imageArray;
  } catch (error) {
    console.error(`   ❌ [DEBUG] Error searching Instagram:`, error);
    return [];
  }
}

async function searchImagesForRestaurant(restaurant: any, incorrectUrls: Set<string>): Promise<{ images: string[]; source: string }> {
  console.log(`\n   🔍 [DEBUG] ===== Starting image search for "${restaurant.name}" (ID: ${restaurant.id}) =====`);
  console.log(`   📍 [DEBUG] Location: ${restaurant.suburb || 'Unknown'}, ${restaurant.address || 'No address'}`);
  console.log(`   🔗 [DEBUG] EatClub URL: ${restaurant.eatClubUrl || 'None'}`);
  console.log(`   🌐 [DEBUG] Website URL: ${restaurant.websiteUrl || 'None'}`);
  
  const allImages: string[] = [];
  let source = 'none';

  // Step 1: Try EatClub
  const eatClubImages = await searchImagesFromEatClub(restaurant, incorrectUrls);
  if (eatClubImages.length > 0) {
    allImages.push(...eatClubImages);
    source = 'eatclub';
    console.log(`   ✅ [DEBUG] SUCCESS: Found ${eatClubImages.length} image(s) from EatClub - stopping search`);
    return { images: eatClubImages.slice(0, 10), source: 'eatclub' };
  }

  // Step 2: Try Uber Eats
  const uberEatsImages = await searchImagesFromUberEats(restaurant, incorrectUrls);
  if (uberEatsImages.length > 0) {
    allImages.push(...uberEatsImages);
    source = 'ubereats';
    console.log(`   ✅ [DEBUG] SUCCESS: Found ${uberEatsImages.length} image(s) from Uber Eats - stopping search`);
    return { images: uberEatsImages.slice(0, 10), source: 'ubereats' };
  }

  // Step 3: Try Website
  if (restaurant.websiteUrl) {
    const websiteImages = await searchImagesFromWebsite(restaurant.websiteUrl, incorrectUrls);
    if (websiteImages.length > 0) {
      allImages.push(...websiteImages);
      source = 'website';
      console.log(`   ✅ [DEBUG] SUCCESS: Found ${websiteImages.length} image(s) from website - stopping search`);
      return { images: websiteImages.slice(0, 10), source: 'website' };
    }
  }

  // Step 4: Try Facebook (if website is Facebook)
  if (restaurant.websiteUrl && restaurant.websiteUrl.includes('facebook.com')) {
    const facebookImages = await searchImagesFromFacebook(restaurant, incorrectUrls);
    if (facebookImages.length > 0) {
      allImages.push(...facebookImages);
      source = 'facebook';
      console.log(`   ✅ [DEBUG] SUCCESS: Found ${facebookImages.length} image(s) from Facebook`);
      return { images: facebookImages.slice(0, 10), source: 'facebook' };
    }
  }

  // Step 5: Try Instagram (if website is Instagram)
  if (restaurant.websiteUrl && restaurant.websiteUrl.includes('instagram.com')) {
    const instagramImages = await searchImagesFromInstagram(restaurant, incorrectUrls);
    if (instagramImages.length > 0) {
      allImages.push(...instagramImages);
      source = 'instagram';
      console.log(`   ✅ [DEBUG] SUCCESS: Found ${instagramImages.length} image(s) from Instagram`);
      return { images: instagramImages.slice(0, 10), source: 'instagram' };
    }
  }

  console.log(`   ⚠️  [DEBUG] No images found from any source`);
  return { images: [], source: 'none' };
}

async function updateRestaurantImages(restaurantId: number, imageUrls: string[]) {
  console.log(`   💾 [DEBUG] Updating restaurant ID ${restaurantId} with ${imageUrls.length} image(s)`);
  await db.update(restaurants)
    .set({
      imageUrls: imageUrls.length > 0 ? imageUrls : null,
      updatedAt: new Date(),
    })
    .where(eq(restaurants.id, restaurantId));
  console.log(`   ✅ [DEBUG] Successfully updated restaurant in database`);
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🔍 ===== UNIVERSAL IMAGE SEARCH SCRIPT =====\n');
  console.log('📋 [DEBUG] Starting universal image search for restaurants without images...\n');

  // Check for required environment variables
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set in environment variables!');
    console.error('Please check your .env.local file');
    process.exit(1);
  }

  const stats: SearchStats = {
    total: 0,
    processed: 0,
    foundEatClub: 0,
    foundUberEats: 0,
    foundWebsite: 0,
    foundFacebook: 0,
    foundInstagram: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    // Get list of incorrect image URLs
    console.log('📋 [DEBUG] Loading incorrect image URLs...');
    const incorrectUrls = await getIncorrectImageUrls();
    console.log(`   ✅ [DEBUG] Loaded ${incorrectUrls.size} incorrect image URLs to exclude\n`);

    // Find restaurants without images
    console.log('🔎 [DEBUG] Finding restaurants without images...');
    const restaurantsWithoutImages = await findRestaurantsWithoutImages();
    stats.total = restaurantsWithoutImages.length;
    console.log(`   ✅ [DEBUG] Found ${stats.total} restaurants without images\n`);

    if (stats.total === 0) {
      console.log('✅ All restaurants already have images!');
      return;
    }

    console.log('🚀 [DEBUG] Starting image search process...\n');

    // Process each restaurant
    for (let i = 0; i < restaurantsWithoutImages.length; i++) {
      const restaurant = restaurantsWithoutImages[i];
      stats.processed++;

      console.log(`\n${'='.repeat(80)}`);
      console.log(`[${stats.processed}/${stats.total}] Processing: ${restaurant.name} (ID: ${restaurant.id})`);
      console.log(`${'='.repeat(80)}`);

      try {
        // Search for images using universal search
        const result = await searchImagesForRestaurant(restaurant, incorrectUrls);

        if (result.images.length > 0) {
          // Track which source found images
          switch (result.source) {
            case 'eatclub':
              stats.foundEatClub++;
              break;
            case 'ubereats':
              stats.foundUberEats++;
              break;
            case 'website':
              stats.foundWebsite++;
              break;
            case 'facebook':
              stats.foundFacebook++;
              break;
            case 'instagram':
              stats.foundInstagram++;
              break;
          }
          
          console.log(`\n   ✅ [DEBUG] Found ${result.images.length} image(s) from ${result.source}`);
          
          // Update restaurant
          await updateRestaurantImages(restaurant.id, result.images);
          stats.updated++;
          console.log(`   ✅ [DEBUG] Successfully updated restaurant with images from ${result.source}`);
        } else {
          stats.skipped++;
          console.log(`\n   ⏭️  [DEBUG] No images found from any source`);
        }

        // Rate limiting - wait 5 seconds between requests to avoid 403 errors
        if (i < restaurantsWithoutImages.length - 1) {
          console.log(`\n   ⏸️  [DEBUG] Waiting 5 seconds before next restaurant...`);
          await sleep(5000);
        }
      } catch (error) {
        stats.errors++;
        console.error(`\n   ❌ [DEBUG] Error processing restaurant:`, error);
      }
    }

    // Print summary
    console.log('\n\n');
    console.log('='.repeat(80));
    console.log('📊 FINAL SUMMARY');
    console.log('='.repeat(80));
    console.log(`   Total restaurants without images: ${stats.total}`);
    console.log(`   Processed: ${stats.processed}`);
    console.log(`   Found from EatClub: ${stats.foundEatClub}`);
    console.log(`   Found from Uber Eats: ${stats.foundUberEats}`);
    console.log(`   Found from Website: ${stats.foundWebsite}`);
    console.log(`   Found from Facebook: ${stats.foundFacebook}`);
    console.log(`   Found from Instagram: ${stats.foundInstagram}`);
    console.log(`   Total updated: ${stats.updated}`);
    console.log(`   Skipped (no images found): ${stats.skipped}`);
    console.log(`   Errors: ${stats.errors}`);
    console.log('='.repeat(80));

    if (stats.updated > 0) {
      console.log(`\n✅ Successfully updated ${stats.updated} restaurant(s) with new images!`);
    } else {
      console.log(`\n⚠️  No restaurants were updated. This could mean:`);
      console.log(`   - No matching restaurants found on EatClub/Uber Eats`);
      console.log(`   - Websites don't have accessible images`);
      console.log(`   - Images were filtered out as logos/icons`);
      console.log(`   - Websites blocked the scraper (403 errors)`);
      console.log(`   - Network/connection issues`);
    }

  } catch (error) {
    console.error('\n❌ [DEBUG] FATAL ERROR:', error);
    process.exit(1);
  }
}

main();
