import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurantFlags } from '@/src/lib/schema';
import { z } from 'zod';

const reportSchema = z.object({
  restaurantId: z.number(),
  restaurantName: z.string().min(1),
  issueType: z.string().min(1),
  description: z.string().min(1),
  reportedBy: z.union([
    z.string().email(),
    z.literal(''),
    z.null(),
  ]).optional(),
});

// Map issue types to flag types
const issueTypeToFlagType: Record<string, string> = {
  'Restaurant now closed': 'shut_down',
  'Hours are wrong': 'wrong_hours',
  'Cuisine is wrong': 'other',
  'Other': 'other',
};

export async function POST(request: Request) {
  let body: any = null;
  try {
    console.log('[DEBUG] POST /api/report/restaurant: Received request');
    body = await request.json();
    console.log('[DEBUG] POST /api/report/restaurant: Request body:', JSON.stringify(body, null, 2));
    
    const validated = reportSchema.parse(body);
    console.log('[DEBUG] POST /api/report/restaurant: Validation passed');

    // Map issue type to flag type
    const flagType = issueTypeToFlagType[validated.issueType] || 'other';

    // Create a flag for restaurant issue
    console.log('[DEBUG] POST /api/report/restaurant: Inserting flag into database');
    const flag = await db.insert(restaurantFlags).values({
      restaurantId: validated.restaurantId,
      restaurantName: validated.restaurantName,
      flagType: flagType,
      description: validated.description,
      reportedBy: validated.reportedBy && validated.reportedBy.trim() !== '' ? validated.reportedBy : null,
      status: 'pending',
    }).returning();

    console.log('[DEBUG] POST /api/report/restaurant: Flag created successfully:', flag[0].id);
    return NextResponse.json({
      success: true,
      flag: flag[0],
      message: 'Report submitted successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[DEBUG] POST /api/report/restaurant: Validation error:', error.errors);
      console.error('[DEBUG] POST /api/report/restaurant: Received data:', body);
      return NextResponse.json(
        { error: 'Invalid report data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('[DEBUG] POST /api/report/restaurant: Error submitting restaurant report:', error);
    return NextResponse.json(
      { error: 'Failed to submit report' },
      { status: 500 }
    );
  }
}
