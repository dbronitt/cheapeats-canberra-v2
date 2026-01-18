import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { contactSubmissions } from '@/src/lib/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateSchema = z.object({
  status: z.enum(['pending', 'responded', 'archived']),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid submission ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validated = updateSchema.parse(body);

    const updated = await db
      .update(contactSubmissions)
      .set({
        status: validated.status,
        updatedAt: new Date(),
      })
      .where(eq(contactSubmissions.id, id))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json(
        { error: 'Contact submission not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      submission: updated[0],
    });
  } catch (error) {
    console.error('Error updating contact submission:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation error',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        error: 'Failed to update contact submission',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
