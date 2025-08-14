﻿﻿// backend/server/index.js  (CommonJS)

// Load env from backend/.env
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

@@ -10,21 +8,28 @@ const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:5173', /\.yourdomain\.com$/] }));
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://news-podcast-app-frontend.onrender.com'
  ]
}));

app.use(express.json());

// static media for generated audio
// static media
const MEDIA_DIR = path.join(__dirname, 'media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
app.use('/media', express.static(MEDIA_DIR));

// request logger
// logger
app.use((req, _res, next) => {
console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
next();
});

// helper: safe JSON (prevents empty 200s)
// safe JSON helper
function safeJson(res, payload, status = 200) {
let body = payload;
if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
@@ -39,64 +44,40 @@ app.get('/api/health', (_req, res) => {
safeJson(res, { ok: true, env: process.env.NODE_ENV || 'dev' });
});

// guards
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ Missing OPENAI_API_KEY in backend/.env');
  process.exit(1);
}
if (!process.env.NEWSAPI_KEY) {
  console.warn('⚠️  Missing NEWSAPI_KEY — summaries may be generic.');
}
// env guards
if (!process.env.OPENAI_API_KEY) { console.error('❌ Missing OPENAI_API_KEY'); process.exit(1); }
if (!process.env.NEWSAPI_KEY) { console.warn('⚠️ Missing NEWSAPI_KEY — summaries may be generic.'); }

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TOPIC_CATEGORIES = new Set([
  'business', 'entertainment', 'general', 'health', 'science', 'sports', 'technology', 'world'
  'business','entertainment','general','health','science','sports','technology','world'
]);

async function fetchHeadlinesForTopic(topic) {
if (!process.env.NEWSAPI_KEY) return [];
const u = new URL('https://newsapi.org/v2/top-headlines');
  u.searchParams.set('pageSize', '12');
  u.searchParams.set('language', 'en');

  u.searchParams.set('pageSize', '12'); u.searchParams.set('language', 'en');
const canonical = String(topic || '').toLowerCase();
  if (TOPIC_CATEGORIES.has(canonical)) {
    u.searchParams.set('country', 'us');
    u.searchParams.set('category', canonical);
  } else {
    u.searchParams.set('q', canonical || 'news');
  }

  if (TOPIC_CATEGORIES.has(canonical)) { u.searchParams.set('country', 'us'); u.searchParams.set('category', canonical); }
  else { u.searchParams.set('q', canonical || 'news'); }
const resp = await fetch(u.toString(), { headers: { 'X-Api-Key': process.env.NEWSAPI_KEY } });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`NewsAPI ${resp.status}: ${t}`);
  }
  const json = await resp.json();
  return Array.isArray(json.articles) ? json.articles : [];
  if (!resp.ok) { const t = await resp.text(); throw new Error(`NewsAPI ${resp.status}: ${t}`); }
  const json = await resp.json(); return Array.isArray(json.articles) ? json.articles : [];
}

