/**
 * Script to check if audit log table exists and create it if needed
 * Run with: tsx -r dotenv/config scripts/check-audit-log-table.ts dotenv_config_path=.env.local
 */

import { db } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function checkAuditLogTable() {
  try {
    console.log('Checking if restaurant_audit_log table exists...');
    
    // Check if table exists
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'restaurant_audit_log'
      );
    `);
    
    const exists = (result.rows[0] as any)?.exists;
    
    if (exists) {
      console.log('✅ Audit log table exists');
      
      // Check row count
      const countResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM restaurant_audit_log;
      `);
      const count = (countResult.rows[0] as any)?.count;
      console.log(`   Total records: ${count}`);
      
      // Check recent records
      const recentResult = await db.execute(sql`
        SELECT id, restaurant_name, action, created_at 
        FROM restaurant_audit_log 
        ORDER BY created_at DESC 
        LIMIT 5;
      `);
      console.log('   Recent records:', recentResult.rows);
    } else {
      console.log('❌ Audit log table does NOT exist');
      console.log('   Please run the SQL script: scripts/create-audit-log-table.sql');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking audit log table:', error);
    process.exit(1);
  }
}

checkAuditLogTable();
