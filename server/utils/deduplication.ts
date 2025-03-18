import { z } from 'zod';

// Constants for deduplication configuration
const DEFAULT_NAME_SIMILARITY_THRESHOLD = 0.8; // 80% similarity threshold
const DEFAULT_DISTANCE_THRESHOLD = 100; // 100 meters

// Merchant schema for standardizing data from different sources
export const MerchantSchema = z.object({
  id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  source: z.enum(['btcmap', 'blink']),
  originalData: z.any()
});

export type Merchant = z.infer<typeof MerchantSchema>;

export class MerchantDeduplication {
  private nameSimilarityThreshold: number;
  private distanceThreshold: number;

  constructor(config?: {
    nameSimilarityThreshold?: number;
    distanceThreshold?: number;
  }) {
    this.nameSimilarityThreshold = config?.nameSimilarityThreshold ?? DEFAULT_NAME_SIMILARITY_THRESHOLD;
    this.distanceThreshold = config?.distanceThreshold ?? DEFAULT_DISTANCE_THRESHOLD;
  }

  // Calculate Levenshtein distance for string similarity
  private levenshteinDistance(str1: string, str2: string): number {
    const track = Array(str2.length + 1).fill(null).map(() =>
      Array(str1.length + 1).fill(null));
    for (let i = 0; i <= str1.length; i += 1) {
      track[0][i] = i;
    }
    for (let j = 0; j <= str2.length; j += 1) {
      track[j][0] = j;
    }
    for (let j = 1; j <= str2.length; j += 1) {
      for (let i = 1; i <= str1.length; i += 1) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        track[j][i] = Math.min(
          track[j][i - 1] + 1, // deletion
          track[j - 1][i] + 1, // insertion
          track[j - 1][i - 1] + indicator, // substitution
        );
      }
    }
    return track[str2.length][str1.length];
  }

  // Calculate name similarity score (0 to 1)
  private calculateNameSimilarity(name1: string, name2: string): number {
    const processedName1 = name1.toLowerCase().trim();
    const processedName2 = name2.toLowerCase().trim();

    const maxLength = Math.max(processedName1.length, processedName2.length);
    if (maxLength === 0) return 1; // Both empty strings are considered identical

    const distance = this.levenshteinDistance(processedName1, processedName2);
    return 1 - distance / maxLength;
  }

  // Calculate Haversine distance between two points in meters
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Check if two merchants are potential duplicates
  private arePotentialDuplicates(merchant1: Merchant, merchant2: Merchant): {
    isDuplicate: boolean;
    nameSimilarity: number;
    distance: number;
  } {
    // Calculate name similarity
    const nameSimilarity = this.calculateNameSimilarity(merchant1.name, merchant2.name);

    // Calculate distance
    const distance = this.calculateDistance(
      merchant1.latitude,
      merchant1.longitude,
      merchant2.latitude,
      merchant2.longitude
    );

    // Check if they meet both thresholds
    const isDuplicate = 
      nameSimilarity >= this.nameSimilarityThreshold &&
      distance <= this.distanceThreshold;

    return {
      isDuplicate,
      nameSimilarity,
      distance
    };
  }

  // Merge duplicate merchants
  public mergeMerchants(btcMapMerchants: any[], blinkMerchants: any[]): {
    mergedMerchants: Merchant[];
    stats: {
      totalBtcMap: number;
      totalBlink: number;
      duplicatesFound: number;
      newMerchantsAdded: number;
    };
  } {
    // Convert BTCMap merchants to standard format
    const standardizedBtcMap: Merchant[] = btcMapMerchants
      .filter(m => m.osm_json?.lat && m.osm_json?.lon && m.osm_json?.tags?.name)
      .map(m => ({
        id: `btcmap-${m.id}`,
        name: m.osm_json.tags.name,
        latitude: m.osm_json.lat,
        longitude: m.osm_json.lon,
        source: 'btcmap' as const,
        originalData: m
      }));

    // Update the standardization of Blink merchants
    const standardizedBlink: Merchant[] = blinkMerchants
      .filter(m => m.mapInfo?.coordinates?.latitude && m.mapInfo?.coordinates?.longitude && m.mapInfo?.title)
      .map(m => ({
        id: `blink-${m.username}`,
        name: m.mapInfo.title,
        latitude: m.mapInfo.coordinates.latitude,
        longitude: m.mapInfo.coordinates.longitude,
        source: 'blink' as const,
        originalData: m
      }));

    // Keep track of which Blink merchants are duplicates
    const duplicateBlinkIds = new Set<string>();

    // First, add all BTCMap merchants to the result
    const mergedMerchants = [...standardizedBtcMap];

    // Then check each Blink merchant against existing BTCMap merchants
    standardizedBlink.forEach(blinkMerchant => {
      let isDuplicate = false;

      for (const btcMapMerchant of standardizedBtcMap) {
        const result = this.arePotentialDuplicates(blinkMerchant, btcMapMerchant);
        if (result.isDuplicate) {
          isDuplicate = true;
          duplicateBlinkIds.add(blinkMerchant.id);
          break;
        }
      }

      // If not a duplicate, add to merged results
      if (!isDuplicate) {
        mergedMerchants.push(blinkMerchant);
      }
    });

    // Calculate statistics
    const stats = {
      totalBtcMap: standardizedBtcMap.length,
      totalBlink: standardizedBlink.length,
      duplicatesFound: duplicateBlinkIds.size,
      newMerchantsAdded: standardizedBlink.length - duplicateBlinkIds.size
    };

    return {
      mergedMerchants,
      stats
    };
  }
}