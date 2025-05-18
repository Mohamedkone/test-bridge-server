// src/utils/errors.ts

/**
 * Base application error class
 */
export class AppError extends Error {
    constructor(
      public readonly message: string,
      public readonly statusCode: number = 500,
      public readonly code: string = 'INTERNAL_ERROR',
      public readonly details?: any,
      public readonly isOperational: boolean = true,
    ) {
      super(message);
      this.name = this.constructor.name;
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  /**
   * Validation error (400)
   */
  export class ValidationError extends AppError {
    constructor(message: string, details?: any) {
      super(message, 400, 'VALIDATION_ERROR', details, true);
    }
  }
  
  /**
   * Authentication error (401)
   */
  export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication required') {
      super(message, 401, 'UNAUTHORIZED', undefined, true);
    }
  }
  
  /**
   * Authorization error (403)
   */
  export class AuthorizationError extends AppError {
    constructor(message: string = 'Insufficient permissions') {
      super(message, 403, 'FORBIDDEN', undefined, true);
    }
  }
  
  /**
   * Resource not found error (404)
   */
  export class NotFoundError extends AppError {
    constructor(resource: string, id?: string) {
      const message = id 
        ? `${resource} not found with id: ${id}` 
        : `${resource} not found`;
      super(message, 404, 'NOT_FOUND', { resource, id }, true);
    }
  }
  
  /**
   * Resource conflict error (409)
   */
  export class ConflictError extends AppError {
    constructor(message: string, details?: any) {
      super(message, 409, 'CONFLICT', details, true);
    }
  }
  
  /**
   * Rate limit error (429)
   */
  export class RateLimitError extends AppError {
    constructor(message: string = 'Rate limit exceeded', details?: any) {
      super(message, 429, 'RATE_LIMIT_EXCEEDED', details, true);
    }
  }
  
  /**
   * Storage error (500)
   */
  export class StorageError extends AppError {
    constructor(message: string, details?: any) {
      super(message, 500, 'STORAGE_ERROR', details, true);
    }
  }
  
  /**
   * Database error (500)
   */
  export class DatabaseError extends AppError {
    constructor(message: string, details?: any) {
      super(message, 500, 'DATABASE_ERROR', details, true);
    }
  }
  
  /**
   * Third-party service error (502)
   */
  export class ThirdPartyServiceError extends AppError {
    constructor(service: string, message: string, details?: any) {
      super(
        `Error with ${service}: ${message}`, 
        502, 
        'SERVICE_UNAVAILABLE', 
        details, 
        true
      );
    }
  }
  
  /**
   * Configuration error (500)
   */
  export class ConfigurationError extends AppError {
    constructor(message: string, details?: any) {
      super(message, 500, 'CONFIGURATION_ERROR', details, false);
    }
  }