// src/utils/logger.ts
import { injectable } from 'inversify';
import { Request, RequestHandler } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';

// Define log levels
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

@injectable()
export class Logger {
  private context: string;

  constructor(context: string = 'app') {
    this.context = context;
  }

  /**
   * Log a debug message
   */
  debug(message: string, meta: Record<string, any> = {}): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  /**
   * Log an info message
   */
  info(message: string, meta: Record<string, any> = {}): void {
    this.log(LogLevel.INFO, message, meta);
  }

  /**
   * Log a warning message
   */
  warn(message: string, meta: Record<string, any> = {}): void {
    this.log(LogLevel.WARN, message, meta);
  }

  /**
   * Log an error message
   */
  error(message: string, meta: Record<string, any> = {}): void {
    this.log(LogLevel.ERROR, message, meta);
  }

  /**
   * Log a fatal message
   */
  fatal(message: string, meta: Record<string, any> = {}): void {
    this.log(LogLevel.FATAL, message, meta);
  }

  /**
   * Create a child logger with a different context
   */
  createChildLogger(context: string): Logger {
    return new Logger(`${this.context}:${context}`);
  }

  /**
   * Create a request-scoped logger
   */
  createRequestLogger(requestId: string, userId?: string): RequestLogger {
    return {
      debug: (message: string, meta: Record<string, any> = {}) => {
        this.log(LogLevel.DEBUG, message, { ...meta, requestId, userId });
      },
      info: (message: string, meta: Record<string, any> = {}) => {
        this.log(LogLevel.INFO, message, { ...meta, requestId, userId });
      },
      warn: (message: string, meta: Record<string, any> = {}) => {
        this.log(LogLevel.WARN, message, { ...meta, requestId, userId });
      },
      error: (message: string, meta: Record<string, any> = {}) => {
        this.log(LogLevel.ERROR, message, { ...meta, requestId, userId });
      },
      fatal: (message: string, meta: Record<string, any> = {}) => {
        this.log(LogLevel.FATAL, message, { ...meta, requestId, userId });
      }
    };
  }

  /**
   * Audit log for security events
   */
  auditLog(userId: string, action: string, resource: string, details?: any, success: boolean = true): void {
    this.log(LogLevel.INFO, `Audit: ${action}`, {
      userId,
      action,
      resource,
      success,
      details,
      audit: true,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log a message at the specified level
   */
  private log(level: LogLevel, message: string, meta: Record<string, any> = {}): void {
    const timestamp = new Date().toISOString();
    
    const logEntry = {
      timestamp,
      level,
      message,
      context: this.context,
      ...meta
    };

    // In development, pretty-print logs
    if (env.NODE_ENV !== 'production') {
      const consoleMethod = this.getConsoleMethod(level);
      consoleMethod(`[${timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}`, 
        Object.keys(meta).length ? meta : '');
    } else {
      // In production, output JSON logs for easier parsing
      console.log(JSON.stringify(logEntry));
    }
  }

  /**
   * Get the appropriate console method for the log level
   */
  private getConsoleMethod(level: LogLevel): (...args: any[]) => void {
    switch (level) {
      case LogLevel.DEBUG:
        return console.debug;
      case LogLevel.INFO:
        return console.info;
      case LogLevel.WARN:
        return console.warn;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        return console.error;
      default:
        return console.log;
    }
  }
}

// Request logger interface
export interface RequestLogger {
  debug(message: string, meta?: Record<string, any>): void;
  info(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  error(message: string, meta?: Record<string, any>): void;
  fatal(message: string, meta?: Record<string, any>): void;
}

// Extend Express Request to include logger
declare global {
  namespace Express {
    interface Request {
      logger?: RequestLogger;
      requestId?: string;
    }
  }
}

/**
 * Middleware to add logger to requests
 */
export const requestLogger: RequestHandler = (req, res, next) => {
    // Generate request ID if not present
    const requestId = req.headers['x-request-id'] as string || uuidv4();
    res.setHeader('X-Request-ID', requestId);
    
    // Create logger instance
    const logger = new Logger('http');
    
    // Create request-scoped logger - without userId initially
    const requestLogger = logger.createRequestLogger(requestId);
    
    // Attach logger and requestId to request
    req.logger = requestLogger;
    req.requestId = requestId;
    
    // Log request start
    const startTime = Date.now();
    requestLogger.info('Request started', {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    // Log request completion with userId if available at that point
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const level = res.statusCode >= 500 ? 'error' : 
                    res.statusCode >= 400 ? 'warn' : 'info';
      
      // Get userId from authenticated request which should be populated by then
      const userId = req.user?.id;
      
      // Update the logger with userId if available
      const updatedLogger = userId 
        ? logger.createRequestLogger(requestId, userId) 
        : requestLogger;
      
      updatedLogger[level]('Request completed', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        responseSize: parseInt(res.getHeader('Content-Length') as string, 10) || 0,
      });
    });
    
    next();
  };