import { logError, logKeyEvent } from '../utils/logger.js';

export class CircuitBreaker {
  constructor(options = {}) {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    
    // Configuration
    this.failureThreshold = options.failureThreshold || 3;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 10000;
  }

  async exec(fn) {
    if (this.state === 'OPEN') {
      if (this.nextAttempt <= Date.now()) {
        this.state = 'HALF-OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.success();
      return result;
    } catch (error) {
      this.fail();
      throw error;
    }
  }

  success() {
    if (this.state === 'HALF-OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.reset();
        logKeyEvent('Circuit breaker reset', { state: this.state });
      }
    }
  }

  fail() {
    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.trip();
    }
  }

  trip() {
    this.state = 'OPEN';
    this.nextAttempt = Date.now() + this.timeout;
    logError(new Error('Circuit breaker tripped'), { 
      state: this.state,
      nextAttempt: this.nextAttempt 
    });
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
  }

  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.nextAttempt
    };
  }
}