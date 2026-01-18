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
    // Handle comma-separated cuisines (e.g., "Indian, Asian" -> ["Indian", "Asian"])
    const cuisineSet = new Set<string>();
    result.forEach(r => {
      if (r.cuisine && r.cuisine.trim() !== '') {
        // Split by comma and trim each cuisine
        const cuisines = r.cuisine.split(',').map(c => c.trim()).filter(c => c !== '');
        cuisines.forEach(cuisine => {
          cuisineSet.add(cuisine);
        });
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
