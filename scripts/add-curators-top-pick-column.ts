/**
 * Script to add the curators_top_pick column to the restaurants table
 * Run with: tsx -r dotenv/config scripts/add-curators-top-pick-column.ts dotenv_config_path=.env.local
 */

import { db } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function addCuratorsTopPickColumn() {
  try {
    console.log('Adding curators_top_pick column to restaurants table...');
    
    // Check if column already exists
    const checkResult = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'restaurants' 
      AND column_name = 'curators_top_pick';
    `);
    
    const columnExists = Array.isArray(checkResult) && checkResult.length > 0;
    
    if (columnExists) {
      console.log('⚠️  Column curators_top_pick already exists. Skipping creation.');
      process.exit(0);
      return;
    }
    
    // Add the column
    await db.execute(sql`
      ALTER TABLE restaurants 
      ADD COLUMN curators_top_pick VARCHAR(10) DEFAULT 'false';
    `);
    
    console.log('✅ Column curators_top_pick added successfully');
    
    // Verify the column exists
    const verifyResult = await db.execute(sql`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'restaurants' 
      AND column_name = 'curators_top_pick';
    `);
    
    const exists = Array.isArray(verifyResult) && verifyResult.length > 0;
    
    if (exists) {
      console.log('✅ Verification: Column exists and is ready to use');
      console.log('📋 Column details:', verifyResult);
    } else {
      console.log('⚠️  Warning: Column creation reported success but verification failed');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error adding curators_top_pick column:', error);
    process.exit(1);
  }
}

addCuratorsTopPickColumn();
