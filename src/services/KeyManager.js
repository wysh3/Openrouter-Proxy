import fs from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { debounce } from 'lodash-es';
import ApiKey from '../models/ApiKey.js';
import { logKeyEvent, logError } from '../utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEYS_FILE = join(__dirname, '../../data/keys.json');

class KeyManager {
  constructor() {
    this.keys = [];
    this.currentKeyIndex = -1;
    this.activeKeyCount = 0;
    this.debouncedWriteKeys = debounce(this._writeKeysToFile.bind(this), 5000);
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    await this._loadKeysFromFile();
    this.isInitialized = true;
  }

  async _loadKeysFromFile() {
    try {
      const data = await fs.readFile(KEYS_FILE, 'utf8');
      this.keys = JSON.parse(data).map(k => new ApiKey(k));
      this.activeKeyCount = this.keys.filter(k => k.isActive).length;
      logKeyEvent('Keys loaded', { count: this.keys.length });
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.mkdir(dirname(KEYS_FILE), { recursive: true });
        await this._writeKeysToFile();
      } else {
        logError(error, { action: 'loadKeysFromFile' });
        throw error;
      }
    }
  }

  async _writeKeysToFile() {
    try {
      const data = this.keys.map(k => ({
        key: k.key,
        isActive: k.isActive,
        lastUsed: k.lastUsed,
        failureCount: k.failureCount
      }));
      await fs.writeFile(KEYS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      logError(error, { action: 'writeKeysToFile' });
    }
  }

  async rotateKey(model = '*') {
    const now = new Date();
    let bestKey = null;
    let bestScore = -Infinity;
    let fallbackKey = null;
    
    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];
      
      // Skip inactive or rate-limited keys
      if (!key.isActive || key.isRateLimited()) continue;
      
      // Calculate score based on multiple factors
      let score = 0;
      
      // 1. Prioritize keys with quota remaining
      const remainingQuota = key.getRemainingQuota(model);
      score += Math.min(1, remainingQuota / 1000) * 1000;
      
      // 2. Favor less recently used keys
      const hoursSinceUse = key.lastUsed ?
        (now - key.lastUsed) / (1000 * 60 * 60) : 24;
      score += Math.min(5, hoursSinceUse) * 200;
      
      // 3. Penalize failed attempts
      score -= key.failureCount * 100;
      
      // Track best scoring key
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
        this.currentKeyIndex = i;
      }
      
      // Keep first available key as fallback
      if (!fallbackKey) fallbackKey = key;
    }

    // If no key has quota, use fallback key with warning
    if (bestKey?.getRemainingQuota(model) <= 0 && fallbackKey) {
      logKeyEvent('Using fallback key - quota exhausted', {
        model,
        keyId: fallbackKey._id
      });
      bestKey = fallbackKey;
    }

    if (!bestKey) {
      const error = new Error(`No available API keys for model ${model}`);
      logError(error, {
        activeKeys: this.activeKeyCount,
        model
      });
      throw error;
    }

    return bestKey.key;
  }

  async getKey(model = '*') {
    await this.initialize();
    return this.rotateKey(model);
  }

  async markKeySuccess(responseTime, model = '*', response) {
    if (this.currentKeyIndex === -1) return;
    
    const key = this.keys[this.currentKeyIndex];
    key.lastUsed = new Date();
    key.failureCount = 0;
    this.debouncedWriteKeys();
  }

  async markKeyError(error) {
    if (this.currentKeyIndex === -1) return false;
    
    const key = this.keys[this.currentKeyIndex];
    key.failureCount = (key.failureCount || 0) + 1;
    
    if (error.response?.status === 429) {
      key.rateLimitResetAt = new Date(Date.now() + 60000); // 1 min cooldown
    }

    if (key.failureCount >= 5) {
      key.isActive = false;
      this.activeKeyCount--;
    }

    this.debouncedWriteKeys();
    return true;
  }

  async gracefulShutdown() {
    try {
      // Cancel any pending debounced writes
      this.debouncedWriteKeys.cancel();
      
      // Force immediate write of current key states
      await this._writeKeysToFile();
      
      // Clear any active key states
      this.keys = [];
      this.currentKeyIndex = -1;
      this.activeKeyCount = 0;
      
      logKeyEvent('KeyManager shutdown completed');
    } catch (error) {
      logError(error, { action: 'gracefulShutdown' });
      throw error;
    }
  }
}

export default KeyManager;