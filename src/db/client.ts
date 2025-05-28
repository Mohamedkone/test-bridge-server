// src/db/client.ts
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { env } from '../config/env';

// Define DrizzleClient type for export
export type DrizzleClient = ReturnType<typeof drizzle>;

// Create MySQL connection pool
const connectionPool = mysql.createPool({
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  database: env.MYSQL_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Create Drizzle ORM instance
export const db = drizzle(connectionPool);

// Function to test the database connection
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const connection = await connectionPool.getConnection();
    connection.release();
    console.log('Successfully connected to MySQL database');
    return true;
  } catch (error) {
    console.error('Failed to connect to MySQL database:', error);
    return false;
  }
}