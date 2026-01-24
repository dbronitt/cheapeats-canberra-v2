/**
 * Apply ta_information.csv to the database.
 * Updates openingHours and address by restaurant id.
 *
 * Usage:
 *   npm run apply:ta
 *   npm run apply:ta -- path/to/ta_information.csv
 */
require('dotenv').config({ path: '.env.local' });

import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const DAY_KEYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
const MAX_HOURS_LEN = 80;

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/** Split CSV text into rows, respecting quoted newlines. */
function splitCsvRows(raw: string): string[] {
  const rows: string[] = [];
  let row = '';
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    const next = raw[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') {
        row += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        row += c;
      }
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      rows.push(row);
      row = '';
    } else {
      row += c;
    }
  }
  if (row.length) rows.push(row);
  return rows;
}

function parseOpeningHoursJson(raw: string): Record<string, string> | null {
  if (!raw || !raw.trim()) return null;
  let jsonStr = raw.trim();
  if (!jsonStr.startsWith('{') || !jsonStr.endsWith('}')) return null;
  if (!jsonStr.includes('"') && /^\{\s*\w+\s*:/.test(jsonStr)) {
    for (const day of DAY_KEYS) {
      jsonStr = jsonStr.replace(new RegExp(`\\b${day}\\s*:`, 'gi'), `"${day.toLowerCase()}":`);
    }
    jsonStr = jsonStr.replace(/:\s*([^",}\s][^,}]*?)\s*([,}])/g, (_, val, end) => {
      const v = val.trim();
      if (/^(closed|–|-)$/i.test(v)) return `: "CLOSED"${end}`;
      return `: "${v.replace(/"/g, '\\"')}"${end}`;
    });
  }
  try {
    const o = JSON.parse(jsonStr) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return null;
    const out: Record<string, string> = {};
    for (const k of Object.keys(o)) {
      const key = k.toLowerCase();
      if (!DAY_KEYS.has(key)) continue;
      const v = o[k];
      if (typeof v !== 'string') continue;
      const val = v.trim();
      if (!val || val.length > MAX_HOURS_LEN) continue;
      if (/^(closed|–|-)$/i.test(val)) {
        out[key] = 'CLOSED';
        continue;
      }
      if (!/\d/.test(val)) continue;
      out[key] = val;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

function normalizeAddress(s: string): string {
  return s
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidAddress(s: string): boolean {
  if (!s || s.length > 200) return false;
  const junk = /\b(Reviews|Open|Closes|Website|Directions|Call|Map|Address)\b/i;
  if (junk.test(s)) return false;
  return /(?:AU|ACT|NSW|VIC|QLD|SA|WA|NT|TAS)\s*\d{4}/.test(s) || (/\d{4}$/.test(s) && s.length >= 10);
}

async function main() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('-'));
  const csvPath = args.find(a => a.endsWith('.csv')) || path.join(process.cwd(), 'ta_information.csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`);
    process.exit(1);
  }

  console.log('Apply TA information to database\n');
  console.log(`CSV: ${csvPath}\n`);

  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = splitCsvRows(raw).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    console.log('No data rows.');
    process.exit(0);
  }

  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine);
  const idIdx = headers.findIndex(h => h.toLowerCase() === 'id');
  const nameIdx = headers.findIndex(h => h.toLowerCase() === 'name');
  const hoursIdx = headers.findIndex(h => h.toLowerCase() === 'openinghoursjson');
  const addrIdx = headers.findIndex(h => h.toLowerCase() === 'taaddress');

  if (idIdx === -1) {
    console.error('CSV must have "id" column.');
    process.exit(1);
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const idStr = cols[idIdx]?.trim();
    const name = (cols[nameIdx] ?? cols[1] ?? '').trim();
    const hoursRaw = (hoursIdx >= 0 ? cols[hoursIdx] : '')?.trim() ?? '';
    const taAddr = (addrIdx >= 0 ? cols[addrIdx] : '')?.trim() ?? '';

    const id = idStr ? parseInt(idStr, 10) : NaN;
    if (!idStr || isNaN(id) || id < 1) {
      console.log(`[${i + 1}] Skip: missing/invalid id`);
      skipped++;
      continue;
    }

    try {
      const existing = await db.select().from(restaurants).where(eq(restaurants.id, id)).limit(1);
      if (existing.length === 0) {
        console.log(`[${i + 1}] ${name} (id ${id}): not found`);
        skipped++;
        continue;
      }

      const hours = parseOpeningHoursJson(hoursRaw);
      const normalizedAddr = taAddr ? normalizeAddress(taAddr) : '';
      const address = normalizedAddr && isValidAddress(normalizedAddr) ? normalizedAddr : null;

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (hours) updates.openingHours = hours;
      if (address) updates.address = address;

      if (Object.keys(updates).length <= 1) {
        console.log(`[${i + 1}] ${name} (id ${id}): no valid hours or address to apply`);
        skipped++;
        continue;
      }

      await db.update(restaurants).set(updates as any).where(eq(restaurants.id, id));
      const parts: string[] = [];
      if (hours) parts.push('hours');
      if (address) parts.push('address');
      console.log(`[${i + 1}] ${name} (id ${id}): updated ${parts.join(', ')}`);
      updated++;
    } catch (e) {
      console.error(`[${i + 1}] ${name} (id ${id}): error`, e);
      errors++;
    }
  }

  console.log('\nDone.');
  console.log(`Updated: ${updated} | Skipped: ${skipped} | Errors: ${errors}`);
  process.exit(errors > 0 ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
