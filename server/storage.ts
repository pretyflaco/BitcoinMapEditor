import { merchants, type Merchant, type InsertMerchant } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  createMerchant(merchant: InsertMerchant): Promise<Merchant>;
  getMerchant(id: number): Promise<Merchant | undefined>;
  getMerchants(): Promise<Merchant[]>;
}

export class DatabaseStorage implements IStorage {
  async createMerchant(merchant: InsertMerchant): Promise<Merchant> {
    const [newMerchant] = await db
      .insert(merchants)
      .values({
        ...merchant,
        // Convert numbers to strings for database compatibility
        latitude: merchant.latitude.toString(),
        longitude: merchant.longitude.toString(),
      })
      .returning();
    return newMerchant;
  }

  async getMerchant(id: number): Promise<Merchant | undefined> {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.id, id));
    return merchant;
  }

  async getMerchants(): Promise<Merchant[]> {
    return await db.select().from(merchants);
  }
}

export const storage = new DatabaseStorage();