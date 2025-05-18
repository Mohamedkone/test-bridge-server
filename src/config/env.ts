// src/config/env.ts
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto'; // Import Node.js crypto module

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Define environment variables interface
export interface EnvironmentVariables {
  // ... existing properties
  NODE_ENV: string;
  PORT: number;
  HOST: string;
  
  // Database
  MYSQL_HOST: string;
  MYSQL_PORT: number;
  MYSQL_USER: string;
  MYSQL_PASSWORD: string;
  MYSQL_DATABASE: string;
  
  // Redis
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  REDIS_PREFIX: string;
  
  // Auth0
  AUTH0_DOMAIN: string;
  AUTH0_AUDIENCE: string;
  AUTH0_CLIENT_ID?: string;
  AUTH0_CLIENT_SECRET?: string;
  
  // JWT
  JWT_SECRET: string;
  JWT_AUDIENCE?: string;
  JWT_ISSUER?: string;

  // Encryption
  ENCRYPTION_KEY: string;
}

// Helper function to generate a fallback encryption key
function generateFallbackEncryptionKey(): string {
  if (process.env.NODE_ENV === 'production') {
    console.warn('ENCRYPTION_KEY is not set in production! This is a security risk.');
  } else {
    console.warn('ENCRYPTION_KEY is not set. Using a random key for development.');
  }
  // Generate a random 32-byte hex string using Node.js crypto
  return crypto.randomBytes(32).toString('hex');
}

// Parse environment variables with validation and defaults
export const env: EnvironmentVariables = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || 'localhost',
  
  // Database
  MYSQL_HOST: process.env.MYSQL_HOST || 'localhost',
  MYSQL_PORT: parseInt(process.env.MYSQL_PORT || '3306', 10),
  MYSQL_USER: process.env.MYSQL_USER || 'root',
  MYSQL_PASSWORD: process.env.MYSQL_PASSWORD || '',
  MYSQL_DATABASE: process.env.MYSQL_DATABASE || 'lockbridge',
  
  // Redis
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  REDIS_PREFIX: process.env.REDIS_PREFIX || 'lockbridge:',
  
  // Auth0
  AUTH0_DOMAIN: process.env.AUTH0_DOMAIN || '',
  AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE || '',
  AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID,
  AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET,
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key',
  JWT_AUDIENCE: process.env.JWT_AUDIENCE,
  JWT_ISSUER: process.env.JWT_ISSUER,
  
  // Encryption
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || generateFallbackEncryptionKey(),
};

// Validate required environment variables
const requiredEnvVars: Array<keyof EnvironmentVariables> = [
  'MYSQL_HOST', 'MYSQL_USER', 'MYSQL_DATABASE',
  'REDIS_HOST', 'AUTH0_DOMAIN', 'AUTH0_AUDIENCE',
  'JWT_SECRET'
];

requiredEnvVars.forEach(varName => {
  if (!env[varName]) {
    console.warn(`Missing required environment variable: ${varName}`);
  }
});