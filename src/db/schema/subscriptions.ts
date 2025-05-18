// src/db/schema/subscriptions.ts
import { mysqlTable, varchar, timestamp, int, mysqlEnum, decimal, boolean, bigint, text } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';
import { companies } from './companies';

// Define enum values as arrays for reference
export const PLAN_TYPES = ['free', 'standard', 'premium', 'enterprise'] as const;
export const SUBSCRIPTION_STATUS = ['active', 'trialing', 'past_due', 'canceled', 'unpaid'] as const;
export const BILLING_CYCLES = ['monthly', 'annual'] as const;

export const plans = mysqlTable('plans', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  planType: mysqlEnum('plan_type', PLAN_TYPES).notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  billingCycle: mysqlEnum('billing_cycle', BILLING_CYCLES).notNull(),
  maxUsers: int('max_users').notNull(),
  maxStorage: bigint('max_storage', { mode: 'number' }).notNull(),
  maxRooms: int('max_rooms').notNull(),
  features: text('features').notNull(),  // JSON list of features
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const subscriptions = mysqlTable('subscriptions', {
  id: varchar('id', { length: 36 }).primaryKey().notNull(),
  companyId: varchar('company_id', { length: 36 }).notNull(),
  planId: varchar('plan_id', { length: 36 }).notNull(),
  status: mysqlEnum('status', SUBSCRIPTION_STATUS).notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'),
  canceledAt: timestamp('canceled_at'),
  paymentProviderId: varchar('payment_provider_id', { length: 255 }),  // e.g., Stripe subscription ID
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Relations remain the same
export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions)
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  company: one(companies, {
    fields: [subscriptions.companyId],
    references: [companies.id]
  }),
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id]
  })
}));