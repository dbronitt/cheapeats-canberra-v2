// Load environment variables FIRST using dotenv (must use require for synchronous loading)
require('dotenv').config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';

interface Restaurant {
  id: string;
  name: string;
  deals: string;
  [key: string]: string;
}

/**
 * Simple CSV parser
 */
function parseCSV(csvContent: string): Restaurant[] {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const restaurants: Restaurant[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        if (inQuotes && line[j + 1] === '"') {
          current += '"';
          j++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current); // Add last value

    const restaurant: any = {};
    headers.forEach((header, index) => {
      restaurant[header] = values[index] || '';
    });
    restaurants.push(restaurant as Restaurant);
  }

  return restaurants;
}

/**
 * Check if a deal string has formatting issues
 */
function hasDealFormattingIssues(dealsStr: string): boolean {
  if (!dealsStr || dealsStr.trim() === '' || dealsStr === '[]') {
    return false;
  }

  try {
    const deals = JSON.parse(dealsStr);
    if (!Array.isArray(deals)) {
      return true;
    }

    for (const deal of deals) {
      // Check for malformed titles/descriptions
      const title = deal.title || '';
      const description = deal.description || '';

      // Check for concatenated day abbreviations without spaces (e.g., "Today30% Offfri30% Off")
      // This pattern looks for lowercase day abbreviations followed immediately by numbers/percentages
      const concatenatedDayPattern = /(today|fri|sat|sun|mon|tue|wed|thu|none)(\d+%|none)/gi;
      if (concatenatedDayPattern.test(title) || concatenatedDayPattern.test(description)) {
        return true;
      }

      // Check for extremely long titles/descriptions that look concatenated (over 80 chars with day abbreviations)
      if ((title.length > 80 || description.length > 80) && 
          /(today|fri|sat|sun|mon|tue|wed|thu)(\d+%|none)/gi.test(title + description)) {
        return true;
      }

      // Check for patterns like "Today30% Offfri30% Offsat30% Off..." (no spaces between day abbreviations)
      if (/today\d+%\s*off(fri|sat|sun|mon|tue|wed|thu)\d+%/gi.test(title) ||
          /today\d+%\s*off(fri|sat|sun|mon|tue|wed|thu)\d+%/gi.test(description)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    // If JSON parsing fails, it's a formatting issue
    return true;
  }
}

/**
 * Get details about formatting issues
 */
function getDealIssueDetails(dealsStr: string): string[] {
  const issues: string[] = [];

  if (!dealsStr || dealsStr.trim() === '' || dealsStr === '[]') {
    return issues;
  }

  try {
    const deals = JSON.parse(dealsStr);
    if (!Array.isArray(deals)) {
      issues.push('Deals is not an array');
      return issues;
    }

    for (const deal of deals) {
      const title = deal.title || '';
      const description = deal.description || '';

      // Check for concatenated day abbreviations (e.g., "Today30% Offfri30% Off")
      const concatenatedDayPattern = /(today|fri|sat|sun|mon|tue|wed|thu|none)(\d+%|none)/gi;
      if (concatenatedDayPattern.test(title)) {
        issues.push(`Title has concatenated day abbreviations: "${title.substring(0, 100)}"`);
      }

      if (concatenatedDayPattern.test(description)) {
        issues.push(`Description has concatenated day abbreviations: "${description.substring(0, 100)}"`);
      }

      // Check for patterns like "Today30% Offfri30% Offsat30% Off..." (no spaces between day abbreviations)
      if (/today\d+%\s*off(fri|sat|sun|mon|tue|wed|thu)\d+%/gi.test(title)) {
        issues.push(`Title has malformed EatClub deal format: "${title.substring(0, 100)}"`);
      }

      if (/today\d+%\s*off(fri|sat|sun|mon|tue|wed|thu)\d+%/gi.test(description)) {
        issues.push(`Description has malformed EatClub deal format: "${description.substring(0, 100)}"`);
      }

      // Check for extremely long malformed strings
      if ((title.length > 80 || description.length > 80) && 
          /(today|fri|sat|sun|mon|tue|wed|thu)(\d+%|none)/gi.test(title + description)) {
        issues.push(`Title/Description is extremely long and appears concatenated (title: ${title.length} chars, desc: ${description.length} chars)`);
      }
    }
  } catch (error) {
    issues.push(`JSON parsing error: ${error}`);
  }

  return issues;
}

/**
 * Main analysis function
 */
async function analyzeDealIssues() {
  console.log('🔍 Analyzing Deal Formatting Issues');
  console.log('====================================\n');

  // Import database connection
  const { db } = await import('../src/lib/db');
  const { restaurants } = await import('../src/lib/schema/restaurants');
  const { eq } = await import('drizzle-orm');

  console.log(`📂 Reading from database...\n`);

  // Get active restaurants from database
  const dbRecords = await db.select({
    id: restaurants.id,
    name: restaurants.name,
    deals: restaurants.deals,
  }).from(restaurants).where(eq(restaurants.status, 'active'));

  const records: Restaurant[] = dbRecords.map(r => ({
    id: String(r.id),
    name: r.name,
    deals: r.deals ? JSON.stringify(r.deals) : '[]',
  }));

  console.log(`📊 Total restaurants: ${records.length}\n`);

  const restaurantsWithIssues: Array<{
    id: string;
    name: string;
    deals: string;
    issues: string[];
  }> = [];

  for (const restaurant of records) {
    const dealsStr = restaurant.deals || '';
    if (hasDealFormattingIssues(dealsStr)) {
      const issues = getDealIssueDetails(dealsStr);
      restaurantsWithIssues.push({
        id: restaurant.id,
        name: restaurant.name,
        deals: dealsStr,
        issues,
      });
    }
  }

  console.log(`⚠️  Restaurants with deal formatting issues: ${restaurantsWithIssues.length}\n`);

  if (restaurantsWithIssues.length > 0) {
    console.log('📋 Detailed Issues:\n');
    console.log('='.repeat(80));

    for (const restaurant of restaurantsWithIssues) {
      console.log(`\n🔴 Restaurant ID: ${restaurant.id}`);
      console.log(`   Name: ${restaurant.name}`);
      console.log(`   Issues:`);
      restaurant.issues.forEach(issue => {
        console.log(`     - ${issue}`);
      });
      
      // Show the deals JSON (truncated if too long)
      const dealsPreview = restaurant.deals.length > 200 
        ? restaurant.deals.substring(0, 200) + '...'
        : restaurant.deals;
      console.log(`   Deals JSON: ${dealsPreview}`);
      console.log('-'.repeat(80));
    }

    // Create summary report
    const reportPath = path.join(process.cwd(), 'backups', 'backup-2026-01-16T11-24-13', 'deal-formatting-issues.json');
    const report = {
      timestamp: new Date().toISOString(),
      totalRestaurants: records.length,
      restaurantsWithIssues: restaurantsWithIssues.length,
      restaurants: restaurantsWithIssues.map(r => ({
        id: r.id,
        name: r.name,
        issues: r.issues,
        deals: r.deals,
      })),
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  } else {
    console.log('✅ No deal formatting issues found!');
  }

  process.exit(0);
}

// Run the analysis
analyzeDealIssues();
