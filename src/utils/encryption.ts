// src/utils/encryption.ts
import crypto from 'crypto';
import { env } from '../config/env';

// The encryption key should be stored in environment variables
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-secret-encryption-key';
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts data using AES-256-GCM
 * @param data Data to encrypt
 * @returns Encrypted data in format: iv:authTag:encryptedData
 */
export async function encryptData(data: string): Promise<string> {
  // Generate a random initialization vector
  const iv = crypto.randomBytes(16);
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  // Encrypt the data
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Get the authentication tag
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Return the IV, auth tag, and encrypted data
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts data encrypted with encryptData
 * @param encryptedData Encrypted data in format: iv:authTag:encryptedData
 * @returns Decrypted data
 */
export async function decryptData(encryptedData: string): Promise<string> {
  // Split the encrypted data into IV, auth tag, and actual encrypted data
  const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');
  
  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  // Set the auth tag
  decipher.setAuthTag(authTag);
  
  // Decrypt the data
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}