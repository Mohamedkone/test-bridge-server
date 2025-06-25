// src/db/migrate.ts
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';
import { env } from '../config/env';
import path from 'path';

async function main() {
  const connection = await mysql.createConnection({
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: env.MYSQL_NAME,
  });

  const db = drizzle(connection);

  console.log('Running migrations...');

  // Use the drizzle directory for migrations
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });

  console.log('Migrations completed successfully');

  await connection.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});