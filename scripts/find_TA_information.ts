/**
 * Find TripAdvisor information (opening hours, URL, address) via DuckDuckGo.
 *
 * 1. Finds active restaurants with unknown opening hours.
 * 2. Searches DuckDuckGo for "{name} {suburb} Canberra" (no TripAdvisor in query).
 * 3. Resolves first TripAdvisor Restaurant_Review URL from DDG (does not open tripadvisor.com).
 * 4. Extracts hours and address from DDG knowledge panel; clicks to expand hours if needed.
 * 5. Writes id, name, openingHoursJson, taUrl, taAddress to ta_information.csv.
 *
 * Usage:
 *   npm run find:ta
 *   npm run find:ta -- --limit 5
 *   npm run find:ta -- --show   (visible browser, 1 search, ta-screenshot.png + ta-visible.txt)
 */
require('dotenv').config({ path: '.env.local' });

import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Page } from 'puppeteer';
import * as cheerio from 'cheerio';

puppeteer.use(StealthPlugin());

const SHOW = process.argv.includes('--show');

const DAY_ABBREV_TO_KEY: Record<string, string> = {
  Mon: 'monday',
  Tue: 'tuesday',
  Wed: 'wednesday',
  Thu: 'thursday',
  Fri: 'friday',
  Sat: 'saturday',
  Sun: 'sunday',
};
const DAY_FULL_TO_KEY: Record<string, string> = {
  Monday: 'monday',
  Tuesday: 'tuesday',
  Wednesday: 'wednesday',
  Thursday: 'thursday',
  Friday: 'friday',
  Saturday: 'saturday',
  Sunday: 'sunday',
};

function hasUnknownHours(oh: unknown): boolean {
  if (oh == null) return true;
  if (typeof oh !== 'object') return true;
  const o = oh as Record<string, string>;
  const keys = Object.keys(o);
  if (keys.length === 0) return true;
  return keys.every(k => !o[k] || String(o[k]).trim() === '');
}

/**
 * Normalize hours string to consistent format: "9:00 AM - 5:00 PM"
 */
function normalizeHoursFormat(hours: string): string {
  if (/^closed$/i.test(hours.trim())) return 'CLOSED';
  
  // Split multiple ranges (e.g., "11:30 AM–2:30 PM & 5–9 PM")
  const ranges = hours.split(/\s*[,&]\s*/).map(r => r.trim()).filter(Boolean);
  const normalizedRanges: string[] = [];
  
  for (const range of ranges) {
    // Match time patterns: "11 – 12 AM", "9 AM–5 PM", "11:30 AM–9 PM", "11–12 AM", etc.
    // Pattern: start (with optional :MM and AM/PM) - end (with optional :MM and AM/PM)
    const timePattern = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*[–\-—]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i;
    const match = range.match(timePattern);
    
    if (match) {
      let [, startH, startM = '00', startPeriod, endH, endM = '00', endPeriod] = match;
      
      // Normalize hours (1-12)
      let startHour = parseInt(startH, 10);
      let endHour = parseInt(endH, 10);
      
      // If no period specified for start, infer from context
      if (!startPeriod && endPeriod) {
        const endP = endPeriod.toUpperCase();
        // If end is AM and start > end, start is likely PM (e.g., "11 – 12 AM" → "11 PM - 12 AM")
        // But if start is 12, it's likely "12 AM" (midnight)
        if (endP === 'AM' && startHour > endHour && startHour !== 12) {
          startPeriod = 'PM';
        } else if (endP === 'PM' && startHour === 12) {
          startPeriod = 'AM'; // "12 – 5 PM" → "12 PM - 5 PM" (noon to 5 PM)
        } else {
          startPeriod = endP;
        }
      }
      if (!startPeriod) {
        // Default: assume AM for morning hours (1-11), PM for afternoon (12+)
        startPeriod = startHour >= 12 ? 'PM' : 'AM';
      }
      
      // If no period for end, infer from start
      if (!endPeriod) {
        const startP = startPeriod.toUpperCase();
        // If end < start, likely crossed noon/midnight
        if (endHour < startHour || (endHour === startHour && parseInt(endM) < parseInt(startM))) {
          // If start is AM, end crossing means PM (e.g., "11 AM - 1 PM")
          // If start is PM, end crossing means AM next day (e.g., "11 PM - 1 AM")
          endPeriod = startP === 'AM' ? 'PM' : 'AM';
        } else {
          endPeriod = startP;
        }
      }
      
      // Special case: "11 – 12 AM" likely means "11 AM - 12 PM" (noon)
      if (startPeriod.toUpperCase() === 'AM' && endPeriod.toUpperCase() === 'AM' && 
          startHour >= 11 && endHour === 12) {
        endPeriod = 'PM';
      }
      
      // Ensure 12-hour format
      if (startHour > 12) startHour = startHour % 12 || 12;
      if (endHour > 12) endHour = endHour % 12 || 12;
      
      // Format with leading zeros for hours < 10, ensure minutes are 2 digits
      const startStr = `${startHour}:${startM.padStart(2, '0')} ${startPeriod.toUpperCase()}`;
      const endStr = `${endHour}:${endM.padStart(2, '0')} ${endPeriod.toUpperCase()}`;
      
      normalizedRanges.push(`${startStr} - ${endStr}`);
    } else {
      // If pattern doesn't match, try to preserve as-is but clean up
      const cleaned = range
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned) normalizedRanges.push(cleaned);
    }
  }
  
  return normalizedRanges.length > 0 ? normalizedRanges.join(', ') : hours;
}

