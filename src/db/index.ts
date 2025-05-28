import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { DrizzleClient } from './drizzle.client';
import { Logger } from '../utils/logger';

const logger = new Logger('DrizzleClient');
const drizzleClient = new DrizzleClient(logger);

let db: ReturnType<typeof drizzleClient.getInstance>;

// Initialize database connection
export async function initializeDatabase() {
  try {
    await drizzleClient.initialize();
    db = drizzleClient.getInstance();
    logger.info('Database connection established');
  } catch (error) {
    logger.error('Failed to initialize database connection', { error });
    process.exit(1);
  }
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
} 