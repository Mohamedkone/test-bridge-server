// src/db/migrate.ts
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import mysql from 'mysql2/promise';
import { env } from '../config/env';

async function runMigrations() {
  const connection = await mysql.createConnection({
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: env.MYSQL_DATABASE,
  });

  const db = drizzle(connection);

  // This will run all migrations in the migrations folder
  await migrate(db, { migrationsFolder: './drizzle' });

  await connection.end();
}

runMigrations()
  .then(() => console.log('Migrations completed successfully!'))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });