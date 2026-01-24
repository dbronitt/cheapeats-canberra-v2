import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { incorrectImages, restaurants } from '@/src/lib/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { imageUrl, restaurantId, restaurantName, reason } = await request.json();

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    // Add to incorrect images table
    await db.insert(incorrectImages).values({
      imageUrl,
      restaurantId: restaurantId?.toString(),
      restaurantName,
      reason: reason || null,
    }).onConflictDoNothing();

    // If restaurantId is provided, remove the image from that restaurant's imageUrls
    if (restaurantId) {
      const restaurant = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
      
      if (restaurant.length > 0) {
        const currentImages = (restaurant[0].imageUrls as string[] | null) || [];
        const filteredImages = currentImages.filter(url => url !== imageUrl);
        
        await db.update(restaurants)
          .set({ 
            imageUrls: filteredImages.length > 0 ? filteredImages : null,
            updatedAt: new Date()
          })
          .where(eq(restaurants.id, restaurantId));
      }
    }

    return NextResponse.json({ 
      success: true,
      message: 'Image marked as incorrect and removed from restaurant' 
    });
  } catch (error) {
    console.error('Error marking image as incorrect:', error);
    return NextResponse.json(
      { error: 'Failed to mark image as incorrect' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    // Check if image is marked as incorrect
    const result = await db.select()
      .from(incorrectImages)
      .where(eq(incorrectImages.imageUrl, imageUrl))
      .limit(1);

    return NextResponse.json({ 
      isIncorrect: result.length > 0,
      record: result[0] || null
    });
  } catch (error) {
    console.error('Error checking image:', error);
    return NextResponse.json(
      { error: 'Failed to check image' },
      { status: 500 }
    );
  }
}

