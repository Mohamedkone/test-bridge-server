// src/db/schema/rooms.ts
import { mysqlTable, varchar, timestamp, boolean, int, mysqlEnum, bigint } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { users } from './users';
import { files } from './files';
import { roomAccess } from './access';

// Define enum values as arrays for reference
export const ROOM_TYPES = ['vault', 'p2p'] as const;
export const ACCESS_LEVELS = ['private', 'company', 'guests'] as const;

export const rooms = mysqlTable('rooms', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  companyId: varchar('company_id', { length: 36 }).notNull(),
  createdById: varchar('created_by_id', { length: 36 }).notNull(),
  roomType: mysqlEnum('room_type', ROOM_TYPES).notNull(),
  accessLevel: mysqlEnum('access_level', ACCESS_LEVELS).notNull().default('private'),
  userLimit: int('user_limit').notNull().default(10),
  fileSizeLimit: bigint('file_size_limit', {mode: "number"}).notNull().default(5 * 1024 * 1024 * 1024), // 5GB
  fileExpiryDays: int('file_expiry_days').notNull().default(7),
  isLocked: boolean('is_locked').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Relations remain the same
export const roomsRelations = relations(rooms, ({ one, many }) => ({
  company: one(companies, {
    fields: [rooms.companyId],
    references: [companies.id]
  }),
  createdBy: one(users, {
    fields: [rooms.createdById],
    references: [users.id]
  }),
  access: many(roomAccess),
  files: many(files)
}));