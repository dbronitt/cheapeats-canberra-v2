import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurantAuditLog } from '@/src/lib/schema';
import { desc, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/audit-log
 * Get recent changes to restaurants
 * Query params: limit (default 50), restaurantId (optional)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const restaurantId = searchParams.get('restaurantId');

    let query = db
      .select()
      .from(restaurantAuditLog)
      .orderBy(desc(restaurantAuditLog.createdAt))
      .limit(limit);

    if (restaurantId) {
      const id = parseInt(restaurantId);
      if (!isNaN(id)) {
        query = query.where(eq(restaurantAuditLog.restaurantId, id)) as any;
      }
    }

    const logs = await query;

    return NextResponse.json({
      success: true,
      logs,
      count: logs.length,
    });
  } catch (error) {
    console.error('Error fetching audit log:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit log' },
      { status: 500 }
    );
  }
}
