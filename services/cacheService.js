const redis = require('redis');

class CacheService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      const redisConfig = {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          connectTimeout: 10000,
          lazyConnect: true,
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.log('Redis: Max retries reached, giving up');
              return new Error('Max retries reached');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      };

      this.client = redis.createClient(redisConfig);

      this.client.on('error', (err) => {
        console.log('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis Client Connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('Redis Client Ready');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        console.log('Redis Client Disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
    } catch (error) {
      console.log('Redis connection failed, continuing without cache:', error.message);
      this.isConnected = false;
    }
  }

  async get(key) {
    // TEMPORARILY DISABLE REDIS FOR PERFORMANCE
    return null;
    
    // Original code commented out for performance
    // if (!this.isConnected || !this.client) return null;
    // 
    // try {
    //   const value = await this.client.get(key);
    //   return value ? JSON.parse(value) : null;
    // } catch (error) {
    //   console.error('Cache get error:', error);
    //   return null;
    // }
  }

  async set(key, value, ttl = 3600) {
    // TEMPORARILY DISABLE REDIS FOR PERFORMANCE
    return true;
    
    // Original code commented out for performance
    // if (!this.isConnected || !this.client) return false;
    // 
    // try {
    //   await this.client.setEx(key, ttl, JSON.stringify(value));
    //   return true;
    // } catch (error) {
    //   console.error('Cache set error:', error);
    //   return false;
    // }
  }

  async del(key) {
    if (!this.isConnected || !this.client) return false;
    
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  async flush() {
    if (!this.isConnected || !this.client) return false;
    
    try {
      await this.client.flushAll();
      return true;
    } catch (error) {
      console.error('Cache flush error:', error);
      return false;
    }
  }

  // Кэширование с автоматическим ключом
  async cache(key, fetchFunction, ttl = 3600) {
    const cached = await this.get(key);
    if (cached) {
      return cached;
    }

    const data = await fetchFunction();
    await this.set(key, data, ttl);
    return data;
  }

  // Кэширование для API ответов
  async cacheApiResponse(req, fetchFunction, ttl = 300) {
    const key = this.generateApiKey(req);
    return this.cache(key, fetchFunction, ttl);
  }

  generateApiKey(req) {
    const { method, originalUrl, query, body } = req;
    const keyData = {
      method,
      url: originalUrl,
      query,
      body: method === 'POST' || method === 'PUT' ? body : null
    };
    return `api:${Buffer.from(JSON.stringify(keyData)).toString('base64')}`;
  }
}

module.exports = new CacheService();

