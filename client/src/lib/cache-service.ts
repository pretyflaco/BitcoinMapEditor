import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { z } from 'zod';

// Define the database schema
interface BTCMapDB extends DBSchema {
  merchants: {
    key: string;
    value: {
      id: string;
      osm_json: any;
      lastUpdated: number;
      syncStatus: 'synced' | 'pending' | 'error';
    };
    indexes: { 'by-last-updated': number };
  };
  metadata: {
    key: string;
    value: {
      lastSync: number;
      version: number;
    };
  };
}

const CACHE_VERSION = 1;
const CACHE_STALENESS_THRESHOLD = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB
const DB_NAME = 'btcmap-cache';

class CacheService {
  private db: IDBPDatabase<BTCMapDB> | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.initDB();
  }

  private async initDB() {
    try {
      this.db = await openDB<BTCMapDB>(DB_NAME, CACHE_VERSION, {
        upgrade(db) {
          // Create merchants store with index
          if (!db.objectStoreNames.contains('merchants')) {
            const merchantStore = db.createObjectStore('merchants', { keyPath: 'id' });
            merchantStore.createIndex('by-last-updated', 'lastUpdated');
          }

          // Create metadata store
          if (!db.objectStoreNames.contains('metadata')) {
            db.createObjectStore('metadata');
          }
        },
      });

      console.log('Cache database initialized');
    } catch (error) {
      console.error('Failed to initialize cache database:', error);
      throw error;
    }
  }

  private async ensureDB(): Promise<IDBPDatabase<BTCMapDB>> {
    if (!this.db) {
      await this.initPromise;
      if (!this.db) {
        throw new Error('Database failed to initialize');
      }
    }
    return this.db;
  }

  async isCacheStale(): Promise<boolean> {
    const db = await this.ensureDB();
    const metadata = await db.get('metadata', 'lastSync');
    if (!metadata) return true;

    const now = Date.now();
    return now - metadata.lastSync > CACHE_STALENESS_THRESHOLD;
  }

  async getCachedMerchants(): Promise<any[]> {
    const db = await this.ensureDB();
    return db.getAll('merchants');
  }

  async updateCache(merchants: any[]) {
    const db = await this.ensureDB();
    const tx = db.transaction(['merchants', 'metadata'], 'readwrite');

    try {
      // Update merchants
      const merchantStore = tx.objectStore('merchants');
      const existingMerchants = await merchantStore.getAll();
      const existingIds = new Set(existingMerchants.map(m => m.id));

      for (const merchant of merchants) {
        const cached = existingIds.has(merchant.id) 
          ? await merchantStore.get(merchant.id)
          : null;

        await merchantStore.put({
          ...merchant,
          lastUpdated: Date.now(),
          syncStatus: 'synced',
          // Preserve local modifications if any
          ...(cached?.syncStatus === 'pending' ? { syncStatus: 'pending' } : {})
        });
      }

      // Update metadata
      await tx.objectStore('metadata').put({
        lastSync: Date.now(),
        version: CACHE_VERSION
      }, 'lastSync');

      await tx.done;
      console.log('Cache updated successfully');
    } catch (error) {
      console.error('Failed to update cache:', error);
      throw error;
    }
  }

  async pruneCache() {
    const db = await this.ensureDB();
    const tx = db.transaction('merchants', 'readwrite');
    const store = tx.objectStore('merchants');
    const index = store.index('by-last-updated');

    let totalSize = 0;
    const toDelete: string[] = [];

    // Calculate current cache size and identify old entries
    let cursor = await index.openCursor();
    while (cursor) {
      totalSize += JSON.stringify(cursor.value).length;
      if (totalSize > MAX_CACHE_SIZE) {
        toDelete.push(cursor.value.id);
      }
      cursor = await cursor.continue();
    }

    // Delete oldest entries if cache is too large
    for (const id of toDelete) {
      await store.delete(id);
    }

    if (toDelete.length > 0) {
      console.log(`Pruned ${toDelete.length} entries from cache`);
    }
  }

  async clearCache() {
    const db = await this.ensureDB();
    const tx = db.transaction(['merchants', 'metadata'], 'readwrite');
    await tx.objectStore('merchants').clear();
    await tx.objectStore('metadata').clear();
    await tx.done;
    console.log('Cache cleared');
  }

  // Queue changes for offline support
  async queueChange(merchantId: string, changes: any) {
    const db = await this.ensureDB();
    const tx = db.transaction('merchants', 'readwrite');
    const store = tx.objectStore('merchants');

    const merchant = await store.get(merchantId);
    if (merchant) {
      await store.put({
        ...merchant,
        ...changes,
        syncStatus: 'pending',
        lastUpdated: Date.now()
      });
    }

    await tx.done;
  }

  // Sync queued changes when online
  async syncQueuedChanges() {
    const db = await this.ensureDB();
    const tx = db.transaction('merchants', 'readwrite');
    const store = tx.objectStore('merchants');

    const pendingMerchants = await store.index('by-last-updated')
      .getAll(IDBKeyRange.only('pending'));

    for (const merchant of pendingMerchants) {
      try {
        // Here you would implement the actual API call to sync changes
        // For now, we'll just mark it as synced
        await store.put({
          ...merchant,
          syncStatus: 'synced'
        });
      } catch (error) {
        console.error(`Failed to sync merchant ${merchant.id}:`, error);
        await store.put({
          ...merchant,
          syncStatus: 'error'
        });
      }
    }

    await tx.done;
  }
}

// Export singleton instance
export const cacheService = new CacheService();
