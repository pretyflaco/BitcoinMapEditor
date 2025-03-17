import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMerchantSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { request, gql } from 'graphql-request';

const BLINK_API = 'https://api.blink.sv/graphql';
const BITCOIN_JUNGLE_API = 'https://api.mainnet.bitcoinjungle.app/graphql';

export async function registerRoutes(app: Express): Promise<Server> {
  // Add a status endpoint to verify server is running
  app.get("/api/status", (_req, res) => {
    res.json({ status: "ok" });
  });

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

  app.get("/api/bitcoinjungle/merchants", async (_req, res) => {
    try {
      console.log('Fetching Bitcoin Jungle merchants from /api/list endpoint...');

      const response = await fetch('https://maps.bitcoinjungle.app/api/list', {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch merchants');
      }

      const data = await response.json();

      if (!data) {
        throw new Error('No merchants returned from Bitcoin Jungle API');
      }

      console.log('Bitcoin Jungle API Response:', JSON.stringify(data, null, 2));

      res.json(data);
    } catch (error) {
      console.error('Bitcoin Jungle API error details:', {
        error,
        stack: error instanceof Error ? error.stack : undefined
      });
      res.status(500).json({ 
        message: "Failed to fetch merchants from Bitcoin Jungle",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/bitcoinpeople/merchants", async (_req, res) => {
    try {
      console.log('Fetching Bitcoin People merchants...');
      const response = await fetch(
        'https://maps.googleapis.com/maps/api/place/js/PlaceService.GetPlaceDetails?2sen&6e13&10e3&12sTR&14m1&1sChIJz-aftGgcOBMRT57kFIWVQ3U&17m1&2e1&r_url=https%3A%2F%2Fwww.google.com%2Fmaps%2Fd%2Fembed&callback=_xdc_._tikavl&client=google-maps-pro&token=58636',
        {
          headers: {
            'Accept': '*/*',
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://www.google.com/'
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch Bitcoin People merchants');
      }

      // Get the response text since it's JSONP
      const text = await response.text();

      // Extract the JSON from the JSONP callback
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}') + 1;
      const jsonStr = text.substring(jsonStart, jsonEnd);

      // Parse the JSON
      const data = JSON.parse(jsonStr);

      // Transform the data into our format
      const merchants = {
        locations: data.result?.reviews?.map((review: any) => ({
          id: review.time,
          name: review.author_name,
          coordinates: {
            latitude: review.location?.lat,
            longitude: review.location?.lng
          },
          description: review.text,
          website: review.author_url,
          categories: []
        })) || []
      };

      console.log('Bitcoin People API Response:', JSON.stringify(merchants, null, 2));
      res.json(merchants);
    } catch (error) {
      console.error('Bitcoin People API error:', error);
      res.status(500).json({ 
        message: "Failed to fetch merchants from Bitcoin People",
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

  const httpServer = createServer(app);
  return httpServer;
}