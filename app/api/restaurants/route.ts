import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurants, incorrectImages } from '@/src/lib/schema';
import { and, eq, or, like, sql, inArray, isNotNull, isNull } from 'drizzle-orm';
import { isRestaurantOpen } from '@/src/lib/utils';
import { filterEatClubLogos } from '@/src/lib/eatclub';

// Cache incorrect images for 5 minutes (in production, use Redis)
let incorrectImagesCache: Set<string> | null = null;
let incorrectImagesCacheTime = 0;
const INCORRECT_IMAGES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const revalidate = 60; // Revalidate API route every 60 seconds
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const suburb = searchParams.get('suburb') || undefined;
    const cuisine = searchParams.get('cuisine') || undefined;
    const openNow = searchParams.get('openNow') === 'true';
    const search = searchParams.get('search') || undefined;
    const hasHappyHour = searchParams.get('hasHappyHour') === 'true';
    const hasWeeklySpecials = searchParams.get('hasWeeklySpecials') === 'true';
    const weeklySpecialDay = searchParams.get('weeklySpecialDay') || undefined;
    const hasCurrentDeals = searchParams.get('hasCurrentDeals') === 'true';
    const hasEatClub = searchParams.get('hasEatClub') === 'true';
    const hasFirstTable = searchParams.get('hasFirstTable') === 'true';
    const hasTopPicks = searchParams.get('hasTopPicks') === 'true';
    const hasDeals = searchParams.get('hasDeals') === 'true'; // Show restaurants with any deal
    const includeInactive = searchParams.get('includeInactive') === 'true'; // Admin: include inactive restaurants
    const limit = parseInt(searchParams.get('limit') || '50', 10); // Default 50 per page
    const page = parseInt(searchParams.get('page') || '1', 10); // Default page 1
    const offset = (page - 1) * limit;

    const conditions = [];

    // Filter by active status (unless includeInactive is true for admin)
    if (!includeInactive) {
      conditions.push(eq(restaurants.status, 'active'));
    }

    // Apply filters
    if (suburb) {
      conditions.push(eq(restaurants.suburb, suburb));
    }

    if (cuisine) {
      conditions.push(eq(restaurants.cuisine, cuisine));
    }

    if (search) {
      conditions.push(
        or(
          like(restaurants.name, `%${search}%`),
          like(restaurants.suburb, `%${search}%`),
          sql`${restaurants.address} ILIKE ${'%' + search + '%'}`
        )!
      );
    }

    // Add SQL-level filters for JSONB fields to reduce data transfer
    // Filter by deals using SQL JSONB queries (much faster than in-memory filtering)
    if (hasDeals) {
      conditions.push(
        or(
          sql`${restaurants.happyHour} IS NOT NULL`,
          sql`${restaurants.weeklySpecials} IS NOT NULL AND jsonb_typeof(${restaurants.weeklySpecials}) = 'array' AND jsonb_array_length(${restaurants.weeklySpecials}) > 0`,
          sql`${restaurants.deals} IS NOT NULL AND jsonb_typeof(${restaurants.deals}) = 'array' AND jsonb_array_length(${restaurants.deals}) > 0`,
          sql`${restaurants.eatClubUrl} IS NOT NULL AND ${restaurants.eatClubUrl} != ''`,
          sql`${restaurants.firstTableUrl} IS NOT NULL AND ${restaurants.firstTableUrl} != ''`
        )!
      );
    }

    if (hasHappyHour) {
      conditions.push(sql`${restaurants.happyHour} IS NOT NULL`);
    }

    if (hasWeeklySpecials) {
      conditions.push(sql`${restaurants.weeklySpecials} IS NOT NULL AND jsonb_typeof(${restaurants.weeklySpecials}) = 'array' AND jsonb_array_length(${restaurants.weeklySpecials}) > 0`);
    }

    if (hasEatClub) {
      conditions.push(sql`${restaurants.eatClubUrl} IS NOT NULL AND ${restaurants.eatClubUrl} != ''`);
    }

    if (hasFirstTable) {
      conditions.push(sql`${restaurants.firstTableUrl} IS NOT NULL AND ${restaurants.firstTableUrl} != ''`);
    }

    if (hasTopPicks) {
      conditions.push(eq(restaurants.curatorsTopPick, 'true'));
    }

    // Build query with all conditions
    let query = db.select().from(restaurants);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    // Check if we need in-memory filtering (openNow, hasCurrentDeals, weeklySpecialDay)
    const needsInMemoryFiltering = openNow || hasCurrentDeals || weeklySpecialDay;
    
    // Get total count BEFORE pagination for accurate pagination metadata
    let countQuery: unknown = db.select({ count: sql<number>`count(*)` }).from(restaurants);
    if (conditions.length > 0) {
      countQuery = (countQuery as { where: (c: unknown) => unknown }).where(and(...conditions));
    }
    const countResult = await (countQuery as Promise<{ count: number }[]>);
    const totalCountBeforePagination = Number(countResult[0]?.count || 0);
    
    // If we need in-memory filtering, load more data (up to 1000) to filter, then paginate
    // Otherwise, paginate at SQL level for maximum performance
    if (needsInMemoryFiltering) {
      query = (query as any).limit(1000);
    } else {
      query = (query as any).limit(limit).offset(offset);
    }
    
    let results = await query;

    // Filter by open/closed status in memory (can't easily do in SQL with JSONB hours)
    if (openNow) {
      results = results.filter(restaurant => {
        try {
          const hours = restaurant.openingHours as Record<string, string> | null;
          return isRestaurantOpen(hours);
        } catch (e) {
          // If there's an error parsing hours, assume restaurant is closed
          return false;
        }
      });
    }

    // Filter by current deals (in-house only) - must check in memory to exclude EatClub/FirstTable
    if (hasCurrentDeals) {
      results = results.filter(restaurant => {
        const deals = restaurant.deals;
        if (!deals || !Array.isArray(deals) || deals.length === 0) {
          return false;
        }
        
        // Filter out EatClub and First Table deals - only count in-house deals
        const inHouseDeals = deals.filter(deal => {
          const dealObj = deal as { title?: string; source?: string };
          // Exclude EatClub deals
          const isEatClub = dealObj.title === 'EatClub Deal Available' || 
                          dealObj.source === 'eatclub' || 
                          dealObj.source === 'EatClub';
          // Exclude First Table deals
          const isFirstTable = dealObj.source === 'firsttable' || 
                             dealObj.source === 'FirstTable' ||
                             dealObj.source === 'first_table' ||
                             (dealObj.title && dealObj.title.toLowerCase().includes('first table'));
          
          return !isEatClub && !isFirstTable;
        });
        
        return inHouseDeals.length > 0;
      });
    }

    // Additional in-memory filter: weekly specials on a specific day, if requested.
    if (weeklySpecialDay) {
      const normalizeDay = (value: string): string | null => {
        const v = value.toLowerCase().trim();
        if (!v) return null;
        if (v.startsWith('mon')) return 'monday';
        if (v.startsWith('tue')) return 'tuesday';
        if (v.startsWith('wed')) return 'wednesday';
        if (v.startsWith('thu')) return 'thursday';
        if (v.startsWith('fri')) return 'friday';
        if (v.startsWith('sat')) return 'saturday';
        if (v.startsWith('sun')) return 'sunday';
        return null;
      };

      const targetDay = normalizeDay(weeklySpecialDay);

      if (targetDay) {
        results = results.filter(restaurant => {
          const weeklySpecials = restaurant.weeklySpecials as Array<{ day?: string }> | null;
          if (!weeklySpecials || !Array.isArray(weeklySpecials) || weeklySpecials.length === 0) {
            return false;
          }
          return weeklySpecials.some(special => {
            const d = special && typeof special.day === 'string' ? normalizeDay(special.day) : null;
            return d === targetDay;
          });
        });
      }
    }

    // Cache incorrect images to avoid repeated DB queries
    const now = Date.now();
    if (!incorrectImagesCache || now - incorrectImagesCacheTime > INCORRECT_IMAGES_CACHE_TTL) {
      const incorrectImageUrls = await db.select({ imageUrl: incorrectImages.imageUrl })
        .from(incorrectImages);
      incorrectImagesCache = new Set(incorrectImageUrls.map(img => img.imageUrl));
      incorrectImagesCacheTime = now;
    }
    const incorrectUrlsSet = incorrectImagesCache;
    
    results = results.map(restaurant => {
      const imageUrls = (restaurant.imageUrls as string[] | null) || [];
      // Filter out incorrect images and EatClub logos
      let filteredImages = imageUrls.filter(url => !incorrectUrlsSet.has(url));
      filteredImages = filterEatClubLogos(filteredImages);
      
      return {
        ...restaurant,
        imageUrls: filteredImages.length > 0 ? filteredImages : null,
      };
    });

    // Sort restaurants: those with images first, those without images last
    results.sort((a, b) => {
      const aHasImages = a.imageUrls !== null && Array.isArray(a.imageUrls) && a.imageUrls.length > 0;
      const bHasImages = b.imageUrls !== null && Array.isArray(b.imageUrls) && b.imageUrls.length > 0;
      
      // If both have images or both don't have images, maintain original order (or sort by name)
      if (aHasImages === bHasImages) {
        return a.name.localeCompare(b.name);
      }
      
      // Restaurants with images come first (return -1 means a comes before b)
      return aHasImages ? -1 : 1;
    });

    // Apply in-memory pagination if we did in-memory filtering
    let paginatedResults = results;
    let totalCount = totalCountBeforePagination;
    
    if (needsInMemoryFiltering) {
      // After in-memory filters, apply pagination
      totalCount = results.length;
      paginatedResults = results.slice(offset, offset + limit);
    }
    
    // Debug logging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.log('[API DEBUG] Total restaurants after SQL filtering:', totalCountBeforePagination);
      if (needsInMemoryFiltering) {
        console.log('[API DEBUG] After in-memory filters:', totalCount, 'paginated to', paginatedResults.length);
      }
    }
    
    // Return paginated results with metadata and caching headers
    return NextResponse.json({
      restaurants: paginatedResults,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNextPage: offset + limit < totalCount,
        hasPreviousPage: page > 1,
      },
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('Error fetching restaurants:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Log full error details in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Full error:', error);
      console.error('Stack:', errorStack);
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch restaurants',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
      },
      { status: 500 }
    );
  }
}
