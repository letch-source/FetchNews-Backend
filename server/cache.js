// backend/server/cache.js
const redis = require('redis');

class CacheManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.fallbackCache = new Map(); // In-memory fallback
    this.init();
  }

  async init() {
    try {
      // Try to connect to Redis if available
      this.client = redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          connectTimeout: 5000,
          lazyConnect: true
        }
      });

      this.client.on('error', (err) => {
        console.warn('Redis connection error, using fallback cache:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Connected to Redis cache');
        this.isConnected = true;
      });

      await this.client.connect();
    } catch (error) {
      console.warn('Redis not available, using in-memory cache:', error.message);
      this.isConnected = false;
    }
  }

  async get(key) {
    try {
      if (this.isConnected && this.client) {
        const value = await this.client.get(key);
        return value ? JSON.parse(value) : null;
      } else {
        // Use in-memory fallback
        return this.fallbackCache.get(key) || null;
      }
    } catch (error) {
      console.warn('Cache get error:', error.message);
      return null;
    }
  }

  async set(key, value, ttlSeconds = 900) { // Default 15 minutes
    try {
      if (this.isConnected && this.client) {
        await this.client.setEx(key, ttlSeconds, JSON.stringify(value));
      } else {
        // Use in-memory fallback with TTL simulation
        this.fallbackCache.set(key, value);
        setTimeout(() => {
          this.fallbackCache.delete(key);
        }, ttlSeconds * 1000);
      }
    } catch (error) {
      console.warn('Cache set error:', error.message);
    }
  }

  async del(key) {
    try {
      if (this.isConnected && this.client) {
        await this.client.del(key);
      } else {
        this.fallbackCache.delete(key);
      }
    } catch (error) {
      console.warn('Cache delete error:', error.message);
    }
  }

  // Generate cache keys
  getNewsKey(topic, geo, wordCount) {
    const geoStr = geo ? `${geo.country}-${geo.region}-${geo.city}` : 'no-geo';
    return `news:${topic}:${geoStr}:${wordCount}`;
  }

  getSummaryKey(topics, wordCount, location) {
    const topicsStr = Array.isArray(topics) ? topics.sort().join(',') : topics;
    return `summary:${topicsStr}:${wordCount}:${location || 'no-location'}`;
  }

  getTTSKey(text, voice, speed) {
    // Create a hash of the text for the key
    const crypto = require('crypto');
    const textHash = crypto.createHash('md5').update(text).digest('hex');
    // Include voice and speed in the key to ensure different voices get different cache entries
    const voiceKey = String(voice || 'alloy').toLowerCase();
    const speedKey = String(speed || 1.0);
    return `tts:${textHash}:${voiceKey}:${speedKey}`;
  }
}

module.exports = new CacheManager();
