import { pgTable, serial, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const incorrectImages = pgTable('incorrect_images', {
  id: serial('id').primaryKey(),
  imageUrl: text('image_url').notNull().unique(),
  restaurantId: varchar('restaurant_id', { length: 50 }),
  restaurantName: varchar('restaurant_name', { length: 255 }),
  reason: text('reason'), // Optional reason why it's incorrect
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type IncorrectImage = typeof incorrectImages.$inferSelect;
export type NewIncorrectImage = typeof incorrectImages.$inferInsert;

