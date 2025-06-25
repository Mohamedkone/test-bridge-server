// drizzle.config.ts
import type { Config } from 'drizzle-kit';
import { env } from './src/config/env';

export default {
  schema: './src/db/schema/*.ts',
  out: './drizzle',
  dialect: 'mysql',
  dbCredentials: {
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    database: env.MYSQL_NAME,
  },
  verbose: true,
  strict: true,
} satisfies Config;