function dedupeArticles(arr) {
  const seen = new Set();
  const out = [];
  for (const a of arr) {
    const key = (a.url || a.title || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  const seen = new Set(); const out = [];
  for (const a of arr) { const key = (a.url || a.title || '').toLowerCase(); if (!key || seen.has(key)) continue; seen.add(key); out.push(a); }
return out;
}

function buildBatchPrompt(topics, articles) {
  const lines = [];
  lines.push(
    `You are a concise news editor. Create one coherent audio-ready summary that covers these topics: ${topics.join(', ')}.`
  );
  lines.push(`Write ~180–260 words. Be factual, neutral, no list formatting. Merge overlapping stories.`);
  lines.push(`Headlines:`);

  const lines = [
    `You are a concise news editor. Create one coherent audio-ready summary that covers these topics: ${topics.join(', ')}.`,
    `Write ~180–260 words. Be factual, neutral, no list formatting. Merge overlapping stories.`,
    `Headlines:`
  ];
const snippets = articles.slice(0, 14).map((a, i) => {
const src = a.source?.name || '';
const ctx = [a.description, a.content].filter(Boolean).join(' ').slice(0, 600);
@@ -110,78 +91,51 @@ function buildBatchPrompt(topics, articles) {
async function synthesizeTTS(text) {
try {
const speech = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      input: text,
      format: 'mp3',
      model: 'gpt-4o-mini-tts', voice: 'alloy', input: text, format: 'mp3',
});
const buf = Buffer.from(await speech.arrayBuffer());
    const fname = `tts-${Date.now()}.mp3`;
    const fpath = path.join(MEDIA_DIR, fname);
    const fname = `tts-${Date.now()}.mp3`; const fpath = path.join(MEDIA_DIR, fname);
fs.writeFileSync(fpath, buf);
return `/media/${fname}`;
  } catch (e) {
    console.error('TTS error:', e?.message || e);
    return null;
  }
  } catch (e) { console.error('TTS error:', e?.message || e); return null; }
}

async function buildCombinedSummary(topics) {
let collected = [];
for (const t of topics) {
try {
const arts = await fetchHeadlinesForTopic(t);
      collected = collected.concat(arts.map((a) => ({ ...a, _topic: t })));
    } catch (e) {
      console.error(`News fetch error for "${t}":`, e?.message || e);
    }
      collected = collected.concat(arts.map(a => ({ ...a, _topic: t })));
    } catch (e) { console.error(`News fetch error for "${t}":`, e?.message || e); }
}

const deduped = dedupeArticles(collected);
deduped.sort((a, b) => (new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)));

const capped = deduped.slice(0, 14);
const prompt = buildBatchPrompt(topics, capped);

let combinedText = 'No summary produced.';
try {
const summaryResp = await openai.responses.create({ model: 'gpt-4o-mini', input: prompt });
combinedText = (summaryResp.output_text || '').trim() || combinedText;
  } catch (e) {
    console.error('OpenAI summary error:', e?.message || e);
  }
  } catch (e) { console.error('OpenAI summary error:', e?.message || e); }

const audioUrl = await synthesizeTTS(combinedText);

  const combined = {
    id: `combined-${Date.now()}`,
    title: `Top ${topics.join(', ')} right now`,
    summary: combinedText,
    audioUrl,
  };

  const combined = { id: `combined-${Date.now()}`, title: `Top ${topics.join(', ')} right now`, summary: combinedText, audioUrl };
const items = capped.map((a, i) => ({
    id: `a-${i}`,
    title: a.title || 'Untitled',
    id: `a-${i}`, title: a.title || 'Untitled',
summary: [a.description, a.content].filter(Boolean).join(' ').slice(0, 220) || '',
    url: a.url || '',
    source: a.source?.name || '',
    topic: a._topic || '',
    audioUrl: null,
    url: a.url || '', source: a.source?.name || '', topic: a._topic || '', audioUrl: null,
}));

return { combined, items };
}

// single-topic (compat)
// single-topic
app.post('/api/summarize', async (req, res, next) => {
try {
const topic = (req.body?.topic || 'general').toString();
const result = await buildCombinedSummary([topic]);
safeJson(res, { combined: result.combined, items: result.items });
  } catch (err) {
    next(err);
  }
  } catch (err) { next(err); }
});

// multi-topic
@@ -191,21 +145,23 @@ app.post('/api/summarize/batch', async (req, res, next) => {
if (!topics.length) return safeJson(res, { error: 'topics[] required' }, 400);
const result = await buildCombinedSummary(topics);
safeJson(res, { combined: result.combined, items: result.items });
  } catch (err) {
    next(err);
  }
  } catch (err) { next(err); }
});

// legacy alias
app.post('/api/generate', (req, res) => res.redirect(307, '/api/summarize'));

// global error handler — always JSON, never empty 200
// JSON 404 for any /api/* not handled (prevents HTML/no-body)
app.use('/api', (req, res) => {
  safeJson(res, { error: `Not found: ${req.method} ${req.originalUrl}` }, 404);
});

// global error handler (never empty)
app.use((err, _req, res, _next) => {
console.error('Unhandled error:', err?.stack || err);
safeJson(res, { error: 'Internal server error' }, 500);
});

// start
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
console.log(`✅ API listening on http://localhost:${PORT}`);