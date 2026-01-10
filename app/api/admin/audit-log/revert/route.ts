import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurantAuditLog, restaurants } from '@/src/lib/schema';
import { eq } from 'drizzle-orm';

/**
 * POST /api/admin/audit-log/revert
 * Revert a change by restoring previous state
 * Body: { logId: number }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { logId } = body;

    if (!logId) {
      return NextResponse.json(
        { error: 'logId is required' },
        { status: 400 }
      );
    }

    // Get the audit log entry
    const logEntry = await db
      .select()
      .from(restaurantAuditLog)
      .where(eq(restaurantAuditLog.id, logId))
      .limit(1);

    if (logEntry.length === 0) {
      return NextResponse.json(
        { error: 'Audit log entry not found' },
        { status: 404 }
      );
    }

    const log = logEntry[0];

    if (!log.previousState) {
      return NextResponse.json(
        { error: 'Previous state not available for this log entry' },
        { status: 400 }
      );
    }

    // Get current restaurant state for new audit log
    const currentRestaurant = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.id, log.restaurantId))
      .limit(1);

    if (currentRestaurant.length === 0) {
      return NextResponse.json(
        { error: 'Restaurant not found' },
        { status: 404 }
      );
    }

    const previousState = currentRestaurant[0];
    const previousStateData = log.previousState as any;

    // Build revert updates from previous state
    const revertUpdates: any = {};
    const changes: Record<string, { old: any; new: any }> = {};

    // Only revert fields that were changed in the original log entry
    const changedFields = Object.keys(log.changes as Record<string, any>);
    
    for (const field of changedFields) {
      const oldValue = (previousState as any)[field];
      const newValue = previousStateData[field];
      
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes[field] = { old: oldValue, new: newValue };
        revertUpdates[field] = newValue;
      }
    }

    if (Object.keys(revertUpdates).length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No changes to revert',
        restaurant: previousState,
      });
    }

    revertUpdates.updatedAt = new Date();

    // Apply revert
    const reverted = await db
      .update(restaurants)
      .set(revertUpdates)
      .where(eq(restaurants.id, log.restaurantId))
      .returning();

    // Log the revert action
    try {
      await db.insert(restaurantAuditLog).values({
        restaurantId: log.restaurantId,
        restaurantName: reverted[0].name,
        action: 'revert',
        changedBy: 'admin', // TODO: Get from auth
        changes: changes,
        previousState: previousState,
      });
    } catch (error) {
      console.error('Error logging revert:', error);
    }

    return NextResponse.json({
      success: true,
      restaurant: reverted[0],
      message: 'Changes reverted successfully',
    });
  } catch (error) {
    console.error('Error reverting change:', error);
    return NextResponse.json(
      { error: 'Failed to revert change' },
      { status: 500 }
    );
  }
}
