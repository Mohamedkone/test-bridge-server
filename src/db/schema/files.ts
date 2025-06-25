// src/db/schema/files.ts
import { mysqlTable, varchar, timestamp, boolean, int, bigint, text, mysqlEnum } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { rooms } from './rooms';
import { users } from './users';
import { storageAccounts } from './storage';

export const FILE_TYPES = ['file', 'folder'] as const;
export const ENCRYPTION_TYPES = ['none', 'client_side', 'server_side'] as const;

export const files = mysqlTable('files', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 255 }),
  size: bigint('size', { mode: 'number' }).notNull().default(0),
  fileType: mysqlEnum('file_type', FILE_TYPES).notNull(),
  parentId: varchar('parent_id', { length: 36 }),
  storageId: varchar('storage_id', { length: 36 }).notNull(),
  roomId: varchar('room_id', { length: 36 }).notNull(),
  uploadedById: varchar('uploaded_by_id', { length: 36 }).notNull(),
  storageKey: varchar('storage_key', { length: 255 }),  // Path or key in storage
  encryption: mysqlEnum('encryption', ENCRYPTION_TYPES).notNull().default('none'),
  encryptionKeyId: varchar('encryption_key_id', { length: 255 }),
  metadata: text('metadata'),  // JSON metadata
  deleteAfter: timestamp('delete_after'),
  isDeleted: boolean('is_deleted').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
})

export const fileVersions = mysqlTable('file_versions', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  fileId: varchar('file_id', { length: 36 }).notNull(),
  versionNumber: int('version_number').notNull(),
  size: bigint('size', { mode: 'number' }).notNull(),
  storageKey: varchar('storage_key', { length: 255 }).notNull(),
  uploadedById: varchar('uploaded_by_id', { length: 36 }).notNull(),
  encryptionKeyId: varchar('encryption_key_id', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const fileShares = mysqlTable('file_shares', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  fileId: varchar('file_id', { length: 36 }).notNull(),
  createdById: varchar('created_by_id', { length: 36 }).notNull(),
  accessToken: varchar('access_token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at'),
  maxDownloads: int('max_downloads'),
  downloadCount: int('download_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const fileLogs = mysqlTable('file_logs', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  fileId: varchar('file_id', { length: 36 }).notNull(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  action: varchar('action', { length: 50 }).notNull(), // download, view, share, delete
  metadata: text('metadata'),  // Additional info (e.g., IP, device)
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const filesRelations = relations(files, ({ one, many }) => ({
  room: one(rooms, {
    fields: [files.roomId],
    references: [rooms.id]
  }),
  uploadedBy: one(users, {
    fields: [files.uploadedById],
    references: [users.id]
  }),
  parent: one(files, {
    fields: [files.parentId],
    references: [files.id]
  }),
  storage: one(storageAccounts, {
    fields: [files.storageId],
    references: [storageAccounts.id]
  }),
  versions: many(fileVersions),
  shares: many(fileShares),
  logs: many(fileLogs),
  children: many(files, { relationName: 'children' })
}));

export const fileVersionsRelations = relations(fileVersions, ({ one }) => ({
  file: one(files, {
    fields: [fileVersions.fileId],
    references: [files.id]
  }),
  uploadedBy: one(users, {
    fields: [fileVersions.uploadedById],
    references: [users.id]
  })
}));

export const fileSharesRelations = relations(fileShares, ({ one }) => ({
  file: one(files, {
    fields: [fileShares.fileId],
    references: [files.id]
  }),
  createdBy: one(users, {
    fields: [fileShares.createdById],
    references: [users.id]
  })
}));

export const fileLogsRelations = relations(fileLogs, ({ one }) => ({
  file: one(files, {
    fields: [fileLogs.fileId],
    references: [files.id]
  }),
  user: one(users, {
    fields: [fileLogs.userId],
    references: [users.id]
  })
}));