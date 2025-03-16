import { pgTable, text, serial, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const merchants = pgTable("merchants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  description: text("description").notNull(),
  latitude: numeric("latitude").notNull(),
  longitude: numeric("longitude").notNull(),
  osmId: text("osm_id"),
  type: text("type").notNull(),
  website: text("website"),
  phone: text("phone"),
});

export const insertMerchantSchema = createInsertSchema(merchants)
  .omit({ id: true, osmId: true })
  .extend({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    type: z.enum([
      "restaurant",
      "cafe",
      "shop",
      "bar",
      "hotel",
      "other"
    ]),
    website: z.string().url().optional(),
    phone: z.string().regex(/^\+?[\d\s-]+$/).optional(),
  });

export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type Merchant = typeof merchants.$inferSelect;