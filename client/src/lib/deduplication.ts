import stringSimilarity from 'string-similarity';
import * as turf from '@turf/turf';

// Configuration options for deduplication
export const DEDUP_CONFIG = {
  NAME_SIMILARITY_THRESHOLD: 0.55,  // Lowered to catch more edge cases with varying names
  DISTANCE_THRESHOLD: 100,         // 100 meters
  GRID_SIZE: 0.01,                // Roughly 1km grid cells
  NAME_WEIGHT: 0.7,               // Increased weight for name similarity
  LOCATION_WEIGHT: 0.3,           // Decreased weight for location proximity
};

// Helper to clean merchant names for comparison
function cleanMerchantName(name: string): string {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove diacritics (é -> e)
    .replace(/[^\w\s]/g, ' ')  // Replace special characters with spaces
    .replace(/\b(cafe|café|restaurant|bar|shop|store|ltd|inc|limited|llc|attorney|notary|law|firm|lawyer|abogado|legal|salvadoran|el salvador|and|&|the|specialty|roasters|bit|bitcofe|bitcoin)\b/g, '')  // Remove common business words
    .trim()
    .replace(/\s+/g, ' '); // Normalize spaces
}

// Calculate Haversine distance between two points in meters
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const point1 = turf.point([lon1, lat1]);
  const point2 = turf.point([lon2, lat2]);
  return turf.distance(point1, point2, { units: 'meters' });
}

// Calculate similarity score between two merchants
function calculateSimilarityScore(
  merchant1: {
    name: string;
    latitude: number;
    longitude: number;
  },
  merchant2: {
    name: string;
    latitude: number;
    longitude: number;
  }
): number {
  // Calculate name similarity with cleaned names
  const name1 = cleanMerchantName(merchant1.name);
  const name2 = cleanMerchantName(merchant2.name);
  const nameSimilarity = stringSimilarity.compareTwoStrings(name1, name2);

  // Calculate distance and convert to a similarity score (1 - normalized distance)
  const distance = calculateDistance(
    merchant1.latitude,
    merchant1.longitude,
    merchant2.latitude,
    merchant2.longitude
  );
  const distanceSimilarity = Math.max(0, 1 - (distance / DEDUP_CONFIG.DISTANCE_THRESHOLD));

  // Combine scores using weights
  return (
    DEDUP_CONFIG.NAME_WEIGHT * nameSimilarity +
    DEDUP_CONFIG.LOCATION_WEIGHT * distanceSimilarity
  );
}

// Create a spatial grid key for a location
function getGridKey(latitude: number, longitude: number): string {
  const latGrid = Math.floor(latitude / DEDUP_CONFIG.GRID_SIZE);
  const lonGrid = Math.floor(longitude / DEDUP_CONFIG.GRID_SIZE);
  return `${latGrid},${lonGrid}`;
}

// Get adjacent grid cells
function getAdjacentGridKeys(gridKey: string): string[] {
  const [latGrid, lonGrid] = gridKey.split(',').map(Number);
  const adjacent: string[] = [];

  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      adjacent.push(`${latGrid + i},${lonGrid + j}`);
    }
  }

  return adjacent;
}

// Main deduplication function
export function deduplicateMerchants(
  btcMapMerchants: any[],
  blinkMerchants: any[],
  bitcoinJungleMerchants: any[]
): { blinkMerchants: any[], bitcoinJungleMerchants: any[], stats: any } {
  // Create spatial index for BTCMap merchants
  const btcMapGrid: Record<string, any[]> = {};

  btcMapMerchants.forEach(merchant => {
    const lat = merchant.osm_json.lat;
    const lon = merchant.osm_json.lon;
    const gridKey = getGridKey(lat, lon);

    if (!btcMapGrid[gridKey]) {
      btcMapGrid[gridKey] = [];
    }
    btcMapGrid[gridKey].push({
      name: merchant.osm_json?.tags?.name || '',
      latitude: lat,
      longitude: lon,
      original: merchant
    });
  });

  // Function to check if a merchant is a duplicate
  function isDuplicate(merchant: any, source: 'blink' | 'bitcoinjungle'): boolean {
    let lat, lon, name;

    if (source === 'blink') {
      lat = merchant.mapInfo.coordinates.latitude;
      lon = merchant.mapInfo.coordinates.longitude;
      name = merchant.mapInfo.title;
    } else {
      lat = merchant.coordinates.latitude;
      lon = merchant.coordinates.longitude;
      name = merchant.name;
    }

    const gridKey = getGridKey(lat, lon);
    const adjacentKeys = getAdjacentGridKeys(gridKey);

    // Check all adjacent grid cells for potential duplicates
    for (const key of adjacentKeys) {
      const cellMerchants = btcMapGrid[key] || [];

      for (const btcMerchant of cellMerchants) {
        const similarityScore = calculateSimilarityScore(
          { name, latitude: lat, longitude: lon },
          btcMerchant
        );

        if (similarityScore >= DEDUP_CONFIG.NAME_SIMILARITY_THRESHOLD) {
          console.log(`Found duplicate: "${name}" matches "${btcMerchant.name}" with score ${similarityScore}`);
          return true;
        }
      }
    }

    return false;
  }

  // Filter out duplicates
  const uniqueBlinkMerchants = blinkMerchants.filter(
    merchant => !isDuplicate(merchant, 'blink')
  );

  const uniqueBitcoinJungleMerchants = bitcoinJungleMerchants.filter(
    merchant => !isDuplicate(merchant, 'bitcoinjungle')
  );

  // Compile statistics
  const stats = {
    totalBTCMap: btcMapMerchants.length,
    totalBlink: blinkMerchants.length,
    totalBitcoinJungle: bitcoinJungleMerchants.length,
    uniqueBlink: uniqueBlinkMerchants.length,
    uniqueBitcoinJungle: uniqueBitcoinJungleMerchants.length,
    duplicatesBlink: blinkMerchants.length - uniqueBlinkMerchants.length,
    duplicatesBitcoinJungle: bitcoinJungleMerchants.length - uniqueBitcoinJungleMerchants.length
  };

  return {
    blinkMerchants: uniqueBlinkMerchants,
    bitcoinJungleMerchants: uniqueBitcoinJungleMerchants,
    stats
  };
}