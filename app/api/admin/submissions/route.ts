import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurantSubmissions } from '@/src/lib/schema';
import { desc, eq, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// GET all submissions
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending'; // pending, approved, rejected, all

    let query = db.select().from(restaurantSubmissions);

    if (status !== 'all') {
      query = query.where(eq(restaurantSubmissions.status, status)) as any;
    }

    const submissions = await query.orderBy(desc(restaurantSubmissions.createdAt));

    return NextResponse.json({ submissions });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch submissions' },
      { status: 500 }
    );
  }
}
