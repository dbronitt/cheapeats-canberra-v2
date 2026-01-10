import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurantSubmissions } from '@/src/lib/schema';
import { inArray } from 'drizzle-orm';

/**
 * POST /api/admin/submissions/delete
 * Bulk delete submissions
 * Body: { ids: number[] }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request. Provide ids array.' },
        { status: 400 }
      );
    }

    // Delete submissions
    await db
      .delete(restaurantSubmissions)
      .where(inArray(restaurantSubmissions.id, ids));

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${ids.length} submission(s)`,
      deletedCount: ids.length,
    });
  } catch (error) {
    console.error('Error deleting submissions:', error);
    return NextResponse.json(
      { error: 'Failed to delete submissions' },
      { status: 500 }
    );
  }
}