/**
 * Parse TripAdvisor-style hours.
 * Handles DDG panel format: "Sat 11–12 AM Sun 11–12 AMMon..." (concatenated, no newlines).
 */
function parseTripAdvisorHours(text: string): Record<string, string> | null {
  let lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length <= 1 && text.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:\s|$)/gi)) {
    const split = text
      .replace(/([a-zA-Z0-9])(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g, '$1\n$2')
      .replace(/\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g, '\n$1');
    lines = split.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  }

  const result: Record<string, string> = {};
  const abbrevPattern = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(.+)$/im;
  const fullPattern = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*:?\s*(.+)$/im;

  for (const line of lines) {
    let key: string | undefined;
    let hours: string;
    let m = line.match(abbrevPattern);
    if (m) {
      key = DAY_ABBREV_TO_KEY[m[1]];
      hours = m[2].trim();
    } else {
      m = line.match(fullPattern);
      if (m) {
        key = DAY_FULL_TO_KEY[m[1]];
        hours = m[2].trim();
      } else continue;
    }
    if (!key) continue;
    if (/^\s*closed\s*$/i.test(hours)) {
      result[key] = 'CLOSED';
      continue;
    }
    hours = hours
      .replace(/\s+(What people say|More on Tripadvisor|Open Map|Popular hours|Was this helpful\?|Only include results|More at Apple Maps).*$/i, '')
      .replace(/\s*&\s*/g, ', ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!hours) continue;
    result[key] = normalizeHoursFormat(hours);
  }

  return Object.keys(result).length === 0 ? null : result;
}

async function extractAddressFromDdgPanel(page: Page): Promise<string | null> {
  try {
    const address = await page.evaluate(() => {
      const bodyText = document.body?.innerText || '';
      const addressAfterLabel = bodyText.match(/Address\s*\n\s*([^\n]+)/i);
      if (addressAfterLabel) {
        const raw = addressAfterLabel[1].trim();
        if (/^\d+/.test(raw) && /\d{4}$/.test(raw.trim())) return raw;
      }
      const auAddress = bodyText.match(/(\d+\s+[A-Za-z0-9\s]+(?:St|Street|Rd|Road|Ave|Avenue|Dr|Drive|Way|Pl|Place|Ct|Court|Blvd|Boulevard|Ln|Lane)[^,\n]*(?:,\s*[^,\n]+)*,\s*(?:AU|ACT|NSW|VIC|QLD|SA|WA|NT|TAS)\s*\d{4}(?:\s*,\s*Australia)?)/i);
      return auAddress ? auAddress[1].trim() : null;
    });
    if (address) console.log(`   [DEBUG] Extracted address: ${address}`);
    return address;
  } catch (e) {
    console.log(`   [DEBUG] Error extracting address: ${e}`);
    return null;
  }
}

async function extractHoursFromDdgPanel(page: Page): Promise<Record<string, string> | null> {
  try {
    const clicked = await page.evaluate(() => {
      const selectors = [
        'button[class*="hours"]', 'button[class*="Hours"]',
        '[class*="hours"][role="button"]', '[class*="Hours"][role="button"]',
        'a[class*="hours"]', 'a[class*="Hours"]',
        '[class*="hours"][onclick]', '[class*="Hours"][onclick]',
        '[class*="hours"][class*="click"]', '[class*="Hours"][class*="click"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel) as HTMLElement;
        if (el && (el.textContent || '').match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i)) {
          el.click();
          return true;
        }
      }
      const allClickable = document.querySelectorAll('button, [role="button"], a[href="#"], [class*="click"], [onclick], [tabindex="0"]');
      for (const btn of Array.from(allClickable)) {
        const text = btn.textContent || '';
        if (text.match(/(?:Sat|Sun|Mon|Tue|Wed|Thu|Fri|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday)\s+\d+[-\u2013\u2014]\d+\s*(?:AM|PM)/i)) {
          (btn as HTMLElement).click();
          return true;
        }
      }
      const sidebar = document.querySelector('[class*="sidebar"], [class*="Sidebar"], [class*="knowledge"], [class*="Knowledge"]');
      if (sidebar) {
        const clickableInSidebar = sidebar.querySelectorAll('button, [role="button"], a, [class*="click"], [onclick], [tabindex="0"]');
        for (const el of Array.from(clickableInSidebar)) {
          const text = el.textContent || '';
          if (text.match(/(?:Sat|Sun|Mon|Tue|Wed|Thu|Fri|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday)\s+\d+[-\u2013\u2014]\d+\s*(?:AM|PM)/i)) {
            (el as HTMLElement).click();
            return true;
          }
        }
      }
      return false;
    });
    if (clicked) {
      console.log('   [DEBUG] Clicked hours element to expand');
      await new Promise(r => setTimeout(r, 1500));
    }

    const hoursText = await page.evaluate(() => {
      const selectors = [
        '[data-testid="hours"]', '[class*="hours"]', '[class*="Hours"]',
        '[id*="hours"]', '[id*="Hours"]',
        '[class*="opening"]', '[class*="Opening"]', '[data-testid*="opening"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.textContent || '';
          if (text.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i)) return text;
        }
      }
      const sidebar = document.querySelector('[class*="sidebar"], [class*="Sidebar"], [class*="knowledge"], [class*="Knowledge"]');
      if (sidebar) {
        const text = sidebar.textContent || '';
        const hoursMatch = text.match(/(?:Hours?|Opening\s+Hours?)\s*:?\s*([^\n]+(?:\n[^\n]+){0,10})/i);
        if (hoursMatch) return hoursMatch[1];
        const dayMatch = text.match(/((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[^\n]*(?:\n(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[^\n]*){0,6})/i);
        if (dayMatch) return dayMatch[1];
      }
      const bodyText = document.body?.textContent || '';
      const hoursMatch = bodyText.match(/(?:Hours?|Opening\s+Hours?)\s*:?\s*([^\n]+(?:\n[^\n]+){0,10})/i);
      return hoursMatch ? hoursMatch[1] : null;
    });
    if (!hoursText) return null;
    console.log(`   [DEBUG] Found hours text in panel: ${hoursText.substring(0, 200)}...`);
    return parseTripAdvisorHours(hoursText);
  } catch (e) {
    console.log(`   [DEBUG] Error extracting hours: ${e}`);
    return null;
  }
}

function extractHoursBlock(htmlOrText: string): string | null {
  const lower = htmlOrText.toLowerCase();
  const hoursIdx = lower.indexOf('hours');
  if (hoursIdx === -1) return null;
  const afterHours = htmlOrText.slice(hoursIdx, hoursIdx + 3000);
  const lines = afterHours.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const dayLines = lines.filter(l =>
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+/i.test(l) || /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*:?\s*/i.test(l)
  );
  return dayLines.length === 0 ? null : dayLines.join('\n');
}

function extractTripAdvisorUrl($: cheerio.CheerioAPI): string | null {
  const links = $('a[href*="tripadvisor"], a[href*="uddg="]').toArray();
  for (const a of links) {
    let href = $(a).attr('href') || '';
    if (/uddg=/.test(href)) {
      const m = href.match(/uddg=([^&]+)/);
      if (m) href = decodeURIComponent(m[1]);
    }
    if (!/Restaurant_Review/i.test(href) || !/tripadvisor\./i.test(href)) continue;
    let url = href;
    if (url.startsWith('//')) url = 'https:' + url;
    if (url.startsWith('/')) url = 'https://www.tripadvisor.com' + url;
    if (!url.startsWith('http')) url = 'https://' + url;
    return url;
  }
  return null;
}

interface FetchResult {
  hours: Record<string, string> | null;
  taUrl: string | null;
  taAddress: string | null;
}

