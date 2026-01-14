import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurantFlags } from '@/src/lib/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateFlagSchema = z.object({
  status: z.enum(['pending', 'resolved', 'dismissed']),
  resolvedBy: z.string().optional(),
  resolutionNotes: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    console.log('[DEBUG] PATCH /api/admin/flags/[id]: Updating flag', params.id);
    
    const flagId = parseInt(params.id);
    if (isNaN(flagId)) {
      return NextResponse.json(
        { error: 'Invalid flag ID' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    const validated = updateFlagSchema.parse(body);
    
    console.log('[DEBUG] PATCH /api/admin/flags/[id]: Update data:', validated);
    
    // Prepare update data
    const updateData: any = {
      status: validated.status,
      updatedAt: new Date(),
    };
    
    if (validated.status === 'resolved' || validated.status === 'dismissed') {
      updateData.resolvedAt = new Date();
      if (validated.resolvedBy) {
        updateData.resolvedBy = validated.resolvedBy;
      }
      if (validated.resolutionNotes) {
        updateData.resolutionNotes = validated.resolutionNotes;
      }
    } else if (validated.status === 'pending') {
      // Reset resolution fields when reverting to pending
      updateData.resolvedAt = null;
      updateData.resolvedBy = null;
      updateData.resolutionNotes = null;
    }
    
    // Update the flag
    const updatedFlags = await db
      .update(restaurantFlags)
      .set(updateData)
      .where(eq(restaurantFlags.id, flagId))
      .returning();
    
    if (updatedFlags.length === 0) {
      return NextResponse.json(
        { error: 'Flag not found' },
        { status: 404 }
      );
    }
    
    console.log('[DEBUG] PATCH /api/admin/flags/[id]: Flag updated successfully');
    
    return NextResponse.json({
      success: true,
      flag: updatedFlags[0],
      message: `Flag marked as ${validated.status}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[DEBUG] PATCH /api/admin/flags/[id]: Validation error:', error.errors);
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('[DEBUG] PATCH /api/admin/flags/[id]: Error updating flag:', error);
    return NextResponse.json(
      { error: 'Failed to update flag', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
