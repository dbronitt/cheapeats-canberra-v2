// Load environment variables FIRST using dotenv (must use require for synchronous loading)
require('dotenv').config({ path: '.env.local' });

import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema/restaurants';
import { eq } from 'drizzle-orm';

const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const DAYS_LOWER = DAYS_FULL.map(d => d.toLowerCase());

/** Multi-day patterns: exclude deals that reference a range or multiple days */
const MULTI_DAY_PATTERNS = [
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*( to |-|–|—|and|,|&)\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
  /\b(mon|tue|wed|thu|fri|sat|sun)\s*[-–—]\s*(mon|tue|wed|thu|fri|sat|sun)\b/i,
  /\bthrough\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+through\b/i,
  /\bweekdays?\b/i,
  /\bweekend\b/i,
];

function isMultiDay(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  return MULTI_DAY_PATTERNS.some(p => p.test(t));
}

/**
 * Detect if a deal title/description refers to a single day of the week as a weekly special.
 * Returns the matched day (capitalized) or null. Only returns a day if exactly ONE day is mentioned.
 */
function extractSingleDayFromDeal(deal: {
  title?: string | null;
  description?: string | null;
}): string | null {
  const title = (deal.title || '').trim();
  const desc = (deal.description || '').trim();
  const combined = `${title} ${desc}`.trim();

  if (!combined) return null;
  if (isMultiDay(combined)) return null;

  const lower = combined.toLowerCase();
  const found: string[] = [];

  for (let i = 0; i < DAYS_FULL.length; i++) {
    const dayLower = DAYS_LOWER[i];
    const re = new RegExp(`\\b${dayLower}\\b`, 'gi');
    const matches = lower.match(re);
    if (matches && matches.length > 0) found.push(DAYS_FULL[i]);
  }

  if (found.length !== 1) return null;
  return found[0];
}

function isEatClubOrFirstTable(deal: any): boolean {
  if (!deal || typeof deal !== 'object') return false;
  const t = (deal.title || '').toLowerCase();
  const s = (deal.source || '').toLowerCase();
  if (t.includes('eatclub') || s === 'eatclub' || s === 'eat club') return true;
  if (t.includes('first table') || s === 'firsttable' || s === 'first_table' || s === 'first table') return true;
  return false;
}

/**
 * Build weekly special description from deal.
 * Prefer deal.description; otherwise strip day from title and use that.
 */
function buildWeeklySpecialDescription(
  deal: { title?: string | null; description?: string | null },
  day: string
): string {
  const title = (deal.title || '').trim();
  const desc = (deal.description || '').trim();

  if (desc && desc.length > 0) return desc;

  const dayRe = new RegExp(`^\\s*${day}\\s+`, 'i');
  let trimmed = title.replace(dayRe, '').trim();
  trimmed = trimmed.replace(/\s+special\s*$/i, '').trim();
  return trimmed || title;
}

interface MoveResult {
  restaurantId: number;
  restaurantName: string;
  moved: Array<{ day: string; description: string; formerTitle: string }>;
  remainingDeals: any[];
  newWeeklySpecials: Array<{ day: string; description: string }>;
}

async function run(dryRun: boolean) {
  console.log('[DEBUG] move-single-day-deals-to-weekly: starting');
  console.log('[DEBUG] dryRun:', dryRun);
  console.log('');

  const rows = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      deals: restaurants.deals,
      weeklySpecials: restaurants.weeklySpecials,
    })
    .from(restaurants);

  console.log(`[DEBUG] Loaded ${rows.length} restaurants from DB`);

  const results: MoveResult[] = [];
  let totalMoved = 0;

  for (const r of rows) {
    const deals = (r.deals as any[] | null) ?? [];
    const weeklySpecials = (r.weeklySpecials as Array<{ day: string; description: string }> | null) ?? [];

    const toMove: Array<{ index: number; day: string; description: string; formerTitle: string }> = [];
    const remainingDeals: any[] = [];

    for (let i = 0; i < deals.length; i++) {
      const d = deals[i];
      if (isEatClubOrFirstTable(d)) {
        remainingDeals.push(d);
        continue;
      }
      const day = extractSingleDayFromDeal(d);
      if (!day) {
        remainingDeals.push(d);
        continue;
      }
      const description = buildWeeklySpecialDescription(d, day);
      toMove.push({
        index: i,
        day,
        description,
        formerTitle: (d.title || d.description || '').slice(0, 80),
      });
    }

    if (toMove.length === 0) continue;

    const seenKey = (day: string, desc: string) =>
      `${day.toLowerCase()}\n${desc.trim().toLowerCase()}`;
    const added = new Set<string>();

    const newWeeklySpecials: Array<{ day: string; description: string }> = [];
    for (const w of weeklySpecials) {
      if (w && typeof w === 'object' && w.day) {
        const d = String(w.day);
        const desc = String(w.description || '').trim() || '';
        newWeeklySpecials.push({ day: d, description: desc });
        added.add(seenKey(d, desc));
      }
    }
    for (const m of toMove) {
      const k = seenKey(m.day, m.description);
      if (added.has(k)) continue;
      added.add(k);
      newWeeklySpecials.push({ day: m.day, description: m.description });
    }

    const uniqueMoved = toMove.filter((m, i, arr) =>
      arr.findIndex(x => x.day === m.day && x.description === m.description) === i
    );
    totalMoved += toMove.length;
    results.push({
      restaurantId: r.id,
      restaurantName: r.name,
      moved: uniqueMoved.map(m => ({
        day: m.day,
        description: m.description,
        formerTitle: m.formerTitle,
      })),
      remainingDeals,
      newWeeklySpecials,
    });
  }

  console.log(`[DEBUG] Restaurants with moves: ${results.length}`);
  console.log(`[DEBUG] Total deals to move: ${totalMoved}`);
  console.log('');

  for (const res of results) {
    console.log(`Restaurant ID ${res.restaurantId}: ${res.restaurantName}`);
    for (const m of res.moved) {
      console.log(`  -> Move to weekly: ${m.day} | "${m.description.slice(0, 60)}${m.description.length > 60 ? '...' : ''}" (from: "${m.formerTitle}")`);
    }
    console.log(`  Remaining deals: ${res.remainingDeals.length}`);
    console.log('');
  }

  if (!dryRun && results.length > 0) {
    console.log('[DEBUG] Applying updates to DB...');
    for (const res of results) {
      await db
        .update(restaurants)
        .set({
          deals: res.remainingDeals.length > 0 ? res.remainingDeals : null,
          weeklySpecials: res.newWeeklySpecials.length > 0 ? res.newWeeklySpecials : null,
          updatedAt: new Date(),
        })
        .where(eq(restaurants.id, res.restaurantId));
      console.log(`[DEBUG] Updated restaurant ID ${res.restaurantId}`);
    }
    console.log('[DEBUG] All updates applied.');
  } else if (dryRun && results.length > 0) {
    console.log('[DRY RUN] No DB changes made. Re-run with --apply to apply.');
  }

  console.log('');
  console.log('Done.');
}

const dryRun = !process.argv.includes('--apply');
run(dryRun)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[DEBUG] Script error:', e);
    process.exit(1);
  });
