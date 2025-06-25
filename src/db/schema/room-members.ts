import { mysqlTable, varchar, timestamp, index, primaryKey } from 'drizzle-orm/mysql-core';
import { rooms } from './rooms';
import { users } from './users';

export const roomMembers = mysqlTable('room_members', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  roomId: varchar('room_id', { length: 36 }).notNull().references(() => rooms.id),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => users.id),
  role: varchar('role', { length: 50 }).notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (table) => {
  return {
    roomIdIdx: index('room_id_idx').on(table.roomId),
    userIdIdx: index('user_id_idx').on(table.userId),
    roomUserComposite: primaryKey(table.roomId, table.userId)
  };
}); 