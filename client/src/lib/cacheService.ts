import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'bitcoin-merchants-cache';
const DB_VERSION = 1;
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB

interface CacheMetadata {
  lastSync: number;
  schemaVersion: string;
  totalSize: number;
}

interface OfflineQueue {
  id: string;
  operation: 'add' | 'update' | 'delete';
  data: any;
  timestamp: number;
}

class CacheService {
  private db: IDBPDatabase | null = null;
  private metadata: CacheMetadata | null = null;
  private isOnline: boolean = navigator.onLine;

  constructor() {
    // Set up online/offline listeners
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processPendingOperations();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  async init() {
    try {
      this.db = await openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Create stores if they don't exist
          if (!db.objectStoreNames.contains('btcmap')) {
            db.createObjectStore('btcmap', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('blink')) {
            db.createObjectStore('blink', { keyPath: 'username' });
          }
          if (!db.objectStoreNames.contains('bitcoinjungle')) {
            db.createObjectStore('bitcoinjungle', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('metadata')) {
            db.createObjectStore('metadata', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('offlineQueue')) {
            db.createObjectStore('offlineQueue', { keyPath: 'id', autoIncrement: true });
          }
        },
      });

      // Initialize or load metadata
      await this.initMetadata();

      console.log('Cache service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize cache service:', error);
      throw error;
    }
  }

  private async initMetadata() {
    if (!this.db) throw new Error('Database not initialized');

    try {
      this.metadata = await this.db.get('metadata', 'global') || {
        id: 'global',
        lastSync: 0,
        schemaVersion: '1.0',
        totalSize: 0
      };
    } catch (error) {
      console.error('Failed to initialize metadata:', error);
      throw error;
    }
  }

  private async updateMetadata(updates: Partial<CacheMetadata>) {
    if (!this.db || !this.metadata) throw new Error('Cache not initialized');

    try {
      this.metadata = { ...this.metadata, ...updates };
      await this.db.put('metadata', this.metadata);
    } catch (error) {
      console.error('Failed to update metadata:', error);
      throw error;
    }
  }

  async isCacheStale(): Promise<boolean> {
    if (!this.metadata) return true;
    return Date.now() - this.metadata.lastSync > CACHE_EXPIRY;
  }

  private async enforceCacheSizeLimit() {
    if (!this.db || !this.metadata) return;

    if (this.metadata.totalSize > MAX_CACHE_SIZE) {
      // Get all entries sorted by last access
      const stores = ['btcmap', 'blink', 'bitcoinjungle'];
      let allEntries: { store: string; key: any; size: number; lastAccess: number }[] = [];

      for (const store of stores) {
        const entries = await this.db.getAll(store);
        const storeEntries = entries.map(entry => ({
          store,
          key: entry.id || entry.username,
          size: JSON.stringify(entry).length,
          lastAccess: entry.lastAccess || 0
        }));
        allEntries = allEntries.concat(storeEntries);
      }

      // Sort by last access (oldest first)
      allEntries.sort((a, b) => a.lastAccess - b.lastAccess);

      // Remove entries until we're under the limit
      let currentSize = this.metadata.totalSize;
      for (const entry of allEntries) {
        if (currentSize <= MAX_CACHE_SIZE * 0.8) break; // Leave 20% buffer
        await this.db.delete(entry.store, entry.key);
        currentSize -= entry.size;
      }

      await this.updateMetadata({ totalSize: currentSize });
    }
  }

  async syncData(source: 'btcmap' | 'blink' | 'bitcoinjungle', data: any[]) {
    if (!this.db) throw new Error('Cache not initialized');

    try {
      const tx = this.db.transaction(source, 'readwrite');
      const store = tx.objectStore(source);

      // Calculate new data size
      const dataSize = JSON.stringify(data).length;

      // Update cache with new data
      for (const item of data) {
        await store.put({
          ...item,
          lastAccess: Date.now()
        });
      }

      // Update metadata
      await this.updateMetadata({
        lastSync: Date.now(),
        totalSize: (this.metadata?.totalSize || 0) + dataSize
      });

      // Enforce cache size limits
      await this.enforceCacheSizeLimit();

      await tx.done;
      console.log(`Successfully synced ${source} data:`, data.length, 'items');
    } catch (error) {
      console.error(`Failed to sync ${source} data:`, error);
      throw error;
    }
  }

  async getData(source: 'btcmap' | 'blink' | 'bitcoinjungle'): Promise<any[]> {
    if (!this.db) throw new Error('Cache not initialized');

    try {
      const data = await this.db.getAll(source);
      
      // Update last access time for retrieved items
      const tx = this.db.transaction(source, 'readwrite');
      const store = tx.objectStore(source);
      for (const item of data) {
        await store.put({
          ...item,
          lastAccess: Date.now()
        });
      }
      await tx.done;

      return data;
    } catch (error) {
      console.error(`Failed to get ${source} data from cache:`, error);
      throw error;
    }
  }

  async clearCache() {
    if (!this.db) throw new Error('Cache not initialized');

    try {
      const stores = ['btcmap', 'blink', 'bitcoinjungle'];
      for (const store of stores) {
        await this.db.clear(store);
      }
      await this.updateMetadata({
        lastSync: 0,
        totalSize: 0
      });
      console.log('Cache cleared successfully');
    } catch (error) {
      console.error('Failed to clear cache:', error);
      throw error;
    }
  }

  async queueOfflineOperation(operation: 'add' | 'update' | 'delete', data: any) {
    if (!this.db) throw new Error('Cache not initialized');

    try {
      await this.db.add('offlineQueue', {
        operation,
        data,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Failed to queue offline operation:', error);
      throw error;
    }
  }

  private async processPendingOperations() {
    if (!this.db || !this.isOnline) return;

    try {
      const pendingOps = await this.db.getAll('offlineQueue');
      const tx = this.db.transaction('offlineQueue', 'readwrite');
      const store = tx.objectStore('offlineQueue');

      for (const op of pendingOps) {
        try {
          // Process operation based on type
          switch (op.operation) {
            case 'add':
              // Implement API call to add merchant
              break;
            case 'update':
              // Implement API call to update merchant
              break;
            case 'delete':
              // Implement API call to delete merchant
              break;
          }
          await store.delete(op.id);
        } catch (error) {
          console.error('Failed to process offline operation:', op, error);
        }
      }

      await tx.done;
    } catch (error) {
      console.error('Failed to process pending operations:', error);
    }
  }
}

export const cacheService = new CacheService();
