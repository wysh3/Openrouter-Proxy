# OpenRouter Proxy Server

## Features
- Intelligent API key rotation
- Automatic retry on failures
- Streaming support
- Rate limit handling
- Performance metrics

## Installation

1. Clone the repository:
```bash
git clone https://github.com/wysh3/openrouter-proxy.git
cd openrouter-proxy
```

2. Install dependencies:
```bash
npm install
```

3. Set up your API keys:
```bash
npm run setup
```
> Follow the interactive prompts to add your OpenRouter API keys. Keys are validated and stored in `data/keys.json`

4. Start the server:
```bash
npm start
```

### Only for development (auto-restart on changes)
```bash
npm run dev
```

## API Usage

Base endpoint : `http://localhost:3000/v1`

api key : `dummy-key`

model (any model specified on openrouter) for example : `google/gemini-2.5-pro-exp-03-25:free` 

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
