import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurants, incorrectImages } from '@/src/lib/schema';
import { eq, sql } from 'drizzle-orm';
import { scrapeEatClubVenue, filterEatClubLogos } from '@/src/lib/eatclub';
import { searchUberEatsRestaurant, filterUberEatsLogos } from '@/src/lib/ubereats';
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
  try {
    const incorrect = await db.select({ imageUrl: incorrectImages.imageUrl })
      .from(incorrectImages);
    return new Set(incorrect.map(img => img.imageUrl));
  } catch (error) {
    return new Set<string>();
  }
}

function hasDeals(restaurant: any): boolean {
  const happyHour = restaurant.happyHour;
  const weeklySpecials = restaurant.weeklySpecials;
  const deals = restaurant.deals;
  const hasEatClubUrl = restaurant.eatClubUrl !== null && restaurant.eatClubUrl !== undefined && restaurant.eatClubUrl !== '';
  const hasFirstTableUrl = restaurant.firstTableUrl !== null && restaurant.firstTableUrl !== undefined && restaurant.firstTableUrl !== '';
  
  return (
    (happyHour !== null && happyHour !== undefined) ||
    (weeklySpecials !== null && weeklySpecials !== undefined && Array.isArray(weeklySpecials) && weeklySpecials.length > 0) ||
    (deals !== null && deals !== undefined && Array.isArray(deals) && deals.length > 0) ||
    hasEatClubUrl ||
    hasFirstTableUrl
  );
}

async function findRestaurantsWithoutImages(): Promise<any[]> {
  const restaurantsWithoutImages = await db
    .select()
    .from(restaurants)
    .where(
      sql`(
        ${restaurants.imageUrls} IS NULL OR 
        ${restaurants.imageUrls} = '[]'::jsonb OR
        jsonb_array_length(${restaurants.imageUrls}) = 0
      ) AND ${restaurants.status} = 'active'`
    )
    .limit(50); // Limit to 50 for API calls

  return restaurantsWithoutImages.filter(r => hasDeals(r));
}

function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  const hasImageExtension = imageExtensions.some(ext => 
    url.toLowerCase().includes(ext)
  );
  
  const looksLikeImage = !!(url.match(/\/images?\//i) || 
                         url.match(/\/media\//i) ||
                         url.match(/\/photos?\//i) ||
                         url.match(/\/gallery\//i) ||
                         url.match(/\/assets\/.*\.(jpg|jpeg|png|gif|webp)/i));
  
  return hasImageExtension || looksLikeImage;
}

async function searchImagesForRestaurant(restaurant: any, incorrectUrls: Set<string>): Promise<{ images: string[]; source: string }> {
  const foundImages: string[] = [];
  let source = 'none';

  // Try EatClub first
  if (restaurant.eatClubUrl) {
    try {
      const venue = await scrapeEatClubVenue(restaurant.eatClubUrl);
      if (venue?.imageUrls && venue.imageUrls.length > 0) {
        const filtered = filterEatClubLogos(venue.imageUrls);
        for (const img of filtered) {
          if (!incorrectUrls.has(img) && isValidImageUrl(img)) {
            foundImages.push(img);
          }
        }
        if (foundImages.length > 0) {
          source = 'eatclub';
          return { images: foundImages, source };
        }
      }
    } catch (error) {
      console.error('Error searching EatClub:', error);
    }
  }

  // Try Uber Eats
  try {
    const ubereatsResult = await searchUberEatsRestaurant(restaurant.name, restaurant.suburb || undefined);
    if (ubereatsResult && ubereatsResult.imageUrls && ubereatsResult.imageUrls.length > 0) {
      const filtered = filterUberEatsLogos(ubereatsResult.imageUrls);
      for (const img of filtered) {
        if (!incorrectUrls.has(img) && isValidImageUrl(img)) {
          foundImages.push(img);
        }
      }
      if (foundImages.length > 0) {
        source = 'ubereats';
        return { images: foundImages, source };
      }
    }
  } catch (error) {
    console.error('Error searching Uber Eats:', error);
  }

  // Try website
  if (restaurant.websiteUrl) {
    try {
      const response = await fetch(restaurant.websiteUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      const html = await response.text();
      const $ = cheerio.load(html);
      
      $('img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && isValidImageUrl(src) && !incorrectUrls.has(src)) {
          const fullUrl = src.startsWith('http') ? src : new URL(src, restaurant.websiteUrl).toString();
          if (!foundImages.includes(fullUrl)) {
            foundImages.push(fullUrl);
          }
        }
      });

      if (foundImages.length > 0) {
        source = 'website';
        return { images: foundImages, source };
      }
    } catch (error) {
      console.error('Error searching website:', error);
    }
  }

  return { images: foundImages, source };
}

async function updateRestaurantImages(restaurantId: number, images: string[]) {
  await db.update(restaurants)
    .set({
      imageUrls: images,
      updatedAt: new Date(),
    })
    .where(eq(restaurants.id, restaurantId));
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST() {
  try {
    console.log('[API] Starting image search...');
    
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

    const incorrectUrls = await getIncorrectImageUrls();
    const restaurantsWithoutImages = await findRestaurantsWithoutImages();
    stats.total = restaurantsWithoutImages.length;

    if (stats.total === 0) {
      return NextResponse.json({
        success: true,
        message: 'All restaurants already have images',
        stats,
      });
    }

    // Process each restaurant (limit to 10 for API calls to avoid timeout)
    const limit = Math.min(10, restaurantsWithoutImages.length);
    for (let i = 0; i < limit; i++) {
      const restaurant = restaurantsWithoutImages[i];
      stats.processed++;

      try {
        const result = await searchImagesForRestaurant(restaurant, incorrectUrls);

        if (result.images.length > 0) {
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
          
          await updateRestaurantImages(restaurant.id, result.images);
          stats.updated++;
        } else {
          stats.skipped++;
        }

        // Rate limiting
        if (i < limit - 1) {
          await sleep(5000);
        }
      } catch (error) {
        stats.errors++;
        console.error(`Error processing ${restaurant.name}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Image search complete',
      stats,
    });
  } catch (error) {
    console.error('Error searching images:', error);
    return NextResponse.json(
      { error: 'Failed to search images', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
