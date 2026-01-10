// Load environment variables FIRST using dotenv
require('dotenv').config({ path: '.env.local' });

import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

interface ExportStats {
  total: number;
  exported: number;
  errors: number;
}

/**
 * Escape CSV field values
 */
function escapeCsvField(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  const str = String(value);
  
  // If contains comma, quote, or newline, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * Convert array to CSV-safe string
 */
function arrayToCsvString(arr: any[] | null): string {
  if (!arr || !Array.isArray(arr)) {
    return '';
  }
  return arr.map(item => {
    if (typeof item === 'object') {
      return JSON.stringify(item);
    }
    return escapeCsvField(item);
  }).join('; ');
}

/**
 * Check if restaurant has any deals
 */
function hasDeals(restaurant: any): boolean {
  const happyHour = restaurant.happyHour;
  const weeklySpecials = restaurant.weeklySpecials;
  const deals = restaurant.deals;
  const eatClubUrl = restaurant.eatClubUrl;
  const firstTableUrl = restaurant.firstTableUrl;
  
  return !!(
    happyHour ||
    (weeklySpecials && Array.isArray(weeklySpecials) && weeklySpecials.length > 0) ||
    (deals && Array.isArray(deals) && deals.length > 0) ||
    eatClubUrl ||
    firstTableUrl
  );
}

async function main() {
  console.log('📊 Exporting main page restaurants to CSV...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set!');
    process.exit(1);
  }

  const stats: ExportStats = {
    total: 0,
    exported: 0,
    errors: 0,
  };

  try {
    // Get all active restaurants (same as main page default filter)
    console.log('📋 Finding active restaurants with deals...');
    const allRestaurants = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.status, 'active'))
      .limit(5000);

    // Filter to only restaurants with deals (default main page behavior)
    const restaurantsWithDeals = allRestaurants.filter(hasDeals);
    
    stats.total = restaurantsWithDeals.length;
    console.log(`   Found ${stats.total} restaurants with deals (matching main page)\n`);

    if (stats.total === 0) {
      console.log('⚠️  No restaurants with deals found.');
      return;
    }

    // Prepare CSV data
    const csvRows: string[] = [];
    
    // CSV Header
    const headers = [
      'ID',
      'Name',
      'Suburb',
      'Address',
      'Cuisine',
      'Phone',
      'Website',
      'EatClub URL',
      'First Table URL',
      'Price Range',
      'Business Type',
      'Happy Hour',
      'Weekly Specials',
      'Deals',
      'Opening Hours',
      'Image URLs',
      'Latitude',
      'Longitude',
      'Overall Rating',
      'Status',
      'Created At',
      'Updated At',
    ];
    
    csvRows.push(headers.map(h => escapeCsvField(h)).join(','));

    // Add restaurant data
    for (const restaurant of restaurantsWithDeals) {
      try {
        const row = [
          restaurant.id,
          restaurant.name,
          restaurant.suburb || '',
          restaurant.address || '',
          restaurant.cuisine || '',
          restaurant.phone || '',
          restaurant.websiteUrl || '',
          restaurant.eatClubUrl || '',
          restaurant.firstTableUrl || '',
          restaurant.priceRange || '',
          restaurant.businessType || '',
          JSON.stringify(restaurant.happyHour || {}),
          JSON.stringify(restaurant.weeklySpecials || []),
          JSON.stringify(restaurant.deals || []),
          JSON.stringify(restaurant.openingHours || {}),
          arrayToCsvString(restaurant.imageUrls as string[] | null),
          restaurant.latitude || '',
          restaurant.longitude || '',
          restaurant.overallRating || '',
          restaurant.status,
          restaurant.createdAt ? new Date(restaurant.createdAt).toISOString() : '',
          restaurant.updatedAt ? new Date(restaurant.updatedAt).toISOString() : '',
        ];
        
        csvRows.push(row.map(field => escapeCsvField(field)).join(','));
        stats.exported++;
      } catch (error) {
        stats.errors++;
        console.error(`   ❌ Error exporting ${restaurant.name} (ID: ${restaurant.id}):`, error);
      }
    }

    // Write to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `main-page-restaurants-${timestamp}.csv`;
    const filepath = path.join(process.cwd(), filename);
    
    fs.writeFileSync(filepath, csvRows.join('\n'), 'utf-8');

    console.log('\n📊 Export Summary:');
    console.log(`   Total restaurants found: ${stats.total}`);
    console.log(`   Successfully exported: ${stats.exported}`);
    console.log(`   Errors: ${stats.errors}`);
    console.log(`\n✅ CSV file saved to: ${filepath}`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
