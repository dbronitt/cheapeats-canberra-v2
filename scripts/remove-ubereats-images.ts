// Load environment variables FIRST using dotenv
require('dotenv').config({ path: '.env.local' });

import { db } from '../src/lib/db';
import { restaurants, incorrectImages } from '../src/lib/schema';
import { eq } from 'drizzle-orm';

interface CleanupStats {
  total: number;
  processed: number;
  cleaned: number;
  imagesRemoved: number;
  errors: number;
}

/**
 * Check if an image URL is from Uber Eats
 * Uber Eats uses various CloudFront CDN URLs
 */
function isUberEatsImage(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  const lowerUrl = url.toLowerCase();
  
  // Direct Uber Eats domain
  if (lowerUrl.includes('ubereats.com')) {
    return true;
  }
  
  // Common Uber Eats CloudFront CDN patterns
  // Uber Eats uses various CloudFront distributions
  const cloudfrontPatterns = [
    'd1s2w0upjb4we9.cloudfront.net',
    'd1nqx6es26drid.cloudfront.net',
    'd4p17acsd5wyj.cloudfront.net',
    'd3i2yfeaarpyyq.cloudfront.net',
    'd1yg28hrivmbqm.cloudfront.net',
    // Pattern: d{number}.cloudfront.net (Uber Eats uses many)
    /^https?:\/\/d\d+[a-z0-9]+\.cloudfront\.net/i,
  ];
  
  // Check CloudFront URLs - Uber Eats images often have specific patterns
  if (lowerUrl.includes('cloudfront.net')) {
    // Check if it matches known Uber Eats CloudFront patterns
    for (const pattern of cloudfrontPatterns) {
      if (pattern instanceof RegExp) {
        if (pattern.test(lowerUrl)) {
          return true;
        }
      } else if (lowerUrl.includes(pattern)) {
        return true;
      }
    }
    
    // Also check for common Uber Eats image URL structures
    // Uber Eats images often have long hash-like paths
    if (lowerUrl.match(/\/[a-f0-9]{20,}\.(jpg|jpeg|png|webp)/i)) {
      // This looks like a CDN image with hash - likely Uber Eats
      return true;
    }
  }
  
  return false;
}

async function main() {
  console.log('🧹 Starting Uber Eats image cleanup...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set!');
    process.exit(1);
  }

  const stats: CleanupStats = {
    total: 0,
    processed: 0,
    cleaned: 0,
    imagesRemoved: 0,
    errors: 0,
  };

  try {
    // Get all restaurants with images
    console.log('📋 Finding restaurants with images...');
    const allRestaurants = await db
      .select()
      .from(restaurants)
      .where(eq(restaurants.status, 'active'))
      .limit(2000);

    stats.total = allRestaurants.length;
    console.log(`   Found ${stats.total} restaurants to check\n`);

    // Process each restaurant
    for (let i = 0; i < allRestaurants.length; i++) {
      const restaurant = allRestaurants[i];
      stats.processed++;

      try {
        const imageUrls = restaurant.imageUrls as string[] | null;
        
        if (!imageUrls || imageUrls.length === 0) {
          continue;
        }

        // Find Uber Eats images
        const uberEatsImages = imageUrls.filter(url => isUberEatsImage(url));
        const remainingImages = imageUrls.filter(url => !isUberEatsImage(url));

        if (uberEatsImages.length > 0) {
          // Mark Uber Eats images as incorrect
          for (const imageUrl of uberEatsImages) {
            try {
              await db.insert(incorrectImages).values({
                imageUrl,
                restaurantId: restaurant.id.toString(),
                restaurantName: restaurant.name,
                reason: 'Uber Eats image - incorrect',
              }).onConflictDoNothing();
            } catch (e) {
              // Ignore if already exists
            }
          }

          // Update restaurant with filtered images
          await db.update(restaurants)
            .set({
              imageUrls: remainingImages.length > 0 ? remainingImages : null,
              updatedAt: new Date(),
            })
            .where(eq(restaurants.id, restaurant.id));

          stats.cleaned++;
          stats.imagesRemoved += uberEatsImages.length;
          
          console.log(`[${stats.processed}/${stats.total}] ${restaurant.name}: Removed ${uberEatsImages.length} Uber Eats image(s)`);
          uberEatsImages.forEach(url => {
            console.log(`   ❌ Removed: ${url.substring(0, 80)}...`);
          });
        }
      } catch (error) {
        stats.errors++;
        console.error(`   ❌ Error processing ${restaurant.name} (ID: ${restaurant.id}):`, error);
      }
    }

    // Print summary
    console.log('\n📊 Summary:');
    console.log(`   Total restaurants checked: ${stats.total}`);
    console.log(`   Processed: ${stats.processed}`);
    console.log(`   Cleaned: ${stats.cleaned}`);
    console.log(`   Uber Eats images removed: ${stats.imagesRemoved}`);
    console.log(`   Errors: ${stats.errors}`);

    if (stats.cleaned > 0) {
      console.log(`\n✅ Successfully removed Uber Eats images from ${stats.cleaned} restaurant(s)!`);
      console.log(`   Images marked as incorrect to prevent re-adding`);
    } else {
      console.log(`\n✅ No Uber Eats images found in restaurant images.`);
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();

