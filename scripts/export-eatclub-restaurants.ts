// Load environment variables FIRST using dotenv
require('dotenv').config({ path: '.env.local' });

import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq, isNotNull, and } from 'drizzle-orm';
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
  return arr.map(item => escapeCsvField(item)).join('; ');
}

async function main() {
  console.log('📊 Exporting EatClub restaurants to CSV...\n');

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
    // Get all restaurants with EatClub URLs
    console.log('📋 Finding restaurants with EatClub URLs...');
    const eatclubRestaurants = await db
      .select()
      .from(restaurants)
      .where(
        and(
          eq(restaurants.status, 'active'),
          isNotNull(restaurants.eatClubUrl)
        )
      )
      .limit(5000);

    stats.total = eatclubRestaurants.length;
    console.log(`   Found ${stats.total} restaurants with EatClub URLs\n`);

    if (stats.total === 0) {
      console.log('⚠️  No restaurants with EatClub URLs found.');
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
      'EatClub Slug',
      'Happy Hour',
      'Weekly Specials',
      'Deals',
      'First Table URL',
      'Price Range',
      'Image URLs',
      'Opening Hours',
      'Latitude',
      'Longitude',
      'Created At',
      'Updated At',
    ];
    
    csvRows.push(headers.map(h => escapeCsvField(h)).join(','));

    // Add restaurant data
    for (const restaurant of eatclubRestaurants) {
      try {
        const row = [
          restaurant.id,
          restaurant.name,
          restaurant.suburb || '',
          restaurant.address || '',
          restaurant.cuisine || '',
          restaurant.phone || '',
          restaurant.website || '',
          restaurant.eatClubUrl || '',
          restaurant.eatClubSlug || '',
          restaurant.happyHour || '',
          arrayToCsvString(restaurant.weeklySpecials as string[] | null),
          arrayToCsvString(restaurant.deals as string[] | null),
          restaurant.firstTableUrl || '',
          restaurant.priceRange || '',
          arrayToCsvString(restaurant.imageUrls as string[] | null),
          JSON.stringify(restaurant.openingHours || {}),
          restaurant.latitude || '',
          restaurant.longitude || '',
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
    const filename = `eatclub-restaurants-${timestamp}.csv`;
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

