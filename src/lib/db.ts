import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is not set!');
  console.error('Please create a .env.local file with your DATABASE_URL');
  throw new Error('DATABASE_URL environment variable is not set. Please create .env.local file.');
}

// Disable prefetch as it's not supported for "Transaction" pool mode
// Configure SSL if connection string requires it
const sslConfig: any = {};
if (connectionString.includes('sslmode=require') || connectionString.includes('neon.tech')) {
  sslConfig.ssl = { rejectUnauthorized: false };
}

const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ...sslConfig,
});

export const db = drizzle(client, { schema });

