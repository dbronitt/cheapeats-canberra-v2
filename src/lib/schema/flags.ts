import { pgTable, serial, varchar, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { restaurants } from './restaurants';

export const restaurantFlags = pgTable('restaurant_flags', {
  id: serial('id').primaryKey(),
  restaurantId: integer('restaurant_id').references(() => restaurants.id).notNull(),
  restaurantName: varchar('restaurant_name', { length: 255 }),
  flagType: varchar('flag_type', { length: 50 }).notNull(), // "wrong_hours", "deal_doesnt_exist", "shut_down", "not_on_eatclub", "other"
  description: text('description').notNull(),
  reportedBy: varchar('reported_by', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // "pending", "resolved", "dismissed"
  resolvedBy: varchar('resolved_by', { length: 255 }),
  resolvedAt: timestamp('resolved_at'),
  resolutionNotes: text('resolution_notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type RestaurantFlag = typeof restaurantFlags.$inferSelect;
export type NewRestaurantFlag = typeof restaurantFlags.$inferInsert;

