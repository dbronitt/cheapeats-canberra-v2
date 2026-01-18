import { db } from '../src/lib/db';
import { sql } from 'drizzle-orm';

async function createContactSubmissionsTable() {
  try {
    console.log('Creating contact_submissions table...');

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contact_submissions (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        query TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    console.log('✅ contact_submissions table created successfully');

    // Verification step
    const result = await db.execute(sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'contact_submissions'
      ORDER BY ordinal_position;
    `);

    if (result && result.length > 0) {
      console.log('✅ Verification: Table exists and is ready to use');
      console.log('📋 Table structure:');
      result.forEach((row: any) => {
        console.log(`   - ${row.column_name}: ${row.data_type} ${row.is_nullable === 'NO' ? 'NOT NULL' : ''} ${row.column_default ? `DEFAULT ${row.column_default}` : ''}`);
      });
    } else {
      console.log('⚠️  Warning: Table creation reported success but verification failed');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating contact_submissions table:', error);
    process.exit(1);
  }
}

createContactSubmissionsTable();
