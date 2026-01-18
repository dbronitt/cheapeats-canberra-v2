import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurants } from '@/src/lib/schema';
import { eq } from 'drizzle-orm';
import { logChange } from '@/src/lib/audit-log';

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
    
    // Get current restaurant state for audit log
    const currentRestaurant = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId))
      .limit(1);

    if (currentRestaurant.length === 0) {
      return NextResponse.json(
        { error: 'Restaurant not found' },
        { status: 404 }
      );
    }

    const previousState = currentRestaurant[0];
    const updates: any = {};
    const changes: Record<string, { old: any; new: any }> = {};

    // Only update fields that are provided and track changes
    const trackChange = (field: string, newValue: any) => {
      const oldValue = (previousState as any)[field];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes[field] = { old: oldValue, new: newValue };
        updates[field] = newValue;
      }
    };

    if (body.name !== undefined) trackChange('name', body.name);
    if (body.address !== undefined) trackChange('address', body.address || null);
    if (body.suburb !== undefined) trackChange('suburb', body.suburb || null);
    if (body.phone !== undefined) trackChange('phone', body.phone || null);
    if (body.websiteUrl !== undefined) trackChange('websiteUrl', body.websiteUrl || null);
    if (body.cuisine !== undefined) trackChange('cuisine', body.cuisine || null);
    if (body.businessType !== undefined) trackChange('businessType', body.businessType || null);
    if (body.eatClubUrl !== undefined) trackChange('eatClubUrl', body.eatClubUrl || null);
    if (body.firstTableUrl !== undefined) trackChange('firstTableUrl', body.firstTableUrl || null);
    if (body.happyHour !== undefined) trackChange('happyHour', body.happyHour || null);
    if (body.weeklySpecials !== undefined) trackChange('weeklySpecials', body.weeklySpecials || null);
    if (body.deals !== undefined) trackChange('deals', body.deals || null);
    if (body.openingHours !== undefined) trackChange('openingHours', body.openingHours || null);
    if (body.latitude !== undefined) trackChange('latitude', body.latitude ? String(body.latitude) : null);
    if (body.longitude !== undefined) trackChange('longitude', body.longitude ? String(body.longitude) : null);
    if (body.overallRating !== undefined) trackChange('overallRating', body.overallRating ? String(body.overallRating) : null);
    if (body.imageUrls !== undefined) trackChange('imageUrls', body.imageUrls || null);
    if (body.status !== undefined) trackChange('status', body.status);
    if (body.curatorsTopPick !== undefined) {
      // Handle both boolean and string values, ensure it's stored as 'true' or 'false' string
      const topPickValue = body.curatorsTopPick === true || body.curatorsTopPick === 'true' ? 'true' : 'false';
      trackChange('curatorsTopPick', topPickValue);
    }

    // Only proceed if there are actual changes
    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ success: true, restaurant: previousState, message: 'No changes detected' });
    }

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

    // Log the changes to audit log
    const logged = await logChange({
      restaurantId: restaurantId,
      restaurantName: updated[0].name,
      action: 'update',
      changedBy: body.changedBy || 'admin',
      changes: changes,
      previousState: previousState,
    });

    if (!logged) {
      console.warn('[AUDIT] Failed to log changes - check if audit log table exists');
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

