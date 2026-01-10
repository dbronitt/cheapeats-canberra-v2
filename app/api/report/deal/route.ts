import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurantFlags } from '@/src/lib/schema';
import { z } from 'zod';

const reportSchema = z.object({
  restaurantId: z.number(),
  restaurantName: z.string(),
  dealType: z.string(),
  dealDescription: z.string(),
  reason: z.string().min(1),
  reportedBy: z.string().email().optional().or(z.literal('')),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = reportSchema.parse(body);

    // Create a flag for incorrect deal
    const flag = await db.insert(restaurantFlags).values({
      restaurantId: validated.restaurantId,
      restaurantName: validated.restaurantName,
      flagType: 'deal_doesnt_exist', // Using existing flag type for incorrect deals
      description: `Deal Type: ${validated.dealType}\nDeal Description: ${validated.dealDescription}\nReason: ${validated.reason}`,
      reportedBy: validated.reportedBy || null,
      status: 'pending',
    }).returning();

    return NextResponse.json({
      success: true,
      flag: flag[0],
      message: 'Report submitted successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid report data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error submitting deal report:', error);
    return NextResponse.json(
      { error: 'Failed to submit report' },
      { status: 500 }
    );
  }
}
