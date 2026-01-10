// Wrapper script to ensure dotenv loads before any imports
require('dotenv').config({ path: '.env.local' });

// Now dynamically import and run the main script
import('./find-and-merge-duplicates.ts').catch(error => {
  console.error('Failed to run script:', error);
  process.exit(1);
});
