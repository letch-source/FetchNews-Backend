// backend/server/index.js  (CommonJS)

// Load .env first (expects backend/.env OR backend/server/.env if you change the path)
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();

// Allow local dev frontends
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:5173'] }));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || 'dev' });
});

// Simple summarize route (placeholder data; no TTS yet)
app.post('/api/summarize', async (req, res) => {
  const { topic } = req.body || {};
  res.json({
    items: [
      {
        id: 'demo-1',
        title: `Top ${topic || 'news'} right now`,
        summary: 'This is a placeholder summary from the API so the UI can render.',
        audioUrl: null, // not wired yet
      },
    ],
  });
});

// Optional legacy alias
app.post('/api/generate', (req, res) => res.redirect(307, '/api/summarize'));

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
