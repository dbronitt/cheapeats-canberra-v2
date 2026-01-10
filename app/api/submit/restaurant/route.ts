import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurantSubmissions } from '@/src/lib/schema';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

const submissionSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  suburb: z.string().optional(),
  phone: z.string().optional(),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  cuisine: z.string().optional(),
  businessType: z.string().optional(),
  description: z.string().optional(),
  submittedBy: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = submissionSchema.parse(body);

    // Check if restaurant already exists
    const existing = await db.select()
      .from(restaurantSubmissions)
      .where(sql`LOWER(name) = LOWER(${validated.name})`)
      .limit(1);

    if (existing.length > 0 && existing[0].status === 'pending') {
      return NextResponse.json(
        { error: 'A submission for this restaurant is already pending review' },
        { status: 400 }
      );
    }

    const submission = await db.insert(restaurantSubmissions).values({
      name: validated.name,
      address: validated.address || null,
      suburb: validated.suburb || null,
      phone: validated.phone || null,
      websiteUrl: validated.websiteUrl || null,
      cuisine: validated.cuisine || null,
      businessType: validated.businessType || null,
      description: validated.description || null,
      submittedBy: validated.submittedBy || null,
      status: 'pending',
    }).returning();

    return NextResponse.json({ 
      success: true, 
      submission: submission[0],
      message: 'Restaurant submission received! We\'ll review it soon.' 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid submission data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error submitting restaurant:', error);
    return NextResponse.json(
      { error: 'Failed to submit restaurant' },
      { status: 500 }
    );
  }
}

