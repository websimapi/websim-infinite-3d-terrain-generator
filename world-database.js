export class WorldDatabase {
    constructor() {
        this.dbName = 'terrainWorldDB';
        this.chunkStoreName = 'chunks';
        this.db = null;
    }
    
    async initialize() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object store for chunks if it doesn't exist
                if (!db.objectStoreNames.contains(this.chunkStoreName)) {
                    const chunkStore = db.createObjectStore(this.chunkStoreName, { keyPath: 'id' });
                    chunkStore.createIndex('position', ['x', 'z'], { unique: true });
                    chunkStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('Database initialized successfully');
                resolve();
            };
            
            request.onerror = (event) => {
                console.error('Database initialization error:', event.target.error);
                reject(event.target.error);
                
                // Fall back to in-memory storage if IndexedDB fails
                this.inMemoryFallback = true;
                this.chunkCache = new Map();
                resolve();
            };
        });
    }
    
    async saveChunk(chunkId, chunkData) {
        if (this.inMemoryFallback) {
            this.chunkCache.set(chunkId, {...chunkData, id: chunkId});
            return;
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.chunkStoreName], 'readwrite');
            const chunkStore = transaction.objectStore(this.chunkStoreName);
            
            // Add chunk ID to the data
            const data = { ...chunkData, id: chunkId };
            
            const request = chunkStore.put(data);
            
            request.onsuccess = () => resolve();
            request.onerror = (event) => {
                console.error('Error saving chunk:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    async getChunk(chunkId) {
        if (this.inMemoryFallback) {
            return this.chunkCache.get(chunkId) || null;
        }
        
        return new Promise((resolve, reject) => {
            // Check if database is null
            if (!this.db) {
                console.warn('Database not initialized, using in-memory fallback');
                this.inMemoryFallback = true;
                this.chunkCache = this.chunkCache || new Map();
                resolve(null);
                return;
            }
            
            const transaction = this.db.transaction([this.chunkStoreName], 'readonly');
            const chunkStore = transaction.objectStore(this.chunkStoreName);
            
            const request = chunkStore.get(chunkId);
            
            request.onsuccess = (event) => {
                resolve(event.target.result);
            };
            
            request.onerror = (event) => {
                console.error('Error getting chunk:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    async deleteChunk(chunkId) {
        if (this.inMemoryFallback) {
            this.chunkCache.delete(chunkId);
            return;
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.chunkStoreName], 'readwrite');
            const chunkStore = transaction.objectStore(this.chunkStoreName);
            
            const request = chunkStore.delete(chunkId);
            
            request.onsuccess = () => resolve();
            request.onerror = (event) => {
                console.error('Error deleting chunk:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    async getAllChunks() {
        if (this.inMemoryFallback) {
            return Array.from(this.chunkCache.values());
        }
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.chunkStoreName], 'readonly');
            const chunkStore = transaction.objectStore(this.chunkStoreName);
            
            const request = chunkStore.getAll();
            
            request.onsuccess = (event) => {
                resolve(event.target.result);
            };
            
            request.onerror = (event) => {
                console.error('Error getting all chunks:', event.target.error);
                reject(event.target.error);
            };
        });
    }
}