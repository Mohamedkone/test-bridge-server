// src/api/middleware/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../../utils/errors';
import { env } from '../../config/env';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Default error values
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let details: any = undefined;
  let isOperational = false;

  // Get request ID for tracking
  const requestId = req.headers['x-request-id'] as string || uuidv4();

  // Handle AppError instances
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.code;
    message = err.message;
    details = err.details;
    isOperational = err.isOperational;
  } 
  // Handle known Express/Node errors
  else if (err.name === 'SyntaxError') {
    statusCode = 400;
    errorCode = 'INVALID_JSON';
    message = 'Invalid JSON payload';
    isOperational = true;
  } 
  else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
    message = 'Invalid token';
    isOperational = true;
  }

  // Determine log level based on error status
  const logLevel = statusCode >= 500 ? 'error' : 'warn';

  // Create structured log
  const logData = {
    requestId,
    errorName: err.name,
    errorCode,
    message: err.message,
    statusCode,
    stackTrace: err.stack,
    isOperational,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id,
  };

  // Log error
  console[logLevel](`Error: ${JSON.stringify(logData)}`);

  // Only expose error details in non-production environments
  // if details exist and it's safe to show them
  const responseDetails = 
    env.NODE_ENV !== 'production' && isOperational
      ? details
      : undefined;

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      details: responseDetails,
      requestId
    }
  });
};