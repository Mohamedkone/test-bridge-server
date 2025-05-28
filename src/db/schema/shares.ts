// src/db/schema/shares.ts
import { mysqlTable, varchar, timestamp, boolean, int, mysqlEnum, bigint } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { files } from './files';
import { users } from './users';

export const shares = mysqlTable('shares', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  fileId: varchar('file_id', { length: 36 }).notNull(),
  createdById: varchar('created_by_id', { length: 36 }).notNull(),
  accessLevel: mysqlEnum('access_level', ['read', 'write']).notNull(),
  expiresAt: timestamp('expires_at'),
  maxDownloads: int('max_downloads'),
  password: varchar('password', { length: 255 }),
  isPublic: boolean('is_public').notNull().default(false),
  downloadCount: int('download_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const sharesRelations = relations(shares, ({ one }) => ({
  file: one(files, {
    fields: [shares.fileId],
    references: [files.id]
  }),
  createdBy: one(users, {
    fields: [shares.createdById],
    references: [users.id]
  })
})); 