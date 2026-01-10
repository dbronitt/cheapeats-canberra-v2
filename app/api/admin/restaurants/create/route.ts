import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurants } from '@/src/lib/schema';
import { eq } from 'drizzle-orm';
import { createSlug } from '@/src/lib/utils';
import { logChange } from '@/src/lib/audit-log';

/**
 * POST /api/admin/restaurants/create
 * Create a new empty restaurant for editing
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Restaurant name is required' },
        { status: 400 }
      );
    }

    const slug = createSlug(name);
    
    // Check if restaurant already exists
    const existingRestaurant = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.slug, slug))
      .limit(1);

    if (existingRestaurant.length > 0) {
      return NextResponse.json({
        success: true,
        restaurantId: existingRestaurant[0].id,
        message: 'Restaurant already exists',
      });
    }

    // Create new restaurant
    const newRestaurant = await db
      .insert(restaurants)
      .values({
        name: name.trim(),
        slug: slug,
        address: null,
        suburb: null,
        phone: null,
        websiteUrl: null,
        cuisine: null,
        businessType: null,
        priceRange: null,
        status: 'inactive',
      })
      .returning();
    
    // Log the creation to audit log
    await logChange({
      restaurantId: newRestaurant[0].id,
      restaurantName: newRestaurant[0].name,
      action: 'create',
      changedBy: 'admin',
      changes: { name: { old: null, new: name.trim() } },
      previousState: null,
    });
    
    return NextResponse.json({
      success: true,
      restaurantId: newRestaurant[0].id,
      restaurant: newRestaurant[0],
      message: 'Restaurant created successfully',
    });
  } catch (error) {
    console.error('Error creating restaurant:', error);
    return NextResponse.json(
      { error: 'Failed to create restaurant' },
      { status: 500 }
    );
  }
}
