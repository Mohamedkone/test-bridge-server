// src/db/schema/users.ts
import { mysqlTable, varchar, timestamp, boolean, int, mysqlEnum } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { userCompanyRoles } from './companies';
import { guestLists } from './access';

// Define enum values as arrays for reference
export const USER_ROLES = ['admin', 'user', 'guest'] as const;
export const USER_TYPES = ['b2c', 'b2b'] as const;

// Use MySQL's enum type correctly
export const users = mysqlTable('users', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  profilePicture: varchar('profile_picture', { length: 255 }),
  auth0Id: varchar('auth0_id', { length: 255 }).unique(), // Auth0 identifier
  userType: mysqlEnum('user_type', USER_TYPES).notNull().default('b2c'),
  isActive: boolean('is_active').notNull().default(true),
  isVerified: boolean('is_verified').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Relations remain the same
export const usersRelations = relations(users, ({ many }) => ({
  companiesConnection: many(userCompanyRoles),
  guestListEntries: many(guestLists)
}));