interface ShowOptions {
  screenshotPath: string;
  visiblePath: string;
}

async function fetchTaInfo(
  page: Page,
  searchQuery: string,
  showOptions?: ShowOptions
): Promise<FetchResult> {
  const qEnc = encodeURIComponent(searchQuery).replace(/%20/g, '+');
  const ddgUrl = `https://duckduckgo.com/?q=${qEnc}&ia=web`;
  console.log(`   [DEBUG] DDG: ${ddgUrl}`);

  let taUrl: string | null = null;
  let taAddress: string | null = null;
  try {
    await page.goto(ddgUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    console.log('   [DEBUG] Page loaded, waiting for knowledge panel...');
    await new Promise(r => setTimeout(r, 3000));
    if (showOptions) {
      await page.waitForSelector('a[href*="tripadvisor"]', { timeout: 10000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2000));
    }

    const ddgHtml = await page.content();
    const $ = cheerio.load(ddgHtml);
    const ddgBodyText = $('body').text();
    taUrl = extractTripAdvisorUrl($);
    if (taUrl?.includes('duckduckgo.com/l/')) {
      const m = taUrl.match(/uddg=([^&]+)/);
      if (m) taUrl = decodeURIComponent(m[1]);
    }
    console.log('   [DEBUG] TA URL:', taUrl || '(none)');

    taAddress = await extractAddressFromDdgPanel(page);
    let hours = await extractHoursFromDdgPanel(page);

    if (hours) {
      console.log(`   [DEBUG] Extracted ${Object.keys(hours).length} days from panel`);
      if (showOptions) {
        await page.screenshot({ path: showOptions.screenshotPath, fullPage: true });
        fs.writeFileSync(showOptions.visiblePath, (await page.evaluate(() => document.body?.innerText ?? '')) || '', 'utf-8');
        console.log(`   [SHOW] Saved ${showOptions.screenshotPath}, ${showOptions.visiblePath}`);
      }
      return { hours, taUrl, taAddress };
    }

    if (showOptions) {
      await page.screenshot({ path: showOptions.screenshotPath, fullPage: true });
      fs.writeFileSync(showOptions.visiblePath, (await page.evaluate(() => document.body?.innerText ?? '')) || '', 'utf-8');
      console.log(`   [SHOW] Saved ${showOptions.screenshotPath}, ${showOptions.visiblePath}`);
    }

    const block = extractHoursBlock(ddgBodyText);
    if (block) {
      hours = parseTripAdvisorHours(block);
      if (hours) {
        console.log(`   [DEBUG] Parsed ${Object.keys(hours).length} days from body text`);
        return { hours, taUrl, taAddress };
      }
    }
    console.log('   [DEBUG] No hours found');
    return { hours: null, taUrl, taAddress };
  } catch (e) {
    console.error(`   [DEBUG] Fetch error: ${e}`);
    return { hours: null, taUrl, taAddress };
  }
}

function escapeCsv(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  console.log('Find TripAdvisor information (DDG)\n');

  const outPath = path.join(process.cwd(), 'ta_information.csv');
  fs.writeFileSync(outPath, 'id,name,openingHoursJson,taUrl,taAddress\n', 'utf-8');

  const rows = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      suburb: restaurants.suburb,
      openingHours: restaurants.openingHours,
    })
    .from(restaurants)
    .where(eq(restaurants.status, 'active'));

  let missing = rows.filter(r => hasUnknownHours(r.openingHours));
  const limitIdx = process.argv.indexOf('--limit');
  const limit = limitIdx !== -1 && process.argv[limitIdx + 1] ? parseInt(process.argv[limitIdx + 1], 10) : undefined;
  if (typeof limit === 'number' && limit > 0) missing = missing.slice(0, limit);
  if (SHOW) {
    missing = missing.slice(0, 1);
    console.log('[SHOW] 1 search, screenshot + visible dump.\n');
  }

  console.log(`Active: ${rows.length} | Unknown hours: ${rows.filter(r => hasUnknownHours(r.openingHours)).length} | Processing: ${missing.length}\n`);

  const browser = await puppeteer.launch({
    headless: !SHOW,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ...(SHOW && { slowMo: 80 }),
  });

  let found = 0;
  let notFound = 0;
  let errors = 0;

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });

    for (let i = 0; i < missing.length; i++) {
      const r = missing[i];
      const suburb = (r.suburb || '').trim();
      const query = suburb && suburb.toLowerCase() !== 'canberra' ? `${r.name} ${suburb} Canberra` : `${r.name} Canberra`;
      console.log(`[${i + 1}/${missing.length}] ${r.name} (${query})`);

      const showOpts: ShowOptions | undefined = SHOW
        ? { screenshotPath: path.join(process.cwd(), 'ta-screenshot.png'), visiblePath: path.join(process.cwd(), 'ta-visible.txt') }
        : undefined;

      let result: FetchResult;
      try {
        result = await fetchTaInfo(page, query, showOpts);
      } catch (e) {
        console.error(`   [DEBUG] Error: ${e}`);
        errors++;
        result = { hours: null, taUrl: null, taAddress: null };
      }

      if (result.hours) found++;
      else notFound++;
      console.log(`   [DEBUG] Found: ${found} | Not found: ${notFound} | Errors: ${errors}`);

      const line = [
        r.id,
        escapeCsv(r.name),
        escapeCsv(result.hours ? JSON.stringify(result.hours) : ''),
        escapeCsv(result.taUrl || ''),
        escapeCsv(result.taAddress || ''),
      ].join(',');
      fs.appendFileSync(outPath, line + '\n', 'utf-8');
      console.log(`   [DEBUG] Wrote ${r.id}`);

      await new Promise(r => setTimeout(r, SHOW ? 2000 : 800));
    }
  } finally {
    if (SHOW) {
      console.log('\n[SHOW] Pausing 5s...');
      await new Promise(r => setTimeout(r, 5000));
    }
    await browser.close();
  }

  console.log('\nDone.');
  console.log(`Found: ${found} | Not found: ${notFound} | Errors: ${errors}`);
  console.log(`Output: ${outPath}`);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
