/**
 * Audit log helper functions
 */

import { db } from './db';
import { restaurantAuditLog } from './schema';
import { sql } from 'drizzle-orm';

/**
 * Check if audit log table exists
 */
export async function checkAuditLogTableExists(): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'restaurant_audit_log'
      );
    `);
    
    const rows = result as any;
    return rows?.[0]?.exists || false;
  } catch (error) {
    console.error('[AUDIT] Error checking table existence:', error);
    return false;
  }
}

/**
 * Log a change to the audit log
 * Returns true if successful, false otherwise
 */
export async function logChange(data: {
  restaurantId: number;
  restaurantName: string;
  action: 'create' | 'update' | 'delete' | 'revert';
  changedBy?: string;
  changes: Record<string, { old: any; new: any }>;
  previousState?: any;
}): Promise<boolean> {
  try {
    // Check if table exists first
    const tableExists = await checkAuditLogTableExists();
    if (!tableExists) {
      console.warn('[AUDIT] Audit log table does not exist. Please run: scripts/create-audit-log-table.sql');
      return false;
    }

    await db.insert(restaurantAuditLog).values({
      restaurantId: data.restaurantId,
      restaurantName: data.restaurantName,
      action: data.action,
      changedBy: data.changedBy || 'admin',
      changes: data.changes,
      previousState: data.previousState || null,
    });

    console.log(`[AUDIT] Successfully logged ${data.action} for restaurant ${data.restaurantId}`);
    return true;
  } catch (error) {
    console.error('[AUDIT] Error logging change:', error);
    if (error instanceof Error) {
      console.error('[AUDIT] Error details:', {
        message: error.message,
        stack: error.stack,
      });
    }
    return false;
  }
}
