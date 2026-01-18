import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { contactSubmissions } from '@/src/lib/schema';
import { desc } from 'drizzle-orm';

export async function GET(request: Request) {
  try {
    const submissions = await db
      .select()
      .from(contactSubmissions)
      .orderBy(desc(contactSubmissions.createdAt));

    return NextResponse.json(submissions);
  } catch (error) {
    console.error('Error fetching contact submissions:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { 
        error: 'Failed to fetch contact submissions',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
