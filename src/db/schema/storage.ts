// src/db/schema/storage.ts
import { mysqlTable, varchar, timestamp, boolean, int, json, text, mysqlEnum } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { files } from './files';

export const STORAGE_TYPES = [
    'vault', // Internal storage (Wasabi/Storj)
    's3',
    'google_drive',
    'dropbox',
    'azure_blob',
    'gcp_storage'
  ] as const;
  
  export const storageAccounts = mysqlTable('storage_accounts', {
    id: varchar('id', { length: 36 }).primaryKey().notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    companyId: varchar('company_id', { length: 36 }).notNull(),
    storageType: mysqlEnum('storage_type', STORAGE_TYPES).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow()
  });

// Separate credentials from storage accounts for better security
export const storageCredentials = mysqlTable('storage_credentials', {
  storageId: varchar('storage_id', { length: 36 }).primaryKey().notNull(),
  credentials: text('credentials').notNull(), // Encrypted credentials (specific to provider)
  expiresAt: timestamp('expires_at'),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Storage usage statistics
export const storageStats = mysqlTable('storage_stats', {
  storageId: varchar('storage_id', { length: 36 }).primaryKey().notNull(),
  totalSize: int('total_size').notNull().default(0),
  usedSize: int('used_size').notNull().default(0),
  fileCount: int('file_count').notNull().default(0),
  lastUpdated: timestamp('last_updated').notNull().defaultNow()
});

export const storageAccountsRelations = relations(storageAccounts, ({ one, many }) => ({
  company: one(companies, {
    fields: [storageAccounts.companyId],
    references: [companies.id]
  }),
  credentials: one(storageCredentials, {
    fields: [storageAccounts.id],
    references: [storageCredentials.storageId]
  }),
  stats: one(storageStats, {
    fields: [storageAccounts.id],
    references: [storageStats.storageId]
  }),
  files: many(files)
}));

export const storageCredentialsRelations = relations(storageCredentials, ({ one }) => ({
  storage: one(storageAccounts, {
    fields: [storageCredentials.storageId],
    references: [storageAccounts.id]
  })
}));

export const storageStatsRelations = relations(storageStats, ({ one }) => ({
  storage: one(storageAccounts, {
    fields: [storageStats.storageId],
    references: [storageAccounts.id]
  })
}));