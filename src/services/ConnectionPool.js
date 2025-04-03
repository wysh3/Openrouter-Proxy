import https from 'https';
import { logError } from '../utils/logger.js';

class ConnectionPool {
  constructor() {
    this.pool = new Map();
    this.maxSockets = 50;
    this.maxFreeSockets = 10;
    this.timeout = 30000;
  }

  getAgent(host) {
    if (!this.pool.has(host)) {
      this.pool.set(host, new https.Agent({
        keepAlive: true,
        maxSockets: this.maxSockets,
        maxFreeSockets: this.maxFreeSockets,
        timeout: this.timeout,
        keepAliveMsecs: 60000,
        rejectUnauthorized: true
      }));
    }
    return this.pool.get(host);
  }

  async closeAll() {
    for (const [host, agent] of this.pool) {
      try {
        agent.destroy();
        this.pool.delete(host);
      } catch (error) {
        logError(error, { context: 'ConnectionPool cleanup' });
      }
    }
  }

  healthCheck() {
    return {
      totalConnections: this.pool.size,
      status: Array.from(this.pool.values()).map(agent => ({
        sockets: agent.sockets ? Object.keys(agent.sockets).length : 0,
        freeSockets: agent.freeSockets ? Object.keys(agent.freeSockets).length : 0,
        pendingRequests: agent.requests ? Object.keys(agent.requests).length : 0
      }))
    };
  }
}

export default new ConnectionPool();