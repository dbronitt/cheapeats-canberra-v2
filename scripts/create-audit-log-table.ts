/**
 * Script to create the restaurant_audit_log table
 * Run with: tsx -r dotenv/config scripts/create-audit-log-table.ts dotenv_config_path=.env.local
 */

import { db } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function createAuditLogTable() {
  try {
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
