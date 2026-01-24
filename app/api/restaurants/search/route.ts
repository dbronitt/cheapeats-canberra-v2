import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurants } from '@/src/lib/schema';
import { and, eq, or, like, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// API endpoint for autocomplete - returns ALL restaurants (not filtered by deals)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!query || query.length < 2) {
      return NextResponse.json([]);
    }

    // Use ILIKE for case-insensitive search
    const conditions = [
      eq(restaurants.status, 'active'),
      or(
        sql`${restaurants.name} ILIKE ${'%' + query + '%'}`,
        sql`${restaurants.suburb} ILIKE ${'%' + query + '%'}`,
        sql`${restaurants.address} ILIKE ${'%' + query + '%'}`
      )!
    ];

    const results = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        address: restaurants.address,
        suburb: restaurants.suburb,
        phone: restaurants.phone,
        cuisine: restaurants.cuisine,
        priceRange: restaurants.priceRange,
        websiteUrl: restaurants.websiteUrl,
        businessType: restaurants.businessType,
      })
      .from(restaurants)
      .where(and(...conditions))
      .limit(limit);

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error searching restaurants:', error);
    return NextResponse.json(
      { error: 'Failed to search restaurants' },
      { status: 500 }
    );
  }
}
