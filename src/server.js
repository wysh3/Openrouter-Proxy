import express from 'express';
import axios from 'axios';
import { AbortController } from 'node-abort-controller';
import ConnectionPool from './services/ConnectionPool.js';
import { CircuitBreaker } from './services/CircuitBreaker.js';
import KeyManager from './services/KeyManager.js';
import logger from './utils/logger.js';
import http from 'http';
import https from 'https';

// Initialize Express
const app = express();
const basePort = process.env.PORT || 3000;

// Function to start server with port fallback
const startServer = async () => {
  let currentPort = basePort;
  const maxPort = basePort + 10;
  
  while (currentPort <= maxPort) {
    try {
      const server = await new Promise((resolve, reject) => {
        const instance = app.listen(currentPort)
          .once('listening', () => {
            logger.info(`Server running on port ${currentPort}`);
            resolve(instance);
          })
          .once('error', reject);
      });
      
      return server;
    } catch (err) {
      if (err.code === 'EADDRINUSE') {
        logger.warn(`Port ${currentPort} in use, trying ${currentPort + 1}`);
        currentPort++;
        continue;
      }
      throw err;
    }
  }
  
  throw new Error(`No available ports between ${basePort}-${maxPort}`);
};

// Start the server
let server;
try {
  server = await startServer();
  
  // Socket configuration
  server.keepAliveTimeout = 60000;
  server.headersTimeout = 65000;
  server.maxRequestsPerSocket = 100;
  
} catch (err) {
  logger.error('Failed to start server:', err);
  process.exit(1);
}

// Socket configuration
server.keepAliveTimeout = 60000; // 60 seconds
server.headersTimeout = 65000; // 65 seconds
server.maxRequestsPerSocket = 100;

// Initialize Key Manager
// Initialize services
const keyManager = new KeyManager();
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 10000
});

await keyManager.initialize();

// Middleware
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf.toString());
    } catch (e) {
      throw new Error('Invalid JSON');
    }
  }
}));
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Main proxy endpoint


// Initialize Key Manager
await keyManager.initialize();

// Graceful shutdown handler
const gracefulShutdown = async () => {
  logger.info('Starting graceful shutdown...');
  try {
    await ConnectionPool.closeAll();
    await keyManager.gracefulShutdown();
    process.exit(0);
  } catch (error) {
    logger.error('Shutdown error', error);
    process.exit(1);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const result = await circuitBreaker.exec(async () => {
      const maxRetries = 3;
      let retryCount = 0;
      let lastError = null;
      const model = req.body?.model || 'default';
      const isStreaming = req.body?.stream === true;

      while (retryCount < maxRetries) {
        const startTime = Date.now();
        const abortController = new AbortController();
        
        try {
          // Get API key with quota consideration
          const apiKey = await keyManager.getKey(model);
          
          // Configure axios with connection pooling
          const config = {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': req.headers['http-referer'] || 'http://localhost:3000',
              'X-Title': req.headers['x-title'] || 'OpenRouter Proxy'
            },
            timeout: 30000,
            httpsAgent: ConnectionPool.getAgent('api.openrouter.ai').setMaxListeners(100),
            socketPath: undefined,
            timeout: 30000,
            httpAgent: new http.Agent({
              keepAlive: true,
              keepAliveMsecs: 60000,
              maxSockets: 50,
              maxFreeSockets: 10
            }),
            signal: abortController.signal
          };

          if (isStreaming) {
            config.responseType = 'stream';
          }

          // Forward request to OpenRouter
          const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            req.body,
            config
          );

          // Handle streaming response
          if (isStreaming) {
            req.on('close', () => {
              response.data.destroy();
              abortController.abort();
            });

            response.data.on('error', (err) => {
              logger.error('Stream error', {
                model,
                error: err.message,
                stack: err.stack
              });
              if (!res.headersSent) {
                res.status(500).json({ error: 'Stream error occurred' });
              }
            });

            response.data.pipe(res);
            response.data.on('end', () => {
              const tokensUsed = parseInt(response.headers['x-ratelimit-used'] || '0');
              keyManager.markKeySuccess(
                Date.now() - startTime,
                model,
                tokensUsed
              );
            });
            return;
          }

          // Handle regular response
          const tokensUsed = parseInt(response.headers['x-ratelimit-used'] || '0');
          await keyManager.markKeySuccess(
            Date.now() - startTime,
            model,
            tokensUsed
          );
          return response.data;

        } catch (error) {
          lastError = error;
          retryCount++;
          
          // Handle rate limits with backoff
          const isRateLimit = error.response?.status === 429;
          const retryAfter = isRateLimit ?
            parseInt(error.response.headers['retry-after'] || '5') : 0;
          
          if (isRateLimit && retryCount < maxRetries) {
            await new Promise(resolve =>
              setTimeout(resolve, retryAfter * 1000 * retryCount)
            );
          }
          
          // Clean up any resources
          abortController.abort();
        }
      }

      // All retries failed
      if (lastError.response) {
        await keyManager.markKeyError(lastError);
      }
      throw lastError;
    });

    if (result) res.json(result);
  } catch (error) {
    const status = error.response?.status || 500;
    const errorInfo = {
      message: error.message,
      status,
      details: status >= 500 ? undefined : error.response?.data
    };
    
    logger.error('Proxy request failed', {
      ...errorInfo,
      circuitState: circuitBreaker.getStatus()
    });
    
    res.status(status).json(errorInfo);
  }
});