// src/db/schema/access.ts
import { mysqlTable, varchar, timestamp, boolean, unique } from 'drizzle-orm/mysql-core';
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