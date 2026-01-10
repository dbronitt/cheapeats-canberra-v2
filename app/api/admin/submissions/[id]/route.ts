import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurantSubmissions, restaurants } from '@/src/lib/schema';
import { eq, sql } from 'drizzle-orm';
import { createSlug } from '@/src/lib/utils';
import { extractDealsFromDescription } from '@/src/lib/submission-utils';

// GET single submission
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const submission = await db
      .select()
      .from(restaurantSubmissions)
      .where(eq(restaurantSubmissions.id, parseInt(params.id)))
      .limit(1);

    if (submission.length === 0) {
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ submission: submission[0] });
  } catch (error) {
    console.error('Error fetching submission:', error);
    return NextResponse.json(
      { error: 'Failed to fetch submission' },
      { status: 500 }
    );
  }
}

// PATCH - Update submission (approve/reject/edit)
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { action, updates, reviewedBy } = body; // action: 'approve', 'reject', 'edit'

    const submissionId = parseInt(params.id);
    
    // Get the submission first
    const existingSubmission = await db
      .select()
      .from(restaurantSubmissions)
      .where(eq(restaurantSubmissions.id, submissionId))
      .limit(1);

    if (existingSubmission.length === 0) {
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      );
    }

    const submission = existingSubmission[0];

    if (action === 'approve') {
      // Create restaurant from submission
      const slug = createSlug(submission.name);
      
      // Check if restaurant already exists
      const existingRestaurant = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.slug, slug))
        .limit(1);

      let restaurantId;
      if (existingRestaurant.length > 0) {
        // Update existing restaurant
        const updated = await db
          .update(restaurants)
          .set({
            name: submission.name,
            address: submission.address || existingRestaurant[0].address,
            suburb: submission.suburb || existingRestaurant[0].suburb,
            phone: submission.phone || existingRestaurant[0].phone,
            websiteUrl: submission.websiteUrl || existingRestaurant[0].websiteUrl,
            cuisine: submission.cuisine || existingRestaurant[0].cuisine,
            businessType: submission.businessType || existingRestaurant[0].businessType,
            priceRange: submission.priceRange || existingRestaurant[0].priceRange,
            updatedAt: new Date(),
          })
          .where(eq(restaurants.id, existingRestaurant[0].id))
          .returning();
        
        restaurantId = updated[0].id;
      } else {
        // Create new restaurant
        const newRestaurant = await db
          .insert(restaurants)
          .values({
            name: submission.name,
            slug: slug,
            address: submission.address || null,
            suburb: submission.suburb || null,
            phone: submission.phone || null,
            websiteUrl: submission.websiteUrl || null,
            cuisine: submission.cuisine || null,
            businessType: submission.businessType || null,
            priceRange: submission.priceRange || null,
            status: 'active',
          })
          .returning();
        
        restaurantId = newRestaurant[0].id;
      }

      // Extract deals from description if present (for both new and existing restaurants)
      if (submission.description) {
        const dealExtraction = extractDealsFromDescription(submission.description);
        if (dealExtraction.deals.length > 0) {
          // Get current restaurant
          const currentRestaurant = await db
            .select()
            .from(restaurants)
            .where(eq(restaurants.id, restaurantId))
            .limit(1);

          if (currentRestaurant.length > 0) {
            const existingDeals = (currentRestaurant[0].deals as any[]) || [];
            const existingHappyHour = currentRestaurant[0].happyHour || null;
            const existingWeeklySpecials = (currentRestaurant[0].weeklySpecials as any[]) || [];

            const updates: any = {};

            // Process extracted deals
            for (const deal of dealExtraction.deals) {
              if (deal.dealType === 'happy_hour' && !existingHappyHour) {
                updates.happyHour = {
                  days: deal.days || [],
                  hours: deal.hours || '',
                  description: deal.description,
                };
              } else if (deal.dealType === 'weekly_special') {
                const weeklySpecials = [...existingWeeklySpecials, {
                  day: deal.days?.[0] || '',
                  description: deal.description,
                }];
                updates.weeklySpecials = weeklySpecials;
              } else if (deal.dealType === 'deal') {
                const deals = [...existingDeals, {
                  title: deal.title,
                  description: deal.description,
                  validUntil: deal.validUntil || null,
                  source: 'submission',
                }];
                updates.deals = deals;
              }
            }

            if (Object.keys(updates).length > 0) {
              await db
                .update(restaurants)
                .set(updates)
                .where(eq(restaurants.id, restaurantId));
            }
          }
        }
      }

      // Update submission status
      const updatedSubmission = await db
        .update(restaurantSubmissions)
        .set({
          status: 'approved',
          reviewedBy: reviewedBy || null,
          reviewedAt: new Date(),
          notes: body.notes || null,
        })
        .where(eq(restaurantSubmissions.id, submissionId))
        .returning();

      return NextResponse.json({
        success: true,
        submission: updatedSubmission[0],
        restaurantId: restaurantId,
        message: 'Submission approved and restaurant created/updated',
      });
    } else if (action === 'reject') {
      // Update submission status to rejected
      const updatedSubmission = await db
        .update(restaurantSubmissions)
        .set({
          status: 'rejected',
          reviewedBy: reviewedBy || null,
          reviewedAt: new Date(),
          notes: body.notes || null,
        })
        .where(eq(restaurantSubmissions.id, submissionId))
        .returning();

      return NextResponse.json({
        success: true,
        submission: updatedSubmission[0],
        message: 'Submission rejected',
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use approve, reject, or edit' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error updating submission:', error);
    return NextResponse.json(
      { error: 'Failed to update submission' },
      { status: 500 }
    );
  }
}

// DELETE - Delete submission
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const submissionId = parseInt(params.id);
    
    if (isNaN(submissionId)) {
      return NextResponse.json(
        { error: 'Invalid submission ID' },
        { status: 400 }
      );
    }

    // Delete the submission
    await db
      .delete(restaurantSubmissions)
      .where(eq(restaurantSubmissions.id, submissionId));

    return NextResponse.json({
      success: true,
      message: 'Submission deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting submission:', error);
    return NextResponse.json(
      { error: 'Failed to delete submission' },
      { status: 500 }
    );
  }
}

      // Update submission with edits
      const updatedSubmission = await db
        .update(restaurantSubmissions)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(restaurantSubmissions.id, submissionId))
        .returning();

      return NextResponse.json({
        success: true,
        submission: updatedSubmission[0],
        message: 'Submission updated',
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use approve, reject, or edit' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error updating submission:', error);
    return NextResponse.json(
      { error: 'Failed to update submission' },
      { status: 500 }
    );
  }
}
