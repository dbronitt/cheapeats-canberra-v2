import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurants, incorrectImages } from '@/src/lib/schema';
import { and, eq, or, like, sql, inArray } from 'drizzle-orm';
import { isRestaurantOpen } from '@/src/lib/utils';
import { filterEatClubLogos } from '@/src/lib/eatclub';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const suburb = searchParams.get('suburb') || undefined;
    const cuisine = searchParams.get('cuisine') || undefined;
    const openNow = searchParams.get('openNow') === 'true';
    const search = searchParams.get('search') || undefined;
    const hasHappyHour = searchParams.get('hasHappyHour') === 'true';
    const hasWeeklySpecials = searchParams.get('hasWeeklySpecials') === 'true';
    const hasCurrentDeals = searchParams.get('hasCurrentDeals') === 'true';
    const hasEatClub = searchParams.get('hasEatClub') === 'true';
    const hasFirstTable = searchParams.get('hasFirstTable') === 'true';
    const hasDeals = searchParams.get('hasDeals') === 'true'; // Show restaurants with any deal
    const limit = parseInt(searchParams.get('limit') || '50', 10); // Default 50 per page
    const page = parseInt(searchParams.get('page') || '1', 10); // Default page 1
    const offset = (page - 1) * limit;

    const conditions = [];

    // Always filter by active status
    conditions.push(eq(restaurants.status, 'active'));

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

    // Build query
    let query = db.select().from(restaurants);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
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

    // Filter by deals (any type) - default behavior for main page
    if (hasDeals) {
      results = results.filter(restaurant => {
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
      });
    }

    // Filter by Happy Hour (inclusive with other filters - AND logic)
    if (hasHappyHour) {
      results = results.filter(restaurant => {
        const happyHour = restaurant.happyHour;
        return happyHour !== null && happyHour !== undefined;
      });
    }

    // Filter by Weekly Specials (inclusive with other filters - AND logic)
    if (hasWeeklySpecials) {
      results = results.filter(restaurant => {
        const weeklySpecials = restaurant.weeklySpecials;
        return (
          weeklySpecials !== null &&
          weeklySpecials !== undefined &&
          Array.isArray(weeklySpecials) &&
          weeklySpecials.length > 0
        );
      });
    }

    // Filter by Current Deals (inclusive with other filters - AND logic)
    // Only show in-house deals, exclude EatClub and First Table deals
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

    // Filter by EatClub (inclusive with other filters - AND logic)
    if (hasEatClub) {
      results = results.filter(restaurant => {
        return restaurant.eatClubUrl !== null && restaurant.eatClubUrl !== undefined && restaurant.eatClubUrl !== '';
      });
    }

    // Filter by First Table (inclusive with other filters - AND logic)
    if (hasFirstTable) {
      results = results.filter(restaurant => {
        return restaurant.firstTableUrl !== null && restaurant.firstTableUrl !== undefined && restaurant.firstTableUrl !== '';
      });
    }

    // Filter out incorrect images from results
    const incorrectImageUrls = await db.select({ imageUrl: incorrectImages.imageUrl })
      .from(incorrectImages);
    
    const incorrectUrlsSet = new Set(incorrectImageUrls.map(img => img.imageUrl));
    
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

    // Calculate total count before pagination
    const totalCount = results.length;
    
    // Debug logging
    console.log('[API DEBUG] Total restaurants after filtering:', totalCount);
    console.log('[API DEBUG] Pagination - page:', page, 'limit:', limit, 'offset:', offset);
    console.log('[API DEBUG] Filters applied:', {
      hasDeals,
      hasHappyHour,
      hasWeeklySpecials,
      hasCurrentDeals,
      hasEatClub,
      hasFirstTable,
      suburb,
      cuisine,
      openNow,
      search,
    });
    
    // Apply pagination
    const paginatedResults = results.slice(offset, offset + limit);
    
    console.log('[API DEBUG] Returning', paginatedResults.length, 'restaurants for page', page);
    
    // Return paginated results with metadata
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
