import { pgTable, serial, varchar, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const pageViews = pgTable('page_views', {
  id: serial('id').primaryKey(),
  path: varchar('path', { length: 500 }).notNull(),
  userAgent: text('user_agent'),
  ip: varchar('ip', { length: 45 }),
  sessionId: varchar('session_id', { length: 255 }),
  referrer: text('referrer'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const uniqueVisitors = pgTable('unique_visitors', {
  id: serial('id').primaryKey(),
  sessionId: varchar('session_id', { length: 255 }).notNull().unique(),
  visitCount: integer('visit_count').notNull().default(1),
  firstVisit: timestamp('first_visit').notNull().defaultNow(),
  lastVisit: timestamp('last_visit').notNull().defaultNow(),
});

export type PageView = typeof pageViews.$inferSelect;
export type NewPageView = typeof pageViews.$inferInsert;
export type UniqueVisitor = typeof uniqueVisitors.$inferSelect;
export type NewUniqueVisitor = typeof uniqueVisitors.$inferInsert;

