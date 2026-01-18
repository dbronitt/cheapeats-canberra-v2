// Load environment variables FIRST using dotenv (must use require for synchronous loading)
require('dotenv').config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';

interface CsvRow {
  [key: string]: string;
}

interface MissingDataReport {
  restaurantName: string;
  id: string;
  address?: string;
  suburb?: string;
  missingOpeningHours: boolean;
  missingCoordinates: boolean;
  missingLatitude: boolean;
  missingLongitude: boolean;
  googlePlaceId?: string;
  foursquarePlaceId?: string;
  hasAddress: boolean;
}

/**
 * Parse CSV line handling quoted fields
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Check if a value is empty/null/undefined
 */
function isEmpty(value: string | undefined): boolean {
  return !value || value.trim() === '' || value.trim().toLowerCase() === 'null' || value.trim() === '{}';
}

/**
 * Check if opening hours are valid
 */
function hasOpeningHours(openingHoursStr: string | undefined): boolean {
  if (isEmpty(openingHoursStr)) {
    return false;
  }
  
  try {
    // Check if it's a JSON object with content
    if (openingHoursStr && openingHoursStr.trim().startsWith('{')) {
      const parsed = JSON.parse(openingHoursStr);
      return parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0;
    }
  } catch (e) {
    // Not valid JSON
  }
  
  return false;
}

/**
 * Main function to analyze CSV for missing data
 */
