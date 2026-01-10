import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurants } from '@/src/lib/schema';
import { eq } from 'drizzle-orm';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const restaurantId = parseInt(params.id);
    
    if (isNaN(restaurantId)) {
      return NextResponse.json(
        { error: 'Invalid restaurant ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updates: any = {};

    // Only update fields that are provided
    if (body.name !== undefined) updates.name = body.name;
    if (body.address !== undefined) updates.address = body.address || null;
    if (body.suburb !== undefined) updates.suburb = body.suburb || null;
    if (body.phone !== undefined) updates.phone = body.phone || null;
    if (body.websiteUrl !== undefined) updates.websiteUrl = body.websiteUrl || null;
    if (body.cuisine !== undefined) updates.cuisine = body.cuisine || null;
    if (body.businessType !== undefined) updates.businessType = body.businessType || null;
    if (body.eatClubUrl !== undefined) updates.eatClubUrl = body.eatClubUrl || null;
    if (body.firstTableUrl !== undefined) updates.firstTableUrl = body.firstTableUrl || null;
    if (body.happyHour !== undefined) updates.happyHour = body.happyHour || null;
    if (body.weeklySpecials !== undefined) updates.weeklySpecials = body.weeklySpecials || null;
    if (body.deals !== undefined) updates.deals = body.deals || null;
    if (body.openingHours !== undefined) updates.openingHours = body.openingHours || null;
    if (body.latitude !== undefined) updates.latitude = body.latitude ? String(body.latitude) : null;
    if (body.longitude !== undefined) updates.longitude = body.longitude ? String(body.longitude) : null;
    if (body.overallRating !== undefined) updates.overallRating = body.overallRating ? String(body.overallRating) : null;
    if (body.imageUrls !== undefined) updates.imageUrls = body.imageUrls || null;
    if (body.status !== undefined) updates.status = body.status;

    updates.updatedAt = new Date();

    const updated = await db
      .update(restaurants)
      .set(updates)
      .where(eq(restaurants.id, restaurantId))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json(
        { error: 'Restaurant not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, restaurant: updated[0] });
  } catch (error) {
    console.error('Error updating restaurant:', error);
    return NextResponse.json(
      { error: 'Failed to update restaurant' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const restaurantId = parseInt(params.id);
    
    if (isNaN(restaurantId)) {
      return NextResponse.json(
        { error: 'Invalid restaurant ID' },
        { status: 400 }
      );
    }

    // Soft delete by setting status to 'inactive'
    const updated = await db
      .update(restaurants)
      .set({ 
        status: 'inactive',
        updatedAt: new Date()
      })
      .where(eq(restaurants.id, restaurantId))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json(
        { error: 'Restaurant not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: 'Restaurant deactivated' });
  } catch (error) {
    console.error('Error deleting restaurant:', error);
    return NextResponse.json(
      { error: 'Failed to delete restaurant' },
      { status: 500 }
    );
  }
}

