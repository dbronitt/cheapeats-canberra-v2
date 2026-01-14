import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurantFlags } from '@/src/lib/schema';
import { z } from 'zod';

const reportSchema = z.object({
  restaurantId: z.number(),
  restaurantName: z.string().min(1),
  dealType: z.string().min(1),
  dealDescription: z.string().min(1),
  reason: z.string().min(1),
  reportedBy: z.union([
    z.string().email(),
    z.literal(''),
    z.null(),
  ]).optional(),
});

export async function POST(request: Request) {
  let body: any = null;
  try {
    console.log('[DEBUG] POST /api/report/deal: Received request');
    body = await request.json();
    console.log('[DEBUG] POST /api/report/deal: Request body:', JSON.stringify(body, null, 2));
    
    const validated = reportSchema.parse(body);
    console.log('[DEBUG] POST /api/report/deal: Validation passed');

    // Create a flag for incorrect deal
    console.log('[DEBUG] POST /api/report/deal: Inserting flag into database');
    const flag = await db.insert(restaurantFlags).values({
      restaurantId: validated.restaurantId,
      restaurantName: validated.restaurantName,
      flagType: 'deal_doesnt_exist', // Using existing flag type for incorrect deals
      description: `Deal Type: ${validated.dealType}\nDeal Description: ${validated.dealDescription}\nReason: ${validated.reason}`,
      reportedBy: validated.reportedBy && validated.reportedBy.trim() !== '' ? validated.reportedBy : null,
      status: 'pending',
    }).returning();

    console.log('[DEBUG] POST /api/report/deal: Flag created successfully:', flag[0].id);
    return NextResponse.json({
      success: true,
      flag: flag[0],
      message: 'Report submitted successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[DEBUG] POST /api/report/deal: Validation error:', error.errors);
      console.error('[DEBUG] POST /api/report/deal: Received data:', body);
      return NextResponse.json(
        { error: 'Invalid report data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('[DEBUG] POST /api/report/deal: Error submitting deal report:', error);
    return NextResponse.json(
      { error: 'Failed to submit report' },
      { status: 500 }
    );
  }
}
