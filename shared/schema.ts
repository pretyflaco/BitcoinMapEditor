import { z } from "zod";

export const insertMerchantSchema = z.object({
  name: z.string().min(1, "Name is required"),
  country: z.string().optional(),
  address: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  type: z.string().optional(),
  paymentMethods: z.array(
    z.enum(["onchain", "lightning", "lightning_contactless"])
  ).optional(),
  website: z.string().url().optional().or(z.literal('')),
  phone: z.string().regex(/^\+?[\d\s-]+$/).optional().or(z.literal('')),
  openingHours: z.string().optional().or(z.literal('')),
  twitterMerchant: z.string().optional(),
  twitterSubmitter: z.string().optional(),
  notes: z.string().optional(),
  dataSource: z.enum([
    "I am the business owner",
    "I visited as a customer",
    "Other method"
  ]).optional(),
  contact: z.string().email("Invalid email format").optional().or(z.literal(''))
});

export type InsertMerchant = z.infer<typeof insertMerchantSchema>;

// Type for merchant data returned from various APIs
export type Merchant = {
  id: string | number;
  name: string;
  latitude: number;
  longitude: number;
  type?: string;
  address?: string;
  website?: string;
  phone?: string;
};