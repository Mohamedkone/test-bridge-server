// Common types used throughout the application

// User role types
export type UserRole = 'admin' | 'user' | 'guest';

// Storage provider types
export type StorageProvider = 'wasabi' | 'storj' | 'google-drive' | 'dropbox' | 's3';

// Response status types
export type ResponseStatus = 'success' | 'error';

// Generic API response
export interface ApiResponse<T = any> {
  status: ResponseStatus;
  message?: string;
  data?: T;
}

// Pagination parameters
export interface PaginationParams {
  page: number;
  limit: number;
}

// Pagination result
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}