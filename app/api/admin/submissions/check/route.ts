import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurantSubmissions, restaurants } from '@/src/lib/schema';
import { eq, inArray } from 'drizzle-orm';
import { checkAutoApproval, findDuplicateRestaurants } from '@/src/lib/submission-utils';

/**
 * Check submissions for auto-approval eligibility and duplicates
 * POST /api/admin/submissions/check
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

    // Get all submissions
    const submissions = await db
      .select()
      .from(restaurantSubmissions)
      .where(inArray(restaurantSubmissions.id, ids));

    if (submissions.length === 0) {
      return NextResponse.json(
        { error: 'No submissions found' },
        { status: 404 }
      );
    }

    // Get all restaurants for comparison
    const allRestaurants = await db.select().from(restaurants);

    const results: Record<number, {
      autoApproval: ReturnType<typeof checkAutoApproval>;
      duplicates: ReturnType<typeof findDuplicateRestaurants>;
    }> = {};

    for (const submission of submissions) {
      const autoApproval = checkAutoApproval(submission, allRestaurants);
      const duplicates = findDuplicateRestaurants(submission, allRestaurants);
      
      results[submission.id] = {
        autoApproval,
        duplicates,
      };
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Error checking submissions:', error);
    return NextResponse.json(
      { error: 'Failed to check submissions' },
      { status: 500 }
    );
  }
}
