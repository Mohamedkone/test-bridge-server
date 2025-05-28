// src/db/schema/companies.ts
import { mysqlTable, varchar, text, timestamp, int, json, boolean } from 'drizzle-orm/mysql-core';
import { createId } from '@paralleldrive/cuid2';

export const companies = mysqlTable('companies', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => createId()),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  website: varchar('website', { length: 255 }),
  logo: varchar('logo', { length: 255 }),
  industry: varchar('industry', { length: 50 }),
  size: varchar('size', { length: 20 }),
  location: varchar('location', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
});

export const companyMembers = mysqlTable('company_members', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => createId()),
  companyId: varchar('company_id', { length: 128 }).notNull().references(() => companies.id),
  userId: varchar('user_id', { length: 128 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
});

export const companySettings = mysqlTable('company_settings', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => createId()),
  companyId: varchar('company_id', { length: 128 }).notNull().references(() => companies.id),
  allowGuestUploads: boolean('allow_guest_uploads').default(false).notNull(),
  maxFileSize: int('max_file_size').default(100).notNull(), // in MB
  allowedFileTypes: json('allowed_file_types').$type<string[]>().default([]).notNull(),
  storageQuota: int('storage_quota').default(1000).notNull(), // in MB
  customBranding: json('custom_branding').$type<{
    logo?: string;
    colors?: {
      primary?: string;
      secondary?: string;
    };
  }>(),
  notifications: json('notifications').$type<{
    email?: boolean;
    push?: boolean;
    webhook?: string;
  }>(),
  security: json('security').$type<{
    requireApproval: boolean;
    passwordProtected: boolean;
    expirationDays?: number;
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
});

export const companyInvites = mysqlTable('company_invites', {
  id: varchar('id', { length: 128 }).primaryKey().$defaultFn(() => createId()),
  companyId: varchar('company_id', { length: 128 }).notNull().references(() => companies.id),
  email: varchar('email', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  token: varchar('token', { length: 128 }).notNull().unique(),
  status: varchar('status', { length: 20 }).default('pending').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull()
});