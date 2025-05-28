// src/db/schema/access.ts
import { mysqlTable, varchar, timestamp, boolean, unique, text, json, int } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';
import { users } from './users';
import { rooms } from './rooms';

export const roomAccess = mysqlTable('room_access', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  roomId: varchar('room_id', { length: 36 }).notNull(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  accessType: varchar('access_type', { length: 50 }).notNull(), // owner, editor, viewer
  invitedById: varchar('invited_by_id', { length: 36 }),
  invitedAt: timestamp('invited_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (table) => ({
  // Ensure a user only has one access entry per room
  unq: unique().on(table.roomId, table.userId)
}));

export const guestLists = mysqlTable('guest_lists', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  companyId: varchar('company_id', { length: 36 }).notNull(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  addedById: varchar('added_by_id', { length: 36 }).notNull(),
  addedAt: timestamp('added_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (table) => ({
  // Ensure a user is only on a company's guest list once
  unq: unique().on(table.companyId, table.userId)
}));

// New table for advanced access control policies
export const accessControlPolicies = mysqlTable('access_control_policies', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  roomId: varchar('room_id', { length: 36 }),
  companyId: varchar('company_id', { length: 36 }).notNull(),
  createdById: varchar('created_by_id', { length: 36 }).notNull(),
  
  // Access restrictions
  allowedIpRanges: text('allowed_ip_ranges'), // Comma-separated list of allowed IP ranges
  deniedIpRanges: text('denied_ip_ranges'), // Comma-separated list of denied IP ranges
  timeRestrictions: json('time_restrictions').$type<{
    days?: string[]; // e.g., ["monday", "tuesday"]
    startTime?: string; // e.g., "09:00"
    endTime?: string; // e.g., "17:00"
    timezone?: string; // e.g., "America/New_York"
  }>(),
  
  // Feature restrictions
  allowDownloads: boolean('allow_downloads').notNull().default(true),
  allowSharing: boolean('allow_sharing').notNull().default(true),
  allowPrinting: boolean('allow_printing').notNull().default(true),
  maxConcurrentUsers: int('max_concurrent_users'),
  requireMfa: boolean('require_mfa').notNull().default(false),
  
  // Session control
  maxSessionLength: int('max_session_length'), // in minutes
  inactivityTimeout: int('inactivity_timeout'), // in minutes
  
  // Status and timestamps
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const roomAccessRelations = relations(roomAccess, ({ one }) => ({
  room: one(rooms, {
    fields: [roomAccess.roomId],
    references: [rooms.id]
  }),
  user: one(users, {
    fields: [roomAccess.userId],
    references: [users.id]
  }),
  invitedBy: one(users, {
    fields: [roomAccess.invitedById],
    references: [users.id]
  })
}));

export const guestListsRelations = relations(guestLists, ({ one }) => ({
  company: one(companies, {
    fields: [guestLists.companyId],
    references: [companies.id]
  }),
  user: one(users, {
    fields: [guestLists.userId],
    references: [users.id]
  }),
  addedBy: one(users, {
    fields: [guestLists.addedById],
    references: [users.id]
  })
}));

export const accessControlPoliciesRelations = relations(accessControlPolicies, ({ one }) => ({
  company: one(companies, {
    fields: [accessControlPolicies.companyId],
    references: [companies.id]
  }),
  room: one(rooms, {
    fields: [accessControlPolicies.roomId],
    references: [rooms.id]
  }),
  createdBy: one(users, {
    fields: [accessControlPolicies.createdById],
    references: [users.id]
  })
}));