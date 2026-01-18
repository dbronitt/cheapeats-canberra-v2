import { pgTable, serial, varchar, text, timestamp } from 'drizzle-orm/pg-core';

export const contactSubmissions = pgTable('contact_submissions', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  query: text('query').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // "pending", "responded", "archived"
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type ContactSubmission = typeof contactSubmissions.$inferSelect;
export type NewContactSubmission = typeof contactSubmissions.$inferInsert;