async function findMissingData(csvFilePath: string): Promise<void> {
  console.log('🔍 Finding Restaurants with Missing Data');
  console.log('=========================================\n');
  
  if (!fs.existsSync(csvFilePath)) {
    console.error(`❌ CSV file not found: ${csvFilePath}`);
    process.exit(1);
  }
  
  const csvContent = fs.readFileSync(csvFilePath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());
  
  if (lines.length < 2) {
    console.error('❌ CSV file is empty or has no data rows');
    process.exit(1);
  }
  
  // Parse header
  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine);
  
  console.log(`📋 CSV Headers: ${headers.length} columns found\n`);
  
  const reports: MissingDataReport[] = [];
  
  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const values = parseCsvLine(line);
    
    if (values.length < headers.length) {
      console.log(`⚠️  Skipping line ${i + 1}: insufficient columns (expected ${headers.length}, got ${values.length})`);
      continue;
    }
    
    // Create row object
    const csvRow: CsvRow = {};
    headers.forEach((header, index) => {
      csvRow[header] = values[index] || '';
    });
    
    const restaurantName = csvRow['name'] || '';
    const id = csvRow['id'] || '';
    const address = csvRow['address'] || '';
    const suburb = csvRow['suburb'] || '';
    const latitude = csvRow['latitude'] || '';
    const longitude = csvRow['longitude'] || '';
    const openingHours = csvRow['openingHours'] || '';
    const googlePlaceId = csvRow['googlePlaceId'] || '';
    const foursquarePlaceId = csvRow['foursquarePlaceId'] || '';
    
    if (!restaurantName) {
      continue; // Skip rows without names
    }
    
    const missingLatitude = isEmpty(latitude);
    const missingLongitude = isEmpty(longitude);
    const missingCoordinates = missingLatitude || missingLongitude;
    const missingOpeningHours = !hasOpeningHours(openingHours);
    
    // Only add to report if something is missing
    if (missingCoordinates || missingOpeningHours) {
      reports.push({
        restaurantName,
        id,
        address: address || undefined,
        suburb: suburb || undefined,
        missingOpeningHours,
        missingCoordinates,
        missingLatitude,
        missingLongitude,
        googlePlaceId: googlePlaceId || undefined,
        foursquarePlaceId: foursquarePlaceId || undefined,
        hasAddress: !isEmpty(address),
      });
    }
  }
  
  // Generate summary
  console.log('📊 Missing Data Summary');
  console.log('='.repeat(60));
  console.log(`Total restaurants in CSV: ${lines.length - 1}`);
  console.log(`Restaurants with missing data: ${reports.length}\n`);
  
  const missingOpeningHoursCount = reports.filter(r => r.missingOpeningHours).length;
  const missingCoordinatesCount = reports.filter(r => r.missingCoordinates).length;
  const missingBothCount = reports.filter(r => r.missingOpeningHours && r.missingCoordinates).length;
  const missingLatitudeCount = reports.filter(r => r.missingLatitude).length;
  const missingLongitudeCount = reports.filter(r => r.missingLongitude).length;
  
  console.log(`📅 Missing Opening Hours: ${missingOpeningHoursCount}`);
  console.log(`📍 Missing Coordinates: ${missingCoordinatesCount}`);
  console.log(`   - Missing Latitude: ${missingLatitudeCount}`);
  console.log(`   - Missing Longitude: ${missingLongitudeCount}`);
  console.log(`⚠️  Missing Both: ${missingBothCount}\n`);
  
  // Group restaurants with Place IDs (easier to fetch data)
  const withGooglePlaceId = reports.filter(r => r.googlePlaceId).length;
  const withFoursquarePlaceId = reports.filter(r => r.foursquarePlaceId).length;
  const withAnyPlaceId = reports.filter(r => r.googlePlaceId || r.foursquarePlaceId).length;
  
  console.log(`🔑 Restaurants with Place IDs (easier to fetch):`);
  console.log(`   - Google Place ID: ${withGooglePlaceId}`);
  console.log(`   - Foursquare Place ID: ${withFoursquarePlaceId}`);
  console.log(`   - Any Place ID: ${withAnyPlaceId}\n`);
  
  // Detailed list
  if (reports.length > 0) {
    console.log('📋 Detailed List of Restaurants with Missing Data');
    console.log('='.repeat(60));
    
    reports.forEach((report, index) => {
      console.log(`\n[${index + 1}] ${report.restaurantName} (ID: ${report.id})`);
      
      if (report.suburb) {
        console.log(`    Suburb: ${report.suburb}`);
      }
      
      if (report.hasAddress) {
        console.log(`    Address: ${report.address}`);
      } else {
        console.log(`    ⚠️  Address: Missing`);
      }
      
      const missingItems: string[] = [];
      if (report.missingOpeningHours) missingItems.push('Opening Hours');
      if (report.missingLatitude) missingItems.push('Latitude');
      if (report.missingLongitude) missingItems.push('Longitude');
      
      console.log(`    Missing: ${missingItems.join(', ')}`);
      
      if (report.googlePlaceId) {
        console.log(`    ✅ Has Google Place ID: ${report.googlePlaceId}`);
      }
      if (report.foursquarePlaceId) {
        console.log(`    ✅ Has Foursquare Place ID: ${report.foursquarePlaceId}`);
      }
      if (!report.googlePlaceId && !report.foursquarePlaceId) {
        console.log(`    ⚠️  No Place IDs available (may need to search by name/address)`);
      }
    });
  } else {
    console.log('✅ No restaurants with missing data found!');
  }
  
  // Save report to JSON file
  const reportDir = path.join(process.cwd(), 'backups', 'backup-2026-01-18T01-06-53');
  const reportPath = path.join(reportDir, 'missing-data-report.json');
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  const summaryReport = {
    generatedAt: new Date().toISOString(),
    csvFile: csvFilePath,
    totalRestaurants: lines.length - 1,
    restaurantsWithMissingData: reports.length,
    summary: {
      missingOpeningHours: missingOpeningHoursCount,
      missingCoordinates: missingCoordinatesCount,
      missingLatitude: missingLatitudeCount,
      missingLongitude: missingLongitudeCount,
      missingBoth: missingBothCount,
      withGooglePlaceId,
      withFoursquarePlaceId,
      withAnyPlaceId,
    },
    restaurants: reports,
  };
  
  fs.writeFileSync(reportPath, JSON.stringify(summaryReport, null, 2), 'utf-8');
  console.log(`\n💾 Detailed report saved to: ${reportPath}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Analysis completed successfully!');
  console.log('='.repeat(60));
}

// Main execution
// Parse command line arguments - skip dotenv_config_path and .env.local
const allArgs = process.argv.slice(2);
const csvFilePath = allArgs.find(arg => !arg.includes('dotenv_config_path') && !arg.includes('.env.local') && (arg.endsWith('.csv') || arg.includes('backup'))) 
  || path.join(process.cwd(), 'backups', 'backup-2026-01-18T01-06-53', 'active-restaurants.csv');

console.log(`📁 CSV File: ${csvFilePath}\n`);

findMissingData(csvFilePath)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Analysis failed:', error);
    process.exit(1);
  });
