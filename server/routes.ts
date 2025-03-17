import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMerchantSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { request, gql } from 'graphql-request';

const BLINK_API = 'https://api.blink.sv/graphql';
const BITCOIN_JUNGLE_API = 'https://api.mainnet.bitcoinjungle.app/graphql';

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/merchants", async (req, res) => {
    try {
      const merchantData = insertMerchantSchema.parse(req.body);
      const merchant = await storage.createMerchant(merchantData);
      res.status(201).json(merchant);
    } catch (error) {
      if (error instanceof Error) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.get("/api/merchants", async (_req, res) => {
    try {
      const merchants = await storage.getMerchants();
      res.json(merchants);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch merchants" });
    }
  });

  app.get("/api/btcmap/merchants", async (_req, res) => {
    try {
      const response = await fetch("https://api.btcmap.org/v2/elements", {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'BTCMap-Frontend/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`BTCMap API error: ${response.statusText}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('BTCMap API error:', error);
      res.status(500).json({ 
        message: "Failed to fetch merchants from BTCMap",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/blink/merchants", async (_req, res) => {
    try {
      console.log('Querying Blink API...');
      const query = gql`
        query GetBusinessMapMarkers {
          businessMapMarkers {
            username
            mapInfo {
              coordinates {
                latitude
                longitude
              }
              title
            }
          }
        }
      `;

      const data = await request(
        BLINK_API,
        query,
        {},
        {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      );

      if (!data?.businessMapMarkers) {
        throw new Error('No business map markers returned from Blink API');
      }

      console.log('Blink API Response:', JSON.stringify(data, null, 2)); 

      res.json(data.businessMapMarkers);
    } catch (error) {
      console.error('Blink API error:', error);
      res.status(500).json({ 
        message: "Failed to fetch merchants from Blink",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/bitcoinjungle/introspection", async (_req, res) => {
    try {
      console.log('Querying Bitcoin Jungle API Schema...');
      const query = gql`
        query IntrospectionQuery {
          __schema {
            queryType {
              name
              fields {
                name
                description
                args {
                  name
                  description
                  type {
                    name
                    kind
                  }
                }
                type {
                  name
                  kind
                }
              }
            }
            types {
              name
              kind
              description
              fields {
                name
                description
              }
            }
          }
        }
      `;

      const data = await request(
        BITCOIN_JUNGLE_API,
        query,
        {},
        {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      );

      res.json(data);
    } catch (error) {
      console.error('Bitcoin Jungle API Schema error:', error);
      res.status(500).json({ 
        message: "Failed to fetch Bitcoin Jungle API schema",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/bitcoinjungle/merchants", async (_req, res) => {
    try {
      console.log('Querying Bitcoin Jungle API...');
      const query = gql`
        query {
          getAllBusinesses {
            id
            businessName
            address
            location {
              type
              coordinates
            }
            description
            category
            website
            instagram
            phone
            email
            deliveryAvailable
            payLightningScore
            createdAt
            updatedAt
          }
        }
      `;

      const data = await request(
        BITCOIN_JUNGLE_API,
        query,
        {},
        {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      );

      if (!data?.getAllBusinesses) {
        throw new Error('No businesses returned from Bitcoin Jungle API');
      }

      console.log('Bitcoin Jungle API Response:', JSON.stringify(data, null, 2));

      res.json(data.getAllBusinesses);
    } catch (error) {
      console.error('Bitcoin Jungle API error details:', {
        error,
        stack: error instanceof Error ? error.stack : undefined,
        url: BITCOIN_JUNGLE_API,
        query: query.toString()
      });
      res.status(500).json({ 
        message: "Failed to fetch merchants from Bitcoin Jungle",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}