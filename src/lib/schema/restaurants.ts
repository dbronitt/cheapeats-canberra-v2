import { pgTable, serial, varchar, numeric, jsonb, timestamp, text } from 'drizzle-orm/pg-core';

export const restaurants = pgTable('restaurants', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  address: text('address'),
  suburb: varchar('suburb', { length: 100 }),
  latitude: numeric('latitude', { precision: 10, scale: 7 }),
  longitude: numeric('longitude', { precision: 10, scale: 7 }),
  phone: varchar('phone', { length: 50 }),
  websiteUrl: text('website_url'),
  priceRange: varchar('price_range', { length: 10 }), // "$", "$$", "$$$", "$$$$"
  businessType: varchar('business_type', { length: 50 }), // "Restaurant", "Cafe", "Bar"
  cuisine: varchar('cuisine', { length: 100 }),
  openingHours: jsonb('opening_hours'), // { monday: "9:00 AM - 5:00 PM", ... }
  imageUrl: text('image_url'), // Deprecated, use imageUrls
  imageUrls: jsonb('image_urls'), // Array of image URLs
  eatClubUrl: text('eat_club_url'),
  firstTableUrl: text('first_table_url'),
  happyHour: jsonb('happy_hour'), // { days: string[], hours: string, description: string }
  weeklySpecials: jsonb('weekly_specials'), // [{ day: string, description: string }]
  deals: jsonb('deals'), // [{ title: string, description: string, validUntil: string }]
  previousDeals: jsonb('previous_deals'), // Archived deals
  overallRating: numeric('overall_rating', { precision: 3, scale: 2 }),
  googlePlaceId: varchar('google_place_id', { length: 255 }),
  foursquarePlaceId: varchar('foursquare_place_id', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('active'), // "active", "inactive", "closed"
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Restaurant = typeof restaurants.$inferSelect;
export type NewRestaurant = typeof restaurants.$inferInsert;

