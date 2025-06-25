// src/config/env.ts
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3000'),
  HOST: z.string().default('localhost'),
  
  // Database
  MYSQL_HOST: z.string().default('localhost'),
  MYSQL_PORT: z.coerce.number().default(3306),
  MYSQL_USER: z.string(),
  MYSQL_PASSWORD: z.string(),
  MYSQL_NAME: z.string(),
  
  // Redis
  REDIS_HOST: z.string(),
  REDIS_PORT: z.coerce.number(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_PREFIX: z.string().default('lockbridge:'),
  
  // Auth0
  AUTH0_DOMAIN: z.string(),
  AUTH0_AUDIENCE: z.string(),
  AUTH0_CLIENT_ID: z.string().optional(),
  AUTH0_CLIENT_SECRET: z.string().optional(),
  
  // JWT
  JWT_SECRET: z.string(),
  JWT_AUDIENCE: z.string().default('https://api.lockbridge.com'),
  JWT_ISSUER: z.string().default('https://lockbridge.com'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  // Storage
  STORAGE_PROVIDER: z.enum(['local', 's3', 'gcs', 'azure', 'dropbox', 'gdrive', 'onedrive']).default('local'),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  
  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

// Parse and validate environment variables
export const env = envSchema.parse(process.env);