import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { StorageError } from './errors';

export interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
}

export class StorageSecurity {
  private static readonly DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig = {
    algorithm: 'aes-256-gcm',
    keyLength: 32,
    ivLength: 16
  };

  /**
   * Generate a secure encryption key
   */
  static generateEncryptionKey(): Buffer {
    return randomBytes(this.DEFAULT_ENCRYPTION_CONFIG.keyLength);
  }

  /**
   * Encrypt data with AES-GCM
   */
  static encryptData(data: string, key: Buffer): { encrypted: Buffer; iv: Buffer; authTag: Buffer } {
    try {
      const iv = randomBytes(this.DEFAULT_ENCRYPTION_CONFIG.ivLength);
      const cipher = createCipheriv(this.DEFAULT_ENCRYPTION_CONFIG.algorithm, key, iv);
      
      const encrypted = Buffer.concat([
        cipher.update(data, 'utf8'),
        cipher.final()
      ]);
      
      return {
        encrypted,
        iv,
        authTag: cipher.getAuthTag()
      };
    } catch (error: any) {
      throw new StorageError(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data with AES-GCM
   */
  static decryptData(encrypted: Buffer, key: Buffer, iv: Buffer, authTag: Buffer): string {
    try {
      const decipher = createDecipheriv(this.DEFAULT_ENCRYPTION_CONFIG.algorithm, key, iv);
      decipher.setAuthTag(authTag);
      
      return decipher.update(encrypted) + decipher.final('utf8');
    } catch (error: any) {
      throw new StorageError(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate a secure hash for file integrity verification
   */
  static generateFileHash(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Validate file integrity using hash
   */
  static validateFileIntegrity(data: Buffer, expectedHash: string): boolean {
    const actualHash = this.generateFileHash(data);
    return actualHash === expectedHash;
  }

  /**
   * Generate a secure temporary access token
   */
  static generateTemporaryToken(expirySeconds: number = 3600): string {
    const token = randomBytes(32).toString('hex');
    const expiry = Date.now() + (expirySeconds * 1000);
    return `${token}.${expiry}`;
  }

  /**
   * Validate a temporary access token
   */
  static validateTemporaryToken(token: string): boolean {
    try {
      const [, expiry] = token.split('.');
      return Date.now() < parseInt(expiry);
    } catch {
      return false;
    }
  }
} 