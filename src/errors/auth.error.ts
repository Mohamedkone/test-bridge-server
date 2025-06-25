export class AuthError extends Error {
  constructor(
    message: string,
    public code: string = 'AUTH_ERROR',
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor(message: string = 'Invalid credentials') {
    super(message, 'INVALID_CREDENTIALS', 401);
  }
}

export class UserNotFoundError extends AuthError {
  constructor(message: string = 'User not found') {
    super(message, 'USER_NOT_FOUND', 404);
  }
}

export class UserInactiveError extends AuthError {
  constructor(message: string = 'User account is inactive') {
    super(message, 'USER_INACTIVE', 403);
  }
}

export class InvalidTokenError extends AuthError {
  constructor(message: string = 'Invalid token') {
    super(message, 'INVALID_TOKEN', 401);
  }
}

export class TokenExpiredError extends AuthError {
  constructor(message: string = 'Token has expired') {
    super(message, 'TOKEN_EXPIRED', 401);
  }
}

export class InsufficientPermissionsError extends AuthError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'INSUFFICIENT_PERMISSIONS', 403);
  }
} 