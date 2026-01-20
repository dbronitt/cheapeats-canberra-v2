import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurantAuditLog, restaurants } from '@/src/lib/schema';
import { eq, inArray } from 'drizzle-orm';

/**
 * POST /api/admin/audit-log/revert-bulk
 * Revert multiple changes by restoring previous state.
 * Body: { logIds: number[] }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const logIdsRaw = body?.logIds;

    if (!Array.isArray(logIdsRaw) || logIdsRaw.length === 0) {
      return NextResponse.json(
        { error: 'logIds must be a non-empty array' },
        { status: 400 }
      );
    }

    // Normalize + de-dupe
    const logIds = Array.from(
      new Set(
        logIdsRaw
          .map((v: any) => (typeof v === 'string' ? parseInt(v, 10) : v))
          .filter((v: any) => Number.isInteger(v) && v > 0)
      )
    ) as number[];

    if (logIds.length === 0) {
      return NextResponse.json(
        { error: 'logIds must contain valid numeric IDs' },
        { status: 400 }
      );
    }

    console.log('[AUDIT] Bulk revert requested:', logIds);

    // Fetch logs (we'll still process in the requested order)
    const logs = await db
      .select()
      .from(restaurantAuditLog)
      .where(inArray(restaurantAuditLog.id, logIds));

    const logsById = new Map<number, any>(logs.map((l: any) => [l.id, l]));

    const results: Array<{
      logId: number;
      success: boolean;
      message: string;
      restaurantId?: number;
    }> = [];

    for (const logId of logIds) {
      try {
        const log = logsById.get(logId);
        if (!log) {
          results.push({ logId, success: false, message: 'Audit log entry not found' });
          continue;
        }

        if (!log.previousState) {
          results.push({ logId, success: false, message: 'Previous state not available', restaurantId: log.restaurantId });
          continue;
        }

        const currentRestaurant = await db
          .select()
          .from(restaurants)
          .where(eq(restaurants.id, log.restaurantId))
          .limit(1);

        if (currentRestaurant.length === 0) {
          results.push({ logId, success: false, message: 'Restaurant not found', restaurantId: log.restaurantId });
          continue;
        }

        const before = currentRestaurant[0];
        const previousStateData = log.previousState as any;

        const revertUpdates: any = {};
        const changes: Record<string, { old: any; new: any }> = {};

        const changedFields = Object.keys(log.changes as Record<string, any>);
        for (const field of changedFields) {
          const oldValue = (before as any)[field];
          const newValue = previousStateData[field];
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changes[field] = { old: oldValue, new: newValue };
            revertUpdates[field] = newValue;
          }
        }

        if (Object.keys(revertUpdates).length === 0) {
          results.push({ logId, success: true, message: 'No changes to revert', restaurantId: log.restaurantId });
          continue;
        }

        revertUpdates.updatedAt = new Date();

        const reverted = await db
          .update(restaurants)
          .set(revertUpdates)
          .where(eq(restaurants.id, log.restaurantId))
          .returning();

        // Log the revert action (so it appears in Recent Changes)
        try {
          await db.insert(restaurantAuditLog).values({
            restaurantId: log.restaurantId,
            restaurantName: reverted[0]?.name,
            action: 'revert',
            changedBy: 'admin', // TODO: auth
            changes: changes,
            previousState: before,
          });
        } catch (error) {
          console.error('[AUDIT] Error logging bulk revert:', error);
        }

        results.push({ logId, success: true, message: 'Reverted', restaurantId: log.restaurantId });
      } catch (error) {
        console.error('[AUDIT] Bulk revert error for logId', logId, error);
        results.push({ logId, success: false, message: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    return NextResponse.json({
      success: failureCount === 0,
      message: `Bulk revert complete: ${successCount} succeeded, ${failureCount} failed`,
      results,
    });
  } catch (error) {
    console.error('Error bulk reverting changes:', error);
    return NextResponse.json(
      { error: 'Failed to bulk revert changes', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

