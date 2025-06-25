// src/api/middleware/rate-limiter.middleware.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient, getKey } from '../../utils/redis';
import { env } from '../../config/env';

// Helper function to create a Redis store for rate limiting
const createRedisStore = (keyPrefix: string) => {
  return new RedisStore({
    // The new version requires a different signature
    sendCommand: async (...args: any[]) => {
      // Extract command and parameters
      const [command, ...params] = args as [string, ...string[]];
      
      // Apply our own prefix to keys
      const processedParams = params.map((param, index) => {
        // If this looks like a key (first param after command), apply our prefix
        if (index === 0 && typeof param === 'string') {
          return getKey(`${keyPrefix}${param}`);
        }
        return param;
      });
      
      // Use the Redis client directly
      const client = redisClient;
      if (!client.isOpen) {
        await client.connect();
      }
      
      return client.sendCommand([command, ...processedParams]);
    }
  });
};

// Standard API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === 'production' ? 100 : 1000, // limit each IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later.' } },
  skip: (req) => env.NODE_ENV === 'test', // Skip in test environment
  // Use Redis in production
  ...(env.NODE_ENV === 'production' && {
    store: createRedisStore('ratelimit:')
  })
});

// More restrictive limiter for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: env.NODE_ENV === 'production' ? 10 : 100, // limit each IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many authentication attempts, please try again later.' } },
  skip: (req) => env.NODE_ENV === 'test', // Skip in test environment
  // Use Redis in production
  ...(env.NODE_ENV === 'production' && {
    store: createRedisStore('authlimit:')
  })
});