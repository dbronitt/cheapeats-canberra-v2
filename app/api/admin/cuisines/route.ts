import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurants } from '@/src/lib/schema';
import { sql, isNotNull } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    // Get all unique, non-null cuisines from restaurants using SQL DISTINCT
    const result = await db
      .select({ cuisine: restaurants.cuisine })
      .from(restaurants)
      .where(isNotNull(restaurants.cuisine));

    // Extract unique cuisine strings and filter out nulls/empty strings
    const cuisineSet = new Set<string>();
    result.forEach(r => {
      if (r.cuisine && r.cuisine.trim() !== '') {
        cuisineSet.add(r.cuisine.trim());
      }
    });

    const cuisineList = Array.from(cuisineSet).sort();

    return NextResponse.json({ cuisines: cuisineList });
  } catch (error) {
    console.error('Error fetching cuisines:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cuisines' },
      { status: 500 }
    );
  }
}
