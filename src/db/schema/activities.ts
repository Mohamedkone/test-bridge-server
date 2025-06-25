import { mysqlTable, varchar, timestamp, mysqlEnum, text } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { files } from './files';
import { rooms } from './rooms';
import { companies } from './companies';

export const activities = mysqlTable('activities', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  fileId: varchar('file_id', { length: 36 }),
  roomId: varchar('room_id', { length: 36 }),
  companyId: varchar('company_id', { length: 36 }),
  action: mysqlEnum('action', [
    'upload',
    'download',
    'share',
    'delete',
    'restore',
    'move',
    'rename',
    'create_folder',
    'join_room',
    'leave_room',
    'update_permissions',
    'login',
    'logout',
    'password_change',
    'view',
    'print',
    'copy',
    'admin_action',
    'system_event',
    'subscription_change'
  ]).notNull(),
  metadata: text('metadata'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const activitiesRelations = relations(activities, ({ one }) => ({
  user: one(users, {
    fields: [activities.userId],
    references: [users.id]
  }),
  file: one(files, {
    fields: [activities.fileId],
    references: [files.id]
  }),
  room: one(rooms, {
    fields: [activities.roomId],
    references: [rooms.id]
  }),
  company: one(companies, {
    fields: [activities.companyId],
    references: [companies.id]
  })
})); 