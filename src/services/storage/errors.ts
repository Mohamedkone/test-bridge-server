// src/services/storage/errors.ts
import { AppError } from '../../utils/errors';

/**
 * Base storage error
 */
export class StorageError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, 'STORAGE_ERROR', details, true);
  }
}

/**
 * Storage authentication error
 */
export class StorageAuthError extends StorageError {
  constructor(provider: string, details?: any) {
    super(`Authentication error with ${provider} storage provider`, details);
    // Pass code and statusCode in the constructor instead of assigning afterward
    Object.defineProperty(this, 'code', { value: 'STORAGE_AUTH_ERROR' });
    Object.defineProperty(this, 'statusCode', { value: 401 });
  }
}

/**
 * Storage access denied error
 */
export class StorageAccessError extends StorageError {
  constructor(key: string, operation: string, details?: any) {
    super(`Access denied to ${key} during ${operation} operation`, details);
    Object.defineProperty(this, 'code', { value: 'STORAGE_ACCESS_ERROR' });
    Object.defineProperty(this, 'statusCode', { value: 403 });
  }
}

/**
 * Storage object not found error
 */
export class StorageNotFoundError extends StorageError {
  constructor(key: string, details?: any) {
    super(`Object not found: ${key}`, details);
    Object.defineProperty(this, 'code', { value: 'STORAGE_NOT_FOUND' });
    Object.defineProperty(this, 'statusCode', { value: 404 });
  }
}

/**
 * Storage quota exceeded error
 */
export class StorageQuotaError extends StorageError {
  constructor(provider: string, details?: any) {
    super(`Storage quota exceeded on ${provider}`, details);
    Object.defineProperty(this, 'code', { value: 'STORAGE_QUOTA_EXCEEDED' });
    Object.defineProperty(this, 'statusCode', { value: 507 });
  }
}

/**
 * Storage provider error
 */
export class StorageProviderError extends StorageError {
  constructor(provider: string, operation: string, details?: any) {
    super(`Error with ${provider} during ${operation}`, details);
    Object.defineProperty(this, 'code', { value: 'STORAGE_PROVIDER_ERROR' });
    Object.defineProperty(this, 'statusCode', { value: 502 });
  }
}