import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { restaurants } from '@/src/lib/schema';
import { eq } from 'drizzle-orm';
import { searchEatClubCanberra } from '@/src/lib/eatclub';
import { logChange } from '@/src/lib/audit-log';

interface NewRestaurant {
  name: string;
  url: string;
  address?: string;
  suburb?: string;
  cuisine?: string;
  imageUrls?: string[];
  dealTitle?: string;
  dealDescription?: string;
}

interface Stats {
  totalEatClubVenues: number;
  matched: number;
  newRestaurants: number;
  restaurantsUpdated: number;
  errors: number;
}

export interface FindEatClubProgressEvent {
  type: 'phase' | 'progress' | 'updated' | 'new' | 'complete' | 'error';
  message?: string;
  processed?: number;
  total?: number;
  currentVenue?: string;
  stats?: Stats;
  change?: { restaurantId: number; restaurantName: string; action: 'update' | 'new' };
  error?: string;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

async function findMatchingRestaurant(eatClubVenue: any): Promise<number | null> {
  try {
    const allRestaurants = await db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        suburb: restaurants.suburb,
        eatClubUrl: restaurants.eatClubUrl,
      })
      .from(restaurants)
      .where(eq(restaurants.status, 'active'));

    const normalizedEatClubName = normalizeName(eatClubVenue.name);

    for (const restaurant of allRestaurants) {
      const normalizedRestaurantName = normalizeName(restaurant.name);
      
      if (normalizedRestaurantName === normalizedEatClubName) {
        if (!restaurant.suburb || !eatClubVenue.suburb || 
            restaurant.suburb.toLowerCase() === eatClubVenue.suburb.toLowerCase()) {
          return restaurant.id;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error finding matching restaurant:', error);
    return null;
  }
}

async function updateRestaurantWithEatClub(id: number, venue: any) {
  const previousState = (await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1))[0];
  const updated = await db
    .update(restaurants)
    .set({
      eatClubUrl: venue.url,
      updatedAt: new Date(),
    })
    .where(eq(restaurants.id, id))
    .returning();

  const updatedRestaurant = updated[0];
  if (previousState && updatedRestaurant) {
    const changes: Record<string, { old: any; new: any }> = {};
    if (previousState.eatClubUrl !== updatedRestaurant.eatClubUrl) {
      changes.eatClubUrl = { old: previousState.eatClubUrl, new: updatedRestaurant.eatClubUrl };
    }
    if (Object.keys(changes).length > 0) {
      await logChange({
        restaurantId: id,
        restaurantName: updatedRestaurant.name,
        action: 'update',
        changedBy: 'find-eatclub',
        changes,
        previousState,
      });
    }
  }
}

function encodeEvent(event: FindEatClubProgressEvent): string {
  return JSON.stringify(event) + '\n';
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const stream = url.searchParams.get('stream') === 'true';

  if (!stream) {
    return runFindAndReturnJson();
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send = async (event: FindEatClubProgressEvent) => {
    try {
      await writer.write(encoder.encode(encodeEvent(event)));
    } catch (e) {
      console.error('[API] Error writing find-eatclub stream:', e);
    }
  };

  runFindWithProgress(send)
    .then(async (result) => {
      await send({ type: 'complete', stats: result.stats, message: result.message });
    })
    .catch(async (error) => {
      console.error('[API] Find EatClub error:', error);
      await send({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
        message: 'Find failed',
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

async function runFindAndReturnJson() {
  const stats: Stats = { totalEatClubVenues: 0, matched: 0, newRestaurants: 0, restaurantsUpdated: 0, errors: 0 };
  const send = async () => {};
  const result = await runFindWithProgress(send, stats);
  return NextResponse.json({
    success: true,
    message: result.message,
    stats: result.stats,
    newRestaurants: result.newRestaurants,
    restaurantsUpdated: result.restaurantsUpdated,
  });
}

async function runFindWithProgress(
  send: (e: FindEatClubProgressEvent) => Promise<void>,
  statsOverride?: Stats
): Promise<{ stats: Stats; message: string; newRestaurants: NewRestaurant[]; restaurantsUpdated: number }> {
  const stats: Stats = statsOverride ?? {
    totalEatClubVenues: 0,
    matched: 0,
    newRestaurants: 0,
    restaurantsUpdated: 0,
    errors: 0,
  };
  const newRestaurants: NewRestaurant[] = [];
  const restaurantsToUpdate: Array<{ id: number; venue: any; restaurantName: string }> = [];

  console.log('[API] Starting find new EatClub restaurants (streaming)...');

  await send({ type: 'phase', message: 'Discovering EatClub venues...' });

  const eatClubVenues = await searchEatClubCanberra();
  stats.totalEatClubVenues = eatClubVenues.length;

  if (eatClubVenues.length === 0) {
    stats.restaurantsUpdated = 0;
    return { stats, message: 'No venues found on EatClub', newRestaurants, restaurantsUpdated: 0 };
  }

  await send({
    type: 'phase',
    message: `Processing ${eatClubVenues.length} venues...`,
  });

  for (let i = 0; i < eatClubVenues.length; i++) {
    const venue = eatClubVenues[i];
    await send({
      type: 'progress',
      message: `Checking ${venue.name}...`,
      processed: i + 1,
      total: eatClubVenues.length,
      currentVenue: venue.name,
      stats: { ...stats },
    });

    try {
      const matchingId = await findMatchingRestaurant(venue);

      if (matchingId) {
        const existing = await db
          .select({ eatClubUrl: restaurants.eatClubUrl, name: restaurants.name })
          .from(restaurants)
          .where(eq(restaurants.id, matchingId))
          .limit(1);

        if (!existing[0]?.eatClubUrl) {
          restaurantsToUpdate.push({ id: matchingId, venue, restaurantName: existing[0]?.name || venue.name });
        }
        stats.matched++;
      } else {
        newRestaurants.push({
          name: venue.name,
          url: venue.url,
          address: venue.address,
          suburb: venue.suburb,
          cuisine: venue.cuisine,
          imageUrls: venue.imageUrls,
          dealTitle: venue.dealTitle,
          dealDescription: venue.dealDescription,
        });
        stats.newRestaurants++;
        await send({
          type: 'new',
          message: `New: ${venue.name}`,
          change: { restaurantId: 0, restaurantName: venue.name, action: 'new' },
          stats: { ...stats },
        });
      }
    } catch (error) {
      stats.errors++;
      console.error(`Error processing ${venue.name}:`, error);
    }
  }

  await send({ type: 'phase', message: `Updating ${restaurantsToUpdate.length} restaurants with EatClub URLs...` });

  for (const { id, venue, restaurantName } of restaurantsToUpdate) {
    try {
      await updateRestaurantWithEatClub(id, venue);
      stats.restaurantsUpdated++;
      await send({
        type: 'updated',
        message: `Updated: ${restaurantName}`,
        change: { restaurantId: id, restaurantName, action: 'update' },
        stats: { ...stats },
      });
    } catch (error) {
      stats.errors++;
      console.error(`Failed to update restaurant ID ${id}:`, error);
    }
  }
  return {
    stats,
    message: 'Search complete',
    newRestaurants,
    restaurantsUpdated: restaurantsToUpdate.length,
  };
}
