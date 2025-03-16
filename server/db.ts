import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Function to check if we're in production environment
const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.DATABASE_URL) {
  if (isProduction) {
    console.error("DATABASE_URL environment variable is missing.");
    console.error("Please add DATABASE_URL to your deployment secrets.");
    process.exit(1);
  } else {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
}

// Handle database connection with retries in production
const connectWithRetry = (retries = 5, delay = 5000): Pool => {
  let lastError: Error | null = null;
  let attempts = retries;

  while (attempts > 0) {
    try {
      return new Pool({ connectionString: process.env.DATABASE_URL });
    } catch (error) {
      lastError = error as Error;
      if (attempts === 1) break;

      console.log(`Failed to connect to database. Retrying in ${delay/1000}s...`);
      // Sleep synchronously since we're in initialization code
      const waitTill = new Date(new Date().getTime() + delay);
      while (waitTill > new Date()) {}
      attempts--;
    }
  }

  console.error("Failed to connect to database after multiple attempts");
  throw lastError;
};

export const pool = connectWithRetry();
export const db = drizzle(pool, { schema });