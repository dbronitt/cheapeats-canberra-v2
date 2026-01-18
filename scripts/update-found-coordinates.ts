// Load environment variables FIRST using dotenv (must use require for synchronous loading)
require('dotenv').config({ path: '.env.local' });

import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

interface FoundData {
  restaurantName: string;
  id: string;
  latitude?: string;
  longitude?: string;
  openingHours?: Record<string, string>;
  source?: string;
  notes?: string;
}

interface SearchResults {
  found: FoundData[];
  notFound: string[];
  errors: Array<{ restaurantName: string; error: string }>;
}

/**
 * Update database with found coordinates
 */
async function updateFoundCoordinates(jsonFilePath: string): Promise<void> {
  console.log('🔄 Updating Database with Found Coordinates');
  console.log('==========================================\n');
  
  if (!fs.existsSync(jsonFilePath)) {
    console.error(`❌ JSON file not found: ${jsonFilePath}`);
    process.exit(1);
  }
  
  const jsonContent = fs.readFileSync(jsonFilePath, 'utf-8');
  const results: SearchResults = JSON.parse(jsonContent);
  
  console.log(`📋 Loaded ${results.found.length} restaurants with found data\n`);
  
  const updateStats = {
    total: results.found.length,
    updated: 0,
    notFound: 0,
    errors: 0,
  };
  
  for (const found of results.found) {
    try {
      const restaurantId = parseInt(found.id, 10);
      
      if (isNaN(restaurantId)) {
        console.log(`   ⚠️  Invalid ID for ${found.restaurantName}: ${found.id}`);
        updateStats.notFound++;
        continue;
      }
      
      console.log(`\n[${updateStats.updated + updateStats.notFound + updateStats.errors + 1}/${updateStats.total}] Processing: ${found.restaurantName} (ID: ${restaurantId})`);
      
      // Check if restaurant exists
      const existing = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);
      
      if (existing.length === 0) {
        console.log(`   ⚠️  Restaurant not found in database with ID: ${restaurantId}`);
        updateStats.notFound++;
        continue;
      }
      
      const restaurant = existing[0];
      const updates: any = {};
      
      // Update latitude if missing and found
      if (found.latitude && (!restaurant.latitude || restaurant.latitude === null)) {
        updates.latitude = found.latitude;
        console.log(`   ✅ Adding latitude: ${found.latitude}`);
      } else if (found.latitude) {
        console.log(`   ⏭️  Latitude already exists: ${restaurant.latitude}`);
      }
      
      // Update longitude if missing and found
      if (found.longitude && (!restaurant.longitude || restaurant.longitude === null)) {
        updates.longitude = found.longitude;
        console.log(`   ✅ Adding longitude: ${found.longitude}`);
      } else if (found.longitude) {
        console.log(`   ⏭️  Longitude already exists: ${restaurant.longitude}`);
      }
      
      // Update opening hours if missing and found
      if (found.openingHours && Object.keys(found.openingHours).length > 0) {
        if (!restaurant.openingHours || restaurant.openingHours === null) {
          updates.openingHours = found.openingHours;
          console.log(`   ✅ Adding opening hours`);
        } else {
          console.log(`   ⏭️  Opening hours already exist`);
        }
      }
      
      // Only update if we have changes
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        
        await db
          .update(restaurants)
          .set(updates)
          .where(eq(restaurants.id, restaurantId));
        
        console.log(`   ✅ Updated ${restaurant.name}`);
        updateStats.updated++;
      } else {
        console.log(`   ⏭️  No updates needed (all data already exists)`);
        updateStats.notFound++;
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Unknown error';
      console.error(`   ❌ Error updating ${found.restaurantName}: ${errorMsg}`);
      updateStats.errors++;
    }
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Update Summary');
  console.log('='.repeat(60));
  console.log(`Total restaurants in found data: ${updateStats.total}`);
  console.log(`✅ Successfully updated: ${updateStats.updated}`);
  console.log(`⏭️  Skipped (already exists or not found): ${updateStats.notFound}`);
  console.log(`❌ Errors: ${updateStats.errors}`);
  console.log('='.repeat(60));
}

// Main execution
// Parse command line arguments - skip dotenv_config_path and .env.local
const allArgs = process.argv.slice(2);
const jsonFilePath = allArgs.find(arg => !arg.includes('dotenv_config_path') && !arg.includes('.env.local') && (arg.endsWith('.json') || arg.includes('found-data'))) 
  || path.join(process.cwd(), 'backups', 'backup-2026-01-18T01-06-53', 'found-data.json');

console.log(`📁 JSON File: ${jsonFilePath}\n`);

updateFoundCoordinates(jsonFilePath)
  .then(() => {
    console.log('\n✅ Update completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Update failed:', error);
    process.exit(1);
  });
