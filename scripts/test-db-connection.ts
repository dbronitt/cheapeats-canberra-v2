// Load environment variables FIRST using dotenv (must use require for synchronous loading)
require('dotenv').config({ path: '.env.local' });

// Now import after env vars are loaded
import { db } from '../src/lib/db';
import { restaurants } from '../src/lib/schema';
import { sql } from 'drizzle-orm';

async function testConnection() {
  console.log('🔍 Testing database connection...\n');

  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set!');
    console.error('Please check your .env.local file');
    process.exit(1);
  }

  // Mask sensitive parts of the connection string for display
  const maskedUrl = process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@');
  console.log(`📋 Database URL: ${maskedUrl}`);
  console.log(`📋 Is Neon database: ${process.env.DATABASE_URL.includes('neon.tech') ? 'Yes' : 'No'}\n`);

  try {
    console.log('⏳ Attempting to connect to database...');
    
    // Test basic connection
    const result = await db.execute(sql`SELECT 1 as test`);
    console.log('✅ Database connection successful!\n');

    // Test if restaurants table exists and is accessible
    console.log('⏳ Testing restaurants table access...');
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(restaurants);
    const total = Number(countResult[0]?.count || 0);
    console.log(`✅ Restaurants table exists and is accessible`);
    console.log(`✅ Found ${total} restaurant(s) in database\n`);

    // Test a simple query
    console.log('⏳ Testing sample query...');
    const sample = await db.select().from(restaurants).limit(1);
    if (sample.length > 0) {
      console.log(`✅ Sample query successful`);
      console.log(`   Sample restaurant: ${sample[0].name} (ID: ${sample[0].id})`);
    } else {
      console.log(`⚠️  No restaurants found in database`);
    }

    console.log('\n✅ All database tests passed!');
    console.log('💡 If you\'re still seeing "page could not be found" errors, the issue might be:');
    console.log('   1. Next.js dev server not running (try: npm run dev)');
    console.log('   2. Wrong port (check if running on http://localhost:3000)');
    console.log('   3. Browser cache (try hard refresh: Ctrl+Shift+R)');
    console.log('   4. Route/page doesn\'t exist (check the URL path)');
    
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Database connection failed!\n');
    console.error('Error details:');
    console.error(`   Message: ${error.message || error}`);
    
    if (error.message?.includes('timeout') || error.message?.includes('ECONNREFUSED')) {
      console.error('\n💡 Possible issues:');
      console.error('   1. Neon database might be paused (free tier databases pause after inactivity)');
      console.error('   2. Database URL might be incorrect');
      console.error('   3. Network/firewall blocking connection');
      console.error('\n🔧 Solutions:');
      console.error('   1. Log into Neon dashboard: https://console.neon.tech');
      console.error('   2. Check if your database is active');
      console.error('   3. If paused, click "Resume" to wake it up');
      console.error('   4. Verify your DATABASE_URL in .env.local matches Neon dashboard');
    } else if (error.message?.includes('authentication') || error.message?.includes('password')) {
      console.error('\n💡 Authentication failed - check your database credentials');
      console.error('   1. Verify DATABASE_URL in .env.local');
      console.error('   2. Check Neon dashboard for updated connection string');
    } else if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
      console.error('\n💡 Database tables might not exist');
      console.error('   Run: npm run db:migrate');
    }
    
    process.exit(1);
  }
}

testConnection();
