import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurantSubmissions, restaurants } from '@/src/lib/schema';
import { eq, inArray } from 'drizzle-orm';
import { createSlug } from '@/src/lib/utils';
import { extractDealsFromDescription } from '@/src/lib/submission-utils';

/**
 * Bulk operations on submissions
 * POST /api/admin/submissions/bulk
 * Body: { action: 'approve' | 'reject', ids: number[], notes?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ids, notes } = body;

    if (!action || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request. Provide action and ids array.' },
        { status: 400 }
      );
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Use approve or reject.' },
        { status: 400 }
      );
    }

    // Get all submissions
    const submissions = await db
      .select()
      .from(restaurantSubmissions)
      .where(inArray(restaurantSubmissions.id, ids));

    if (submissions.length === 0) {
      return NextResponse.json(
        { error: 'No submissions found' },
        { status: 404 }
      );
    }

    const results = {
      approved: [] as number[],
      rejected: [] as number[],
      errors: [] as Array<{ id: number; error: string }>,
      restaurantsCreated: [] as number[],
      restaurantsUpdated: [] as number[],
    };

    if (action === 'approve') {
      // Process each submission
      for (const submission of submissions) {
        try {
          if (submission.status !== 'pending') {
            results.errors.push({
              id: submission.id,
              error: `Submission is already ${submission.status}`,
            });
            continue;
          }

          const slug = createSlug(submission.name);
          
          // Check if restaurant already exists
          const existingRestaurant = await db
            .select()
            .from(restaurants)
            .where(eq(restaurants.slug, slug))
            .limit(1);

          let restaurantId: number;

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
            results.restaurantsUpdated.push(restaurantId);
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
            results.restaurantsCreated.push(restaurantId);

            // Extract deals from description if present
            if (submission.description) {
              const dealExtraction = extractDealsFromDescription(submission.description);
              if (dealExtraction.deals.length > 0) {
                // Get current deals
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
                      const newDeal = {
                        title: deal.title,
                        description: deal.description,
                        validUntil: deal.validUntil || null,
                        source: 'submission',
                      };
                      // Check for duplicates before adding
                      const isDuplicate = existingDeals.some((d: any) => 
                        (d.title || '').toLowerCase() === (deal.title || '').toLowerCase() &&
                        (d.description || '').toLowerCase() === (deal.description || '').toLowerCase()
                      );
                      if (!isDuplicate) {
                        updates.deals = [...existingDeals, newDeal];
                      }
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
          }

          // Update submission status
          await db
            .update(restaurantSubmissions)
            .set({
              status: 'approved',
              reviewedBy: 'admin',
              reviewedAt: new Date(),
              notes: notes || null,
            })
            .where(eq(restaurantSubmissions.id, submission.id));

          results.approved.push(submission.id);
        } catch (error) {
          console.error(`Error processing submission ${submission.id}:`, error);
          results.errors.push({
            id: submission.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } else if (action === 'reject') {
      // Bulk reject
      for (const submission of submissions) {
        try {
          if (submission.status !== 'pending') {
            results.errors.push({
              id: submission.id,
              error: `Submission is already ${submission.status}`,
            });
            continue;
          }

          await db
            .update(restaurantSubmissions)
            .set({
              status: 'rejected',
              reviewedBy: 'admin',
              reviewedAt: new Date(),
              notes: notes || null,
            })
            .where(eq(restaurantSubmissions.id, submission.id));

          results.rejected.push(submission.id);
        } catch (error) {
          console.error(`Error rejecting submission ${submission.id}:`, error);
          results.errors.push({
            id: submission.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Processed ${results.approved.length + results.rejected.length} submissions`,
    });
  } catch (error) {
    console.error('Error in bulk operation:', error);
    return NextResponse.json(
      { error: 'Failed to process bulk operation' },
      { status: 500 }
    );
  }
}
