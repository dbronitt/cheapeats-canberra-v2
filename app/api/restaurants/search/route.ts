import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurants } from '@/src/lib/schema';
import { and, eq, or, like, sql } from 'drizzle-orm';

// API endpoint for autocomplete - returns ALL restaurants (not filtered by deals)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!query || query.length < 2) {
      return NextResponse.json([]);
    }

    const conditions = [
      eq(restaurants.status, 'active'),
      or(
        like(restaurants.name, `%${query}%`),
        like(restaurants.suburb, `%${query}%`),
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
