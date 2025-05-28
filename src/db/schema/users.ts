// src/db/schema/users.ts
import { mysqlTable, varchar, timestamp, text, boolean, int, json } from 'drizzle-orm/mysql-core';
import { createId } from '@paralleldrive/cuid2';
import { relations } from 'drizzle-orm';
import { guestLists } from './access';

// Define enum values as arrays for reference
export const USER_ROLES = ['admin', 'user', 'guest'] as const;
export const USER_TYPES = ['b2c', 'b2b'] as const;

// Use MySQL's enum type correctly
export const users = mysqlTable('users', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => createId()),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 100 }),
  lastName: varchar('last_name', { length: 100 }),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  isGuest: boolean('is_guest').notNull().default(false),
  lastLoginAt: timestamp('last_login_at'),
  metadata: json('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow()
});

export const userCompanies = mysqlTable('user_companies', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => createId()),
  userId: varchar('user_id', { length: 128 }).notNull().references(() => users.id),
  companyId: varchar('company_id', { length: 128 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('member'),
  isDefault: boolean('is_default').notNull().default(false),
  metadata: json('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow()
});

export const userSessions = mysqlTable('user_sessions', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => createId()),
  userId: varchar('user_id', { length: 128 }).notNull().references(() => users.id),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  metadata: json('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow()
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  companies: many(userCompanies),
  sessions: many(userSessions),
  guestListEntries: many(guestLists)
}));