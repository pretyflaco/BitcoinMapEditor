import { merchants, type Merchant, type InsertMerchant } from "@shared/schema";

export interface IStorage {
  createMerchant(merchant: InsertMerchant): Promise<Merchant>;
  getMerchant(id: number): Promise<Merchant | undefined>;
  getMerchants(): Promise<Merchant[]>;
}

export class MemStorage implements IStorage {
  private merchants: Map<number, Merchant>;
  private currentId: number;

  constructor() {
    this.merchants = new Map();
    this.currentId = 1;
  }

  async createMerchant(merchant: InsertMerchant): Promise<Merchant> {
    const id = this.currentId++;
    const newMerchant: Merchant = { ...merchant, id, osmId: null };
    this.merchants.set(id, newMerchant);
    return newMerchant;
  }

  async getMerchant(id: number): Promise<Merchant | undefined> {
    return this.merchants.get(id);
  }

  async getMerchants(): Promise<Merchant[]> {
    return Array.from(this.merchants.values());
  }
}

export const storage = new MemStorage();
