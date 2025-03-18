import { z } from "zod";

export const insertMerchantSchema = z.object({
  name: z.string().min(1, "Name is required"),
  country: z.string().optional(),
  address: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  type: z.string(),
  paymentMethods: z.array(z.string()).optional(),
  website: z.string().url().optional(),
  phone: z.string().regex(/^\+?[\d\s-]+$/).optional(),
  openingHours: z.string().optional(),
  twitterMerchant: z.string().optional(),
  twitterSubmitter: z.string().optional(),
  notes: z.string().optional(),
  dataSource: z.string().optional(),
  details: z.string().optional(),
  contact: z.string().optional(),
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