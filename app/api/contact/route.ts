import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { contactSubmissions } from '@/src/lib/schema';
import { z } from 'zod';

const contactSchema = z.object({
  email: z.string().email('Invalid email address'),
  query: z.string().min(1, 'Query cannot be empty').max(5000, 'Query is too long'),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate request body
    const validated = contactSchema.parse(body);

    // Insert contact submission into database
    const submission = await db.insert(contactSubmissions).values({
      email: validated.email,
      query: validated.query,
      status: 'pending',
    }).returning();

    console.log('[DEBUG] Contact submission created:', submission[0]?.id);

    return NextResponse.json(
      { 
        success: true,
        message: 'Contact form submitted successfully',
        id: submission[0]?.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error processing contact submission:', error);
    
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
        error: 'Failed to submit contact form',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
