import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurantFlags } from '@/src/lib/schema';
import { eq, desc, and } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    console.log('[DEBUG] GET /api/admin/flags: Fetching flags');
    
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // 'pending', 'resolved', 'dismissed', or 'all'
    
    console.log('[DEBUG] GET /api/admin/flags: Status filter:', status);
    
    // Build query conditions
    const conditions = [];
    if (status && status !== 'all') {
      conditions.push(eq(restaurantFlags.status, status));
    }
    
    // Fetch flags
    const flags = await db
      .select()
      .from(restaurantFlags)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(restaurantFlags.createdAt));
    
    console.log('[DEBUG] GET /api/admin/flags: Found', flags.length, 'flags');
    
    return NextResponse.json({
      success: true,
      flags: flags,
      count: flags.length,
    });
  } catch (error) {
    console.error('[DEBUG] GET /api/admin/flags: Error fetching flags:', error);
    return NextResponse.json(
      { error: 'Failed to fetch flags', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
