// src/db/schema/finder.ts
import { mysqlTable, varchar, timestamp, text, index, bigint, int, boolean } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { companies } from './companies';
import { files } from './files';
import { rooms } from './rooms';

// Saved searches table
export const savedSearches = mysqlTable('saved_searches', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  companyId: varchar('company_id', { length: 36 }),  // Optional, for company-wide searches
  name: varchar('name', { length: 255 }).notNull(),
  searchType: varchar('search_type', { length: 50 }).notNull(), // files, rooms, users, etc.
  searchParams: text('search_params').notNull(),  // JSON with search parameters
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (table) => ({
  // Add indexes for faster lookups
  userIdx: index('user_idx').on(table.userId),
  companyIdx: index('company_idx').on(table.companyId),
  typeIdx: index('type_idx').on(table.searchType),
}));

// Search history for analytics and quick re-runs
export const searchHistory = mysqlTable('search_history', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  searchType: varchar('search_type', { length: 50 }).notNull(),
  searchParams: text('search_params').notNull(),
  resultCount: int('result_count').notNull(),
  executionTimeMs: int('execution_time_ms'),  // For performance monitoring
  createdAt: timestamp('created_at').notNull().defaultNow()
}, (table) => ({
  userIdx: index('user_idx').on(table.userId),
  createdIdx: index('created_idx').on(table.createdAt),
}));

// File search index to optimize complex searches
export const fileSearchIndex = mysqlTable('file_search_index', {
  fileId: varchar('file_id', { length: 36 }).primaryKey().notNull(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }),
  fileSize: bigint('file_size', { mode: 'number' }),
  createdById: varchar('created_by_id', { length: 36 }),
  companyId: varchar('company_id', { length: 36 }),
  roomId: varchar('room_id', { length: 36 }),
  tags: text('tags'),  // JSON array of tags
  updatedAt: timestamp('updated_at').notNull()
}, (table) => ({
  // Add several indexes to support different search scenarios
  nameIdx: index('name_idx').on(table.fileName),
  mimeIdx: index('mime_idx').on(table.mimeType),
  createdByIdx: index('created_by_idx').on(table.createdById),
  companyIdx: index('company_idx').on(table.companyId),
  roomIdx: index('room_idx').on(table.roomId),
  updatedIdx: index('updated_idx').on(table.updatedAt)
}));

// Relations
export const savedSearchesRelations = relations(savedSearches, ({ one }) => ({
  user: one(users, {
    fields: [savedSearches.userId],
    references: [users.id]
  }),
  company: one(companies, {
    fields: [savedSearches.companyId],
    references: [companies.id]
  })
}));

export const searchHistoryRelations = relations(searchHistory, ({ one }) => ({
  user: one(users, {
    fields: [searchHistory.userId],
    references: [users.id]
  })
}));

export const fileSearchIndexRelations = relations(fileSearchIndex, ({ one }) => ({
  file: one(files, {
    fields: [fileSearchIndex.fileId],
    references: [files.id]
  }),
  createdBy: one(users, {
    fields: [fileSearchIndex.createdById],
    references: [users.id]
  }),
  company: one(companies, {
    fields: [fileSearchIndex.companyId],
    references: [companies.id]
  }),
  room: one(rooms, {
    fields: [fileSearchIndex.roomId],
    references: [rooms.id]
  })
}));