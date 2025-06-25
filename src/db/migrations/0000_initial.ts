import { sql } from 'drizzle-orm';
import { mysqlTable, varchar, text, timestamp, boolean, json } from 'drizzle-orm/mysql-core';
import { createId } from '@paralleldrive/cuid2';

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
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

export const companies = mysqlTable('companies', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => createId()),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  logo: varchar('logo', { length: 255 }),
  website: varchar('website', { length: 255 }),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  settings: json('settings').$type<Record<string, any>>().default({}),
  metadata: json('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

export const userCompanies = mysqlTable('user_companies', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => createId()),
  userId: varchar('user_id', { length: 128 }).notNull().references(() => users.id),
  companyId: varchar('company_id', { length: 128 }).notNull().references(() => companies.id),
  role: varchar('role', { length: 50 }).notNull().default('member'),
  isDefault: boolean('is_default').notNull().default(false),
  metadata: json('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

export const userSessions = mysqlTable('user_sessions', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => createId()),
  userId: varchar('user_id', { length: 128 }).notNull().references(() => users.id),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  metadata: json('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

export const companyInvites = mysqlTable('company_invites', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => createId()),
  companyId: varchar('company_id', { length: 128 }).notNull().references(() => companies.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('member'),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  metadata: json('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow().onUpdateNow(),
});

export async function up(db: any) {
  await db.schema.createTable(users);
  await db.schema.createTable(companies);
  await db.schema.createTable(userCompanies);
  await db.schema.createTable(userSessions);
  await db.schema.createTable(companyInvites);
}

export async function down(db: any) {
  await db.schema.dropTable(companyInvites);
  await db.schema.dropTable(userSessions);
  await db.schema.dropTable(userCompanies);
  await db.schema.dropTable(companies);
  await db.schema.dropTable(users);
} 