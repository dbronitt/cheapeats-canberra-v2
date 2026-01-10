import { NextResponse } from 'next/server';
import { db } from '@/src/lib/db';
import { sql } from 'drizzle-orm';

/**
 * POST /api/admin/migrate/audit-log
 * One-time migration endpoint to create the audit log table
 * Protected by admin password check
 */
export async function POST(request: Request) {
  try {
    // Simple password protection
    const body = await request.json();
    const { password } = body;

    const correctPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'admin123';
    if (password !== correctPassword) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[MIGRATION] Creating restaurant_audit_log table...');
    
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
    
    console.log('[MIGRATION] Table created successfully');
    
    // Create indexes
    console.log('[MIGRATION] Creating indexes...');
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_audit_log_restaurant_id ON restaurant_audit_log(restaurant_id);
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON restaurant_audit_log(created_at DESC);
    `);
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_audit_log_action ON restaurant_audit_log(action);
    `);
    
    console.log('[MIGRATION] Indexes created successfully');
    
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
      return NextResponse.json({
        success: true,
        message: 'Audit log table created successfully',
        verified: true,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: 'Table creation reported success but verification failed',
        verified: false,
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[MIGRATION] Error creating audit log table:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create audit log table',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
