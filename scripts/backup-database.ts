// Load environment variables FIRST using dotenv (must use require for synchronous loading)
require('dotenv').config({ path: '.env.local' });

import { db } from '../src/lib/db';
import { sql, eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

// Import restaurants schema
import { restaurants } from '../src/lib/schema/restaurants';

/**
 * Escape CSV field value
 */
function escapeCsvField(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  // Convert to string
  let str = String(value);
  
  // If it's a JSON object/array, stringify it
  if (typeof value === 'object') {
    try {
      str = JSON.stringify(value);
    } catch (e) {
      str = String(value);
    }
  }
  
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = str.replace(/"/g, '""'); // Escape quotes
    return `"${str}"`;
  }
  
  return str;
}

/**
 * Convert array of objects to CSV string
 */
function convertToCSV(data: any[]): string {
  if (data.length === 0) {
    return '';
  }
  
  // Get headers from first object
  const headers = Object.keys(data[0]);
  
  // Create CSV header row
  const headerRow = headers.map(h => escapeCsvField(h)).join(',');
  
  // Create data rows
  const dataRows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      return escapeCsvField(value);
    }).join(',');
  });
  
  return [headerRow, ...dataRows].join('\n');
}

/**
 * Export restaurants data to CSV
 */
async function exportRestaurantsToCSV(data: any[], outputDir: string, filename: string): Promise<number> {
  try {
    console.log(`  📊 Exporting ${filename}...`);
    console.log(`     Found ${data.length} row(s)`);
    
    if (data.length === 0) {
      // Create empty CSV with headers from first restaurant schema
      const headers = Object.keys(restaurants).filter(key => !key.startsWith('_'));
      const csvContent = headers.map(h => escapeCsvField(h)).join(',') + '\n';
      const filePath = path.join(outputDir, filename);
      fs.writeFileSync(filePath, csvContent, 'utf-8');
      console.log(`     ✅ Created empty CSV: ${filename}`);
      return 0;
    }
    
    // Convert to CSV
    const csvContent = convertToCSV(data);
    
    // Write to file
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, csvContent, 'utf-8');
    
    console.log(`     ✅ Exported ${data.length} row(s) to ${filename}`);
    return data.length;
  } catch (error: any) {
    console.error(`     ❌ Error exporting ${filename}:`, error.message);
    if (error.stack) {
      console.error(`     Stack: ${error.stack}`);
    }
    throw error;
  }
}

/**
 * Main backup function
 */
async function backupDatabase() {
  console.log('🗄️  Database Backup Script');
  console.log('==========================\n');
  
  // Check if DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set!');
    console.error('Please check your .env.local file');
    process.exit(1);
  }
  
  // Mask sensitive parts of the connection string for display
  const maskedUrl = process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@');
  console.log(`📋 Database URL: ${maskedUrl}\n`);
  
  try {
    // Test connection
    console.log('⏳ Testing database connection...');
    await db.execute(sql`SELECT 1 as test`);
    console.log('✅ Database connection successful!\n');
    
    // Create backup directory with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // Format: 2024-01-15T10-30-45
    const backupDir = path.join(process.cwd(), 'backups', `backup-${timestamp}`);
    
    // Create backups directory if it doesn't exist
    const backupsDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    
    // Create timestamped backup directory
    fs.mkdirSync(backupDir, { recursive: true });
    console.log(`📁 Created backup directory: ${backupDir}\n`);
    
    // Export restaurants
    console.log('📤 Exporting restaurants to CSV...\n');
    const exportResults: { file: string; rows: number; success: boolean }[] = [];
    
    try {
      // Export all restaurants
      const allRestaurants = await db.select().from(restaurants);
      const allCount = await exportRestaurantsToCSV(allRestaurants, backupDir, 'all-restaurants.csv');
      exportResults.push({ file: 'all-restaurants.csv', rows: allCount, success: true });
      
      // Export active restaurants only
      const activeRestaurants = await db.select().from(restaurants).where(eq(restaurants.status, 'active'));
      const activeCount = await exportRestaurantsToCSV(activeRestaurants, backupDir, 'active-restaurants.csv');
      exportResults.push({ file: 'active-restaurants.csv', rows: activeCount, success: true });
      
    } catch (error: any) {
      console.error(`  ❌ Failed to export restaurants: ${error.message}`);
      exportResults.push({ file: 'restaurants', rows: 0, success: false });
    }
    
    // Create summary file
    const summary = {
      timestamp: new Date().toISOString(),
      databaseUrl: maskedUrl,
      totalRows: exportResults.reduce((sum, r) => sum + r.rows, 0),
      files: exportResults,
    };
    
    const summaryPath = path.join(backupDir, 'backup-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
    
    // Print summary
    console.log('\n📋 Backup Summary');
    console.log('================');
    console.log(`📁 Backup directory: ${backupDir}`);
    console.log(`📊 Total rows exported: ${summary.totalRows}`);
    console.log(`📄 Files created: ${exportResults.filter(r => r.success).length}/2`);
    console.log('\n📝 Exported files:');
    exportResults.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`   ${status} ${result.file}: ${result.rows} row(s)`);
    });
    
    console.log(`\n✅ Backup completed successfully!`);
    console.log(`📂 All CSV files saved to: ${backupDir}`);
    
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Backup failed!\n');
    console.error('Error details:');
    console.error(`   Message: ${error.message || error}`);
    console.error(`   Stack: ${error.stack || 'No stack trace'}`);
    
    if (error.message?.includes('timeout') || error.message?.includes('ECONNREFUSED')) {
      console.error('\n💡 Possible issues:');
      console.error('   1. Database might be paused (free tier databases pause after inactivity)');
      console.error('   2. Database URL might be incorrect');
      console.error('   3. Network/firewall blocking connection');
    } else if (error.message?.includes('authentication') || error.message?.includes('password')) {
      console.error('\n💡 Authentication failed - check your database credentials');
    } else if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
      console.error('\n💡 Database tables might not exist');
      console.error('   Run: npm run db:migrate');
    }
    
    process.exit(1);
  }
}

// Run the backup
backupDatabase();
