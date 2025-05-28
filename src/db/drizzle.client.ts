import { drizzle } from 'drizzle-orm/mysql2';
import { createConnection } from 'mysql2/promise';
import { injectable, inject } from 'inversify';
import { Logger } from '../utils/logger';
import { MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from './schema';

@injectable()
export class DrizzleClient {
  private db!: MySql2Database<typeof schema>;

  constructor(
    @inject('Logger') private logger: Logger
  ) {
    this.logger = logger.createChildLogger('DrizzleClient');
  }

  /**
   * Initialize database connection
   */
  async initialize(): Promise<void> {
    try {
      const connection = await createConnection({
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_NAME,
        port: Number(process.env.MYSQL_PORT) || 3306
      });

      this.db = drizzle(connection, { 
        schema,
        mode: 'default'
      });
      this.logger.info('Database connection established');
    } catch (error: any) {
      this.logger.error('Failed to connect to database', { error: error.message });
      throw error;
    }
  }

  /**
   * Get database instance
   */
  getInstance(): MySql2Database<typeof schema> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }
} 