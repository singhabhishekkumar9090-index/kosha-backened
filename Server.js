/**
 * KOSHA — Search Backend (single file, no .env needed)
 * ------------------------------------------------------
 * Proxies search queries to Serper.dev so the API key never
 * touches the browser/frontend. Everything — config + server —
 * lives in this one file for simplicity.
 *
 * SETUP:
 *   1. npm init -y
 *   2. npm install express cors
 *   3. Replace SERPER_API_KEY below with your (regenerated) key
 *   4. node server.js
 *
 * DEPLOY (Render / Railway / Fly.io etc.):
 *   - Push this file + package.json to a repo
 *   - Start command: node server.js
 *   - You'll get a URL like https://kosha-backend.onrender.com
 *     Use that as BACKEND_URL in the frontend (index.html).
 */

const express = require('express');
const cors = require('cors');

// ---- CONFIG ----------------------------------------------------
const SERPER_API_KEY = '91bd7700d544c4fd321fa71ab949427c2742d0e4';
const PORT = process.env.PORT || 3000;
// ------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

if (!SERPER_API_KEY || SERPER_API_KEY.startsWith('PASTE_')) {
  console.error('❌ Set your SERPER_API_KEY at the top of server.js before running.');
  process.exit(1);
}

// Simple in-memory rate limiter (protects your Serper quota from abuse)
const requestLog = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests. Slow down a bit.' });
  }
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  next();
}

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'kosha-search-backend' });
});

// GET /search?q=your+query
app.get('/search', rateLimit, async (req, res) => {
  const query = (req.query.q || '').toString().trim();
  if (!query) {
    return res.status(400).json({ error: 'Missing query param "q"' });
  }

  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query })
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ error: 'Upstream search failed', detail: text });
    }

    const data = await response.json();

    const simplified = {
      answerBox: data.answerBox || null,
      knowledgeGraph: data.knowledgeGraph || null,
      organic: (data.organic || []).slice(0, 5).map(r => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet
      }))
    };

    res.json(simplified);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search request failed' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Kosha search backend running on port ${PORT}`);
});
