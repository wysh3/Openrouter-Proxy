# OpenRouter Proxy Server

## Features
- Intelligent API key rotation
- Automatic retry on failures
- Streaming support
- Rate limit handling
- Performance metrics

## Server Modes

### Development
```bash
npm run dev
```
- Uses nodemon for automatic restart on file changes
- More verbose logging
- Debug tools enabled

### Production
```bash
npm start
```
- Optimized for performance
- Minimal logging
- Better error handling

## Setup
1. Install dependencies: `npm install`
2. Run the setup utility: `npm run setup`
   - This will guide you through adding API keys interactively
   - Keys are validated and stored in `data/keys.json`
3. Start development server: `npm run dev`
4. Start production server: `npm start`

## Configuration
- Add multiple API keys to `data/keys.json` for load balancing
- Customize rate limits in `src/services/KeyManager.js`
- Adjust logging in `src/utils/logger.js`

## API Endpoints
- `POST /v1/chat/completions` - Main proxy endpoint
- `GET /health` - Health check

## Environment Variables
- `PORT` - Server port (default: 3000)
- `HTTP_REFERER` - Default referer header
- `X_TITLE` - Default title header