// src/utils/redis.ts
import { createClient } from 'redis';
import { env } from '../config/env';

// Create a logger instance
// We avoid using the Logger class directly to prevent circular dependencies
const logRedisError = (message: string, error?: any) => {
  console.error(`[REDIS] ${message}`, error);
};

const logRedisInfo = (message: string) => {
  console.info(`[REDIS] ${message}`);
};

// Redis client singleton
let _redisClient: any = null;

/**
 * Create Redis client with options from environment
 */
export const createRedisClient = () => {
  if (_redisClient) {
    return _redisClient;
  }

  const client = createClient({
    url: `redis://${env.REDIS_PASSWORD ? `:${env.REDIS_PASSWORD}@` : ''}${env.REDIS_HOST}:${env.REDIS_PORT}`,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          logRedisError('Redis connection failed after maximum retries');
          return new Error('Redis connection failed after maximum retries');
        }
        return Math.min(retries * 50, 3000);
      }
    }
  });

  client.on('error', (err) => {
    logRedisError('Redis client error', err);
  });

  client.on('connect', () => {
    logRedisInfo('Redis client connected');
  });

  _redisClient = client;
  return client;
};

/**
 * Get the Redis client instance, creating it if needed
 */
export const getRedisClient = () => {
  if (!_redisClient) {
    _redisClient = createRedisClient();
  }
  return _redisClient;
};

/**
 * Connect to Redis server
 */
export const connectToRedis = async (): Promise<boolean> => {
  try {
    const client = getRedisClient();
    if (!client.isOpen) {
      await client.connect();
    }
    return true;
  } catch (error) {
    logRedisError('Failed to connect to Redis', error);
    return false;
  }
};

/**
 * Get a prefixed key for Redis
 */
export const getKey = (key: string): string => {
  return `${env.REDIS_PREFIX}${key}`;
};

/**
 * Set a value in Redis with an optional TTL
 */
export const setValue = async (key: string, value: string, expireSeconds?: number): Promise<boolean> => {
  try {
    const client = getRedisClient();
    
    if (!client.isOpen) {
      await client.connect();
    }
    
    const prefixedKey = getKey(key);
    
    if (expireSeconds) {
      await client.set(prefixedKey, value, { EX: expireSeconds });
    } else {
      await client.set(prefixedKey, value);
    }
    
    return true;
  } catch (error) {
    logRedisError(`Failed to set Redis value for key: ${key}`, error);
    return false;
  }
};

/**
 * Get a value from Redis
 */
export const getValue = async (key: string): Promise<string | null> => {
  try {
    const client = getRedisClient();
    
    if (!client.isOpen) {
      await client.connect();
    }
    
    const prefixedKey = getKey(key);
    return await client.get(prefixedKey);
  } catch (error) {
    logRedisError(`Failed to get Redis value for key: ${key}`, error);
    return null;
  }
};

/**
 * Delete a key from Redis
 */
export const deleteKey = async (key: string): Promise<boolean> => {
  try {
    const client = getRedisClient();
    
    if (!client.isOpen) {
      await client.connect();
    }
    
    const prefixedKey = getKey(key);
    await client.del(prefixedKey);
    return true;
  } catch (error) {
    logRedisError(`Failed to delete Redis key: ${key}`, error);
    return false;
  }
};

/**
 * Check if a key exists in Redis
 */
export const exists = async (key: string): Promise<boolean> => {
  try {
    const client = getRedisClient();
    
    if (!client.isOpen) {
      await client.connect();
    }
    
    const prefixedKey = getKey(key);
    const result = await client.exists(prefixedKey);
    return result === 1;
  } catch (error) {
    logRedisError(`Failed to check if Redis key exists: ${key}`, error);
    return false;
  }
};

// Export the redis client for direct access when needed
export const redisClient = getRedisClient();