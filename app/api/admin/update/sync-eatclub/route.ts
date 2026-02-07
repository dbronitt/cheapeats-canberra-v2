import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurants } from '@/src/lib/schema';
import { eq, isNotNull } from 'drizzle-orm';
import { scrapeEatClubVenue, searchEatClubCanberra, matchEatClubToRestaurant, filterEatClubLogos, fetchEatClubCanberraVenueUrls } from '@/src/lib/eatclub';
import { logChange } from '@/src/lib/audit-log';

interface SyncStats {
  total: number;
  processed: number;
  updated: number;
  dealsFound: number;
  imagesFound: number;
  removed: number;
  errors: number;
}

export interface SyncProgressEvent {
  type: 'progress' | 'phase' | 'updated' | 'removed' | 'complete' | 'error';
  message?: string;
  processed?: number;
  total?: number;
  currentRestaurant?: string;
  stats?: SyncStats;
  change?: { restaurantId: number; restaurantName: string; action: 'update' | 'removed' };
  error?: string;
}

async function updateRestaurantWithEatClub(
  restaurantId: number,
  eatClubVenue: any,
  hasDeal: boolean
) {
  // Get current restaurant state for audit log (and for calculating diffs)
  const currentRestaurant = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);

  const previousState = currentRestaurant[0];

  const currentImageUrls = (await db.select({ imageUrls: restaurants.imageUrls })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1))[0]?.imageUrls as string[] | null;

  const existingImages = currentImageUrls || [];
  const newImages = eatClubVenue.imageUrls || [];
  
  const filteredExistingImages = filterEatClubLogos(existingImages);
  const allImages = [...filteredExistingImages];
  for (const img of newImages) {
    if (!allImages.includes(img)) {
      allImages.push(img);
    }
  }
  const finalImages = filterEatClubLogos(allImages);

  const currentDeals = (await db.select({ deals: restaurants.deals })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1))[0]?.deals as Array<any> | null;

  const deals = currentDeals || [];
  if (hasDeal) {
    // Check if EatClub deal already exists
    const eatClubDealIndex = deals.findIndex((d: any) => d.source === 'EatClub' || d.source === 'eatclub');
    
    // Always use standardized format for EatClub deals
    const newDeal = {
      title: 'EatClub Deal Available',
      description: 'Check out our EatClub deals!',
      validUntil: null,
      source: 'EatClub'
    };
    
    if (eatClubDealIndex >= 0) {
      // Update existing EatClub deal
      deals[eatClubDealIndex] = newDeal;
    } else {
      // Add new EatClub deal
      deals.push(newDeal);
    }
  }

  const updated = await db.update(restaurants)
    .set({
      eatClubUrl: eatClubVenue.url,
      imageUrls: finalImages.length > 0 ? finalImages : null,
      deals: deals.length > 0 ? deals : null,
      updatedAt: new Date(),
    })
    .where(eq(restaurants.id, restaurantId))
    .returning();

  const updatedRestaurant = updated[0];

  // Log to Recent Changes (audit log) if there were meaningful field changes.
  if (previousState && updatedRestaurant) {
    const changes: Record<string, { old: any; new: any }> = {};
    const track = (field: keyof typeof previousState) => {
      const oldValue = (previousState as any)[field];
      const newValue = (updatedRestaurant as any)[field];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes[String(field)] = { old: oldValue, new: newValue };
      }
    };

    track('eatClubUrl' as any);
    track('imageUrls' as any);
    track('deals' as any);

    if (Object.keys(changes).length > 0) {
      const logged = await logChange({
        restaurantId: updatedRestaurant.id,
        restaurantName: updatedRestaurant.name,
        action: 'update',
        changedBy: 'eatclub-sync',
        changes,
        previousState,
      });
      if (!logged) {
        console.warn('[AUDIT] Failed to log EatClub sync update for restaurant', updatedRestaurant.id);
      }
    }
  }
}

