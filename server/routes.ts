import type { Express } from "express";
import { createServer, type Server } from "http";
import { insertMerchantSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { request, gql } from 'graphql-request';
import { ZodError } from "zod";
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const BLINK_API = process.env.BLINK_API || 'https://api.blink.sv/graphql';
const BITCOIN_JUNGLE_API = process.env.BITCOIN_JUNGLE_API || 'https://api.mainnet.bitcoinjungle.app/graphql';

// Check for required environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

if (!GITHUB_TOKEN || !GITHUB_REPO) {
  console.error('Missing required environment variables: GITHUB_TOKEN and/or GITHUB_REPO');
  process.exit(1);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Add a status endpoint to verify server is running
  app.get("/api/status", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Updated /api/merchants endpoint to aggregate data from all sources
  app.get("/api/merchants", async (_req, res) => {
    try {
      // Fetch data from all sources in parallel
      const [btcMapResponse, blinkResponse, bitcoinJungleResponse] = await Promise.allSettled([
        fetch("https://api.btcmap.org/v2/elements", {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'BTCMap-Frontend/1.0'
          }
        }),
        request(
          BLINK_API,
          gql`
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
          `,
          {},
          {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        ),
        fetch('https://maps.bitcoinjungle.app/api/list', {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        })
      ]);

      // Process BTCMap data
      let btcMapData = [];
      if (btcMapResponse.status === 'fulfilled' && btcMapResponse.value.ok) {
        btcMapData = await btcMapResponse.value.json();
      }

      // Process Blink data
      let blinkData = [];
      if (blinkResponse.status === 'fulfilled') {
        blinkData = blinkResponse.value.businessMapMarkers || [];
      }

      // Process Bitcoin Jungle data
      let bitcoinJungleData = [];
      if (bitcoinJungleResponse.status === 'fulfilled' && bitcoinJungleResponse.value.ok) {
        const response = await bitcoinJungleResponse.value.json();
        bitcoinJungleData = response.locations || [];
      }

      // Return combined data
      res.json({
        btcmap: btcMapData,
        blink: blinkData,
        bitcoinjungle: bitcoinJungleData
      });

    } catch (error) {
      console.error('Error fetching merchants:', error);
      res.status(500).json({
        message: "Failed to fetch merchants",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/merchants", async (req, res) => {
    try {
      const merchantData = insertMerchantSchema.parse(req.body);

      // Get country from coordinates using Nominatim OpenStreetMap API
      let country = '';
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${merchantData.latitude}&lon=${merchantData.longitude}&zoom=3&accept-language=en`,
          {
            headers: {
              'User-Agent': 'BitcoinMapEditor/1.0',
              'Accept': 'application/json',
              'Accept-Language': 'en'
            }
          }
        );

        if (!response.ok) {
          throw new Error(`Nominatim API error: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Nominatim API response:', data);

        if (data.address && data.address.country) {
          country = data.address.country;
          console.log('Found country:', country);
        } else {
          console.warn('No country found in Nominatim response:', data);
        }
      } catch (error) {
        console.error('Error getting country from coordinates:', error);
        // Continue with empty country if geocoding fails
      }

      // Format the issue body according to the specified template
      const issueBody = `
Merchant name: ${merchantData.name}
Country: ${country}
Communities:
Address: ${merchantData.address || ''}
Lat: ${merchantData.latitude}
Long: ${merchantData.longitude}
OSM: https://www.openstreetmap.org/edit#map=21/${merchantData.latitude}/${merchantData.longitude}
Category: ${merchantData.type || ''}
Payment methods: ${merchantData.paymentMethods?.join(',') || ''}
Website: ${merchantData.website || ''}
Phone: ${merchantData.phone || ''}
Opening hours: ${merchantData.openingHours || ''}
Twitter merchant: ${merchantData.twitterMerchant || ''}
Twitter submitter: ${merchantData.twitterSubmitter || ''}
Notes: ${merchantData.notes || ''}
Data Source: ${merchantData.dataSource || 'User Submission'}
Contact: ${merchantData.contact || ''}
Status: Todo
Created at: ${new Date().toISOString()}
`;

      // Create GitHub issue
      const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: merchantData.name,
          body: issueBody,
          labels: [
            ...(country ? [country] : []),
            'good first issue',
            'help wanted',
            { name: 'blink-submission', description: 'Submitted from Blink Map' }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const issue = await response.json();
      res.status(201).json({
        message: "Merchant suggestion submitted successfully",
        issueUrl: issue.html_url
      });
    } catch (error) {
      console.error('Error creating merchant suggestion:', error);
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        res.status(400).json({ message: validationError.message });
      } else {
        res.status(500).json({ message: "Failed to submit merchant suggestion" });
      }
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
      res.json(data);
    } catch (error) {
      console.error('Bitcoin Jungle API error:', error);
      res.status(500).json({
        message: "Failed to fetch merchants from Bitcoin Jungle",
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