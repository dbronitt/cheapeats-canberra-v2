import { pgTable, serial, varchar, text, jsonb, timestamp, integer, numeric } from 'drizzle-orm/pg-core';
import { restaurants } from './restaurants';

export const restaurantSubmissions = pgTable('restaurant_submissions', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address'),
  suburb: varchar('suburb', { length: 100 }),
  latitude: numeric('latitude', { precision: 10, scale: 7 }),
  longitude: numeric('longitude', { precision: 10, scale: 7 }),
  phone: varchar('phone', { length: 50 }),
  websiteUrl: text('website_url'),
  businessType: varchar('business_type', { length: 50 }),
  cuisine: varchar('cuisine', { length: 100 }),
  priceRange: varchar('price_range', { length: 10 }),
  description: text('description'),
  submittedBy: varchar('submitted_by', { length: 255 }),
  submissionType: varchar('submission_type', { length: 50 }), // "happy_hour", "weekly_special", "deal", or null
  happyHour: jsonb('happy_hour'),
  weeklySpecial: jsonb('weekly_special'),
  deal: jsonb('deal'),
  dealDescription: text('deal_description'),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // "pending", "approved", "rejected"
  reviewedBy: varchar('reviewed_by', { length: 255 }),
  reviewedAt: timestamp('reviewed_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const dealSubmissions = pgTable('deal_submissions', {
  id: serial('id').primaryKey(),
  restaurantId: integer('restaurant_id').references(() => restaurants.id).notNull(),
  restaurantName: varchar('restaurant_name', { length: 255 }),
  submissionType: varchar('submission_type', { length: 50 }).notNull(), // "happy_hour", "weekly_special", "deal"
  happyHour: jsonb('happy_hour'),
  weeklySpecial: jsonb('weekly_special'),
  deal: jsonb('deal'),
  description: text('description'),
  submittedBy: varchar('submitted_by', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  reviewedBy: varchar('reviewed_by', { length: 255 }),
  reviewedAt: timestamp('reviewed_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type RestaurantSubmission = typeof restaurantSubmissions.$inferSelect;
export type NewRestaurantSubmission = typeof restaurantSubmissions.$inferInsert;
export type DealSubmission = typeof dealSubmissions.$inferSelect;
export type NewDealSubmission = typeof dealSubmissions.$inferInsert;

