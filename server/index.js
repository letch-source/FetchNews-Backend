// backend/server/index.js  (CommonJS)

// Load env from backend/.env
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const fs = require('fs');
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:5173'] }));
app.use(express.json());

// Static media for generated audio
const MEDIA_DIR = path.join(__dirname, 'media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
app.use('/media', express.static(MEDIA_DIR));

// Tiny request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV || 'dev' });
});

// Guards
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Missing OPENAI_API_KEY in backend/.env');
  process.exit(1);
}
if (!process.env.NEWSAPI_KEY) {
  console.warn('⚠️  Missing NEWSAPI_KEY — summaries may be generic.');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TOPIC_CATEGORIES = new Set([
  'business', 'entertainment', 'general', 'health', 'science', 'sports', 'technology', 'world'
]);

// Fetch top headlines for a topic (NewsAPI)
async function fetchHeadlinesForTopic(topic) {
  if (!process.env.NEWSAPI_KEY) return [];

  const u = new URL('https://newsapi.org/v2/top-headlines');
  u.searchParams.set('pageSize', '12');
  u.searchParams.set('language', 'en');

  const canonical = topic.toLowerCase();
  if (TOPIC_CATEGORIES.has(canonical)) {
    u.searchParams.set('country', 'us');
    u.searchParams.set('category', canonical);
  } else {
    u.searchParams.set('q', canonical);
  }

  const resp = await fetch(u.toString(), { headers: { 'X-Api-Key': process.env.NEWSAPI_KEY } });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`NewsAPI ${resp.status}: ${t}`);
  }
  const json = await resp.json();
  return Array.isArray(json.articles) ? json.articles : [];
}

// Deduplicate by URL or title
function dedupeArticles(arr) {
  const seen = new Set();
  const out = [];
  for (const a of arr) {
    const key = (a.url || a.title || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

// Build batch prompt
function buildBatchPrompt(topics, articles) {
  const lines = [];
  lines.push(
    `You are a concise news editor. Create one coherent audio-ready summary that covers these topics: ${topics.join(', ')}.`
  );
  lines.push(`Write ~180–260 words. Be factual, neutral, and avoid list formatting. Merge overlapping stories.`);
  lines.push(`Weave in 3–5 key developments across the topics, giving context without opinion.`);
  lines.push(`Headlines:`);

  const snippets = articles.slice(0, 14).map((a, i) => {
    const src = a.source?.name || '';
    const ctx = [a.description, a.content].filter(Boolean).join(' ').slice(0, 600);
    const pub = a.publishedAt || '';
    const url = a.url || '';
    return `${i + 1}) ${a.title || 'Untitled'} — ${src} — ${pub} — ${url}\n${ctx}`;
  });

  return [...lines, ...snippets].join('\n');
}

// TTS helper
async function synthesizeTTS(text) {
  try {
    const speech = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: text,
      format: 'mp3',
    });
    const buf = Buffer.from(await speech.arrayBuffer());
    const fname = `tts-${Date.now()}.mp3`;
    const fpath = path.join(MEDIA_DIR, fname);
    fs.writeFileSync(fpath, buf);
    return `/media/${fname}`;
  } catch (e) {
    console.error('TTS error:', e?.message || e);
    return null;
  }
}

// Single-topic (kept for compatibility; internally calls batch)
app.post('/api/summarize', async (req, res) => {
  try {
    const topic = (req.body?.topic || 'general').toString();
    const result = await buildCombinedSummary([topic]);
    return res.json({
      combined: result.combined,
      items: result.items, // optional list
    });
  } catch (err) {
    console.error('Summarize error:', err?.message || err);
    res.status(500).json({ error: 'Failed to summarize news.' });
  }
});

// Multi-topic batch endpoint
app.post('/api/summarize/batch', async (req, res) => {
  try {
    const topics = Array.isArray(req.body?.topics) ? req.body.topics.map(String) : [];
    if (!topics.length) {
      return res.status(400).json({ error: 'topics[] required' });
    }
    const result = await buildCombinedSummary(topics);
    return res.json({
      combined: result.combined,
      items: result.items, // optional list
    });
  } catch (err) {
    console.error('Batch summarize error:', err?.message || err);
    res.status(500).json({ error: 'Failed to build combined summary.' });
  }
});

// Compatibility alias
app.post('/api/generate', (req, res) => res.redirect(307, '/api/summarize'));

async function buildCombinedSummary(topics) {
  // a) Fetch per-topic, gather and dedupe
  let collected = [];
  for (const t of topics) {
    try {
      const arts = await fetchHeadlinesForTopic(t);
      collected = collected.concat(
        arts.map((a) => ({ ...a, _topic: t }))
      );
    } catch (e) {
      console.error(`News fetch error for "${t}":`, e?.message || e);
    }
  }

  const deduped = dedupeArticles(collected);
  // b) Sort by recency
  deduped.sort((a, b) => (new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)));

  // c) Build prompt (cap items for token safety)
  const capped = deduped.slice(0, 14);
  const prompt = buildBatchPrompt(topics, capped);

  // d) Summarize
  let combinedText = 'No summary produced.';
  try {
    const summaryResp = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: prompt,
    });
    combinedText = (summaryResp.output_text || '').trim() || combinedText;
  } catch (e) {
    console.error('OpenAI summary error:', e?.message || e);
  }

  // e) TTS
  const audioUrl = await synthesizeTTS(combinedText);

  // f) Shape results
  const combined = {
    id: `combined-${Date.now()}`,
    title: `Top ${topics.join(', ')} right now`,
    summary: combinedText,
    audioUrl, // "/media/tts-*.mp3" or null
  };

  const items = capped.map((a, i) => ({
    id: `a-${i}`,
    title: a.title || 'Untitled',
    summary: [a.description, a.content].filter(Boolean).join(' ').slice(0, 220) || '',
    url: a.url || '',
    source: a.source?.name || '',
    topic: a._topic || '',
    audioUrl: null,
  }));

  return { combined, items };
}

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ API listening on http://localhost:${PORT}`);
});
