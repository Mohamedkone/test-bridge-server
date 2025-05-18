// src/db/schema/companies.ts
import { mysqlTable, varchar, timestamp, boolean, int, text, mysqlEnum, bigint } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { subscriptions } from './subscriptions';
import { storageAccounts } from './storage';
import { rooms } from './rooms';
import { guestLists } from './access';

export const companies = mysqlTable('companies', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  logo: varchar('logo', { length: 255 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const companySettings = mysqlTable('company_settings', {
  companyId: varchar('company_id', { length: 36 }).primaryKey().notNull(),
  trackDownloads: boolean('track_downloads').notNull().default(true),
  maxFileSize: bigint('max_file_size',{mode:"number"}).notNull().default(10 * 1024 * 1024 * 1024), // 10GB default
  maxUserCount: int('max_user_count').notNull().default(10),
  roomLimit: int('room_limit').notNull().default(5),
  defaultStorageId: varchar('default_storage_id', { length: 36 }),
  settings: text('settings').notNull(), // JSON settings
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const companiesRelations = relations(companies, ({ many, one }) => ({
  usersConnection: many(userCompanyRoles),
  subscriptions: many(subscriptions),
  storageAccounts: many(storageAccounts),
  rooms: many(rooms),
  settings: one(companySettings, {
    fields: [companies.id],
    references: [companySettings.companyId]
  }),
  guestLists: many(guestLists)
}));

export const companySettingsRelations = relations(companySettings, ({ one }) => ({
  company: one(companies, {
    fields: [companySettings.companyId],
    references: [companies.id]
  })
}));

// Relationship table for users and companies
export const userCompanyRoles = mysqlTable('user_company_roles', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  companyId: varchar('company_id', { length: 36 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(), // admin, member, etc.
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const userCompanyRolesRelations = relations(userCompanyRoles, ({ one }) => ({
  user: one(users, {
    fields: [userCompanyRoles.userId],
    references: [users.id]
  }),
  company: one(companies, {
    fields: [userCompanyRoles.companyId],
    references: [companies.id]
  })
}));