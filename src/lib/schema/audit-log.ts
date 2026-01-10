import { pgTable, serial, integer, jsonb, timestamp, varchar, text } from 'drizzle-orm/pg-core';
import { restaurants } from './restaurants';

export const restaurantAuditLog = pgTable('restaurant_audit_log', {
  id: serial('id').primaryKey(),
  restaurantId: integer('restaurant_id').references(() => restaurants.id).notNull(),
  restaurantName: varchar('restaurant_name', { length: 255 }), // Store name for reference even if restaurant is deleted
  action: varchar('action', { length: 50 }).notNull(), // 'create', 'update', 'delete'
  changedBy: varchar('changed_by', { length: 255 }), // User/admin who made the change
  changes: jsonb('changes').notNull(), // { field: { old: value, new: value } }
  previousState: jsonb('previous_state'), // Full previous state of restaurant (for revert)
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type RestaurantAuditLog = typeof restaurantAuditLog.$inferSelect;
export type NewRestaurantAuditLog = typeof restaurantAuditLog.$inferInsert;