function encodeEvent(event: SyncProgressEvent): string {
  return JSON.stringify(event) + '\n';
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const stream = url.searchParams.get('stream') === 'true';

  if (!stream) {
    return runSyncAndReturnJson();
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send = async (event: SyncProgressEvent) => {
    try {
      await writer.write(encoder.encode(encodeEvent(event)));
    } catch (e) {
      console.error('[API] Error writing to stream:', e);
    }
  };

  runSyncWithProgress(send)
    .then(async (result) => {
      await send({ type: 'complete', stats: result.stats, message: result.message });
    })
    .catch(async (error) => {
      console.error('[API] EatClub sync error:', error);
      await send({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
        message: 'Sync failed',
      });
    })
    .finally(() => {
      writer.close();
    });

  return new Response(readable, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

async function runSyncAndReturnJson() {
  const stats: SyncStats = { total: 0, processed: 0, updated: 0, dealsFound: 0, imagesFound: 0, removed: 0, errors: 0 };
  const send = async () => {};
  await runSyncWithProgress(send, stats);
  return NextResponse.json({ success: true, message: 'EatClub sync complete', stats });
}

async function runSyncWithProgress(
  send: (e: SyncProgressEvent) => Promise<void>,
  statsOverride?: SyncStats
): Promise<{ stats: SyncStats; message: string }> {
  const stats: SyncStats = statsOverride ?? {
    total: 0,
    processed: 0,
    updated: 0,
    dealsFound: 0,
    imagesFound: 0,
    removed: 0,
    errors: 0,
  };

  console.log('[API] Starting EatClub sync (streaming)...');

  await send({ type: 'phase', message: 'Discovering EatClub venues...' });

  const eatClubVenueUrls = await fetchEatClubCanberraVenueUrls();
  const eatClubVenueUrlSet = new Set(eatClubVenueUrls);
  const eatClubVenues = await searchEatClubCanberra();

  const restaurantsWithEatClub = await db
    .select()
    .from(restaurants)
    .where(isNotNull(restaurants.eatClubUrl))
    .limit(200);

  stats.total = restaurantsWithEatClub.length;
  await send({ type: 'phase', message: `Processing ${stats.total} restaurants with EatClub URLs...`, total: stats.total });

  for (let i = 0; i < restaurantsWithEatClub.length; i++) {
    const restaurant = restaurantsWithEatClub[i];
    stats.processed++;
    await send({
      type: 'progress',
      message: `Processing ${restaurant.name}...`,
      processed: stats.processed,
      total: stats.total,
      currentRestaurant: restaurant.name,
      stats: { ...stats },
    });

    try {
      if (!restaurant.eatClubUrl) continue;

      const eatClubVenue = await scrapeEatClubVenue(restaurant.eatClubUrl);

      if (eatClubVenue) {
        const hasDeal = !!(eatClubVenue.dealTitle || eatClubVenue.dealDescription);
        const hasImages = !!(eatClubVenue.imageUrls && eatClubVenue.imageUrls.length > 0);

        if (hasDeal || hasImages) {
          await updateRestaurantWithEatClub(restaurant.id, eatClubVenue, hasDeal);
          stats.updated++;
          if (hasDeal) stats.dealsFound++;
          if (hasImages) stats.imagesFound++;
          await send({
            type: 'updated',
            message: `Updated: ${restaurant.name}`,
            change: { restaurantId: restaurant.id, restaurantName: restaurant.name, action: 'update' },
            stats: { ...stats },
          });
        }
      }

      if (i < restaurantsWithEatClub.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      stats.errors++;
      console.error(`Error processing ${restaurant.name}:`, error);
    }
  }

  if (eatClubVenues.length > 0) {
    await send({ type: 'phase', message: 'Matching EatClub venues to restaurants without URLs...' });
    const restaurantsWithoutEatClub = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.status, 'active'))
      .limit(500);

    for (const restaurant of restaurantsWithoutEatClub) {
      if (restaurant.eatClubUrl) continue;
      for (const venue of eatClubVenues) {
        if (matchEatClubToRestaurant(venue, restaurant.name, restaurant.suburb || undefined)) {
          const hasDeal = !!(venue.dealTitle || venue.dealDescription);
          await updateRestaurantWithEatClub(restaurant.id, venue, hasDeal);
          if (hasDeal) stats.dealsFound++;
          if (venue.imageUrls?.length) stats.imagesFound++;
          await send({
            type: 'updated',
            message: `Matched: ${restaurant.name}`,
            change: { restaurantId: restaurant.id, restaurantName: restaurant.name, action: 'update' },
            stats: { ...stats },
          });
          break;
        }
      }
    }
  }

  if (eatClubVenueUrls.length > 0) {
    await send({ type: 'phase', message: 'Checking for restaurants no longer on EatClub...' });
    const allRestaurantsWithEatClub = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        suburb: restaurants.suburb,
        eatClubUrl: restaurants.eatClubUrl,
      })
      .from(restaurants)
      .where(isNotNull(restaurants.eatClubUrl));

    for (const restaurant of allRestaurantsWithEatClub) {
      const restaurantUrl = restaurant.eatClubUrl || '';
      const restaurantSlug = restaurantUrl.match(/venue\/([^\/\?]+)/)?.[1]?.toLowerCase();
      const slugMatchInCanberraList =
        !!restaurantSlug &&
        Array.from(eatClubVenueUrlSet).some((url) => url.toLowerCase().includes(`/venue/${restaurantSlug}`));
      const urlMatchInCanberraList = !!restaurantUrl && eatClubVenueUrlSet.has(restaurantUrl.split('?')[0]);
      const found = slugMatchInCanberraList || urlMatchInCanberraList;

      if (!found) {
        let confirmedGone = false;
        try {
          if (restaurantUrl) {
            const resp = await fetch(restaurantUrl, { redirect: 'manual' as any });
            if (resp.status === 404) confirmedGone = true;
          }
        } catch {
          confirmedGone = false;
        }

        if (!confirmedGone) {
          console.warn('[API] Skipping EatClub URL removal (not confirmed gone):', restaurant.name, restaurant.id, restaurantUrl);
          continue;
        }

        const currentRestaurant = await db.select().from(restaurants).where(eq(restaurants.id, restaurant.id)).limit(1);
        const previousState = currentRestaurant[0];

        await db
          .update(restaurants)
          .set({ eatClubUrl: null, updatedAt: new Date() })
          .where(eq(restaurants.id, restaurant.id))
          .returning();

        if (previousState) {
          await logChange({
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
            action: 'update',
            changedBy: 'eatclub-sync',
            changes: { eatClubUrl: { old: previousState.eatClubUrl, new: null } },
            previousState,
          });
        }

        stats.removed++;
        await send({
          type: 'removed',
          message: `Removed EatClub URL: ${restaurant.name}`,
          change: { restaurantId: restaurant.id, restaurantName: restaurant.name, action: 'removed' },
          stats: { ...stats },
        });
      }
    }
  }

  return { stats, message: 'EatClub sync complete' };
}
