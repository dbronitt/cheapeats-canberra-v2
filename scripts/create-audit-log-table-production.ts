/**
 * Script to create the restaurant_audit_log table in production
 * 
 * Usage options:
 * 1. Set DATABASE_URL environment variable: DATABASE_URL="your-production-url" npx tsx scripts/create-audit-log-table-production.ts
 * 2. Or pass as argument: npx tsx scripts/create-audit-log-table-production.ts "your-production-url"
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

async function createAuditLogTable() {
  try {
    // Get DATABASE_URL from command line argument or environment variable
    const connectionString = process.argv[2] || process.env.DATABASE_URL;
    
    if (!connectionString) {
      console.error('❌ DATABASE_URL is required!');
      console.error('\nUsage:');
      console.error('  Option 1: DATABASE_URL="your-url" npx tsx scripts/create-audit-log-table-production.ts');
      console.error('  Option 2: npx tsx scripts/create-audit-log-table-production.ts "your-database-url"');
      process.exit(1);
    }

    console.log('Connecting to database...');
    console.log('Database:', connectionString.replace(/:[^:@]+@/, ':****@')); // Hide password
    
    // Configure SSL if needed
    const sslConfig: any = {};
    if (connectionString.includes('sslmode=require') || connectionString.includes('neon.tech') || connectionString.includes('vercel-storage.com')) {
      sslConfig.ssl = { rejectUnauthorized: false };
    }

    const client = postgres(connectionString, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      ...sslConfig,
    });

    const db = drizzle(client);

    console.log('Creating restaurant_audit_log table...');
    
    // Create the table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS restaurant_audit_log (
        id SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
        restaurant_name VARCHAR(255),
        action VARCHAR(50) NOT NULL,
        changed_by VARCHAR(255),
        changes JSONB NOT NULL,
        previous_state JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    console.log('✅ Table created successfully');
    
    // Create indexes
    console.log('Creating indexes...');
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_audit_log_restaurant_id ON restaurant_audit_log(restaurant_id);
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON restaurant_audit_log(created_at DESC);
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_audit_log_action ON restaurant_audit_log(action);
    `);
    
    console.log('✅ Indexes created successfully');
    
    // Verify the table exists
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'restaurant_audit_log'
      );
    `);
    
    const exists = (result as any)?.[0]?.exists;
    
    if (exists) {
      console.log('✅ Verification: Table exists and is ready to use');
    } else {
      console.log('⚠️  Warning: Table creation reported success but verification failed');
    }
    
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating audit log table:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    process.exit(1);
  }
}

createAuditLogTable();
