// backend/server/index.js  (CommonJS, Node 18+)

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const compression = require("compression");
const OpenAI = require("openai");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// Node 18+ has global fetch

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || ""; // e.g. https://fetch-bpof.onrender.com

const app = express();
app.use(compression());           // gzip responses
app.use(express.json());

// CORS — allow local dev, your Render frontend, and *.onrender.com previews
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://news-podcast-app-frontend.onrender.com", // adjust if needed
]);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.has(origin) || /\.onrender\.com$/.test(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
  })
);

// Static media for TTS
const MEDIA_DIR = path.join(__dirname, "media");
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
app.use("/media", express.static(MEDIA_DIR));

// Logger
app.use((req, _res, next) => { console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`); next(); });

// Safe JSON
function safeJson(res, payload, status = 200) {
  let body = payload;
  if (!body || (typeof body === "object" && Object.keys(body).length === 0)) body = { ok: true };
  res.status(status).type("application/json").send(JSON.stringify(body));
}

// Health
app.get("/api/health", (_req, res) => { safeJson(res, { ok: true, env: process.env.NODE_ENV || "dev" }); });

// Env guards
if (!process.env.OPENAI_API_KEY) { console.error("❌ Missing OPENAI_API_KEY"); process.exit(1); }
if (!process.env.NEWSAPI_KEY) { console.warn("⚠️  Missing NEWSAPI_KEY — summaries may be generic."); }

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Categories
const TOPIC_CATEGORIES = new Set(["business","entertainment","general","health","science","sports","technology","world"]);

// Tiny in-memory caches
const headlinesCache = new Map(); // topic -> { ts, data }
const HEADLINES_TTL_MS = 60_000;

// Fetch with timeout
async function fetchWithTimeout(url, opts = {}, ms = 5000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const resp = await fetch(url, { ...opts, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(t);
  }
}

async function fetchHeadlinesForTopic(topic) {
  if (!process.env.NEWSAPI_KEY) return [];
  const key = String(topic || "").toLowerCase();
  const cached = headlinesCache.get(key);
  const now = Date.now();
  if (cached && now - cached.ts < HEADLINES_TTL_MS) return cached.data;

  const u = new URL("https://newsapi.org/v2/top-headlines");
  u.searchParams.set("pageSize", "8");           // smaller = faster
  u.searchParams.set("language", "en");
  if (TOPIC_CATEGORIES.has(key)) {
    u.searchParams.set("country", "us");
    u.searchParams.set("category", key);
  } else {
    u.searchParams.set("q", key || "news");
  }

  const resp = await fetchWithTimeout(u.toString(), {
    headers: { "X-Api-Key": process.env.NEWSAPI_KEY },
  }, 5000); // 5s per topic
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`NewsAPI ${resp.status}: ${t}`);
  }
  const json = await resp.json();
  const data = Array.isArray(json.articles) ? json.articles : [];
  headlinesCache.set(key, { ts: now, data });
  return data;
}

function dedupeArticles(arr) {
  const seen = new Set();
  const out = [];
  for (const a of arr) {
    const k = (a.url || a.title || "").toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

function normalizeWordCount(n) {
  const x = Math.floor(Number(n) || 200);
  return Math.max(100, Math.min(3000, x));
}

function buildBatchPrompt(topics, articles, wordCount) {
  const targetWords = normalizeWordCount(wordCount);
  const lines = [
    `You are a concise news editor. Create ONE coherent, flowing, audio-ready summary that covers these topics: ${topics.join(", ")}.`,
    `Write ~${targetWords} words (±15%). Be factual, neutral, no bullet lists. Merge overlapping stories. Use brief transitions so it sounds natural.`,
    `Headlines & context:`,
  ];
  const snippets = articles.slice(0, 10).map((a, i) => { // fewer snippets => faster prompting
    const src = a.source?.name || "";
    const ctx = [a.description, a.content].filter(Boolean).join(" ").slice(0, 360); // shorter ctx
    return `${i + 1}. ${a.title || "Untitled"} (${src}) — ${ctx}`;
  });
  lines.push(snippets.join("\n"));
  return lines.join("\n");
}

async function synthesizeTTS(text) {
  try {
    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: text,
      format: "mp3",
    });
    const buf = Buffer.from(await speech.arrayBuffer());
    const fname = `tts-${Date.now()}.mp3`;
    const fpath = path.join(MEDIA_DIR, fname);
    fs.writeFileSync(fpath, buf);
    return PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/media/${fname}` : `/media/${fname}`;
  } catch (e) {
    console.error("TTS error:", e?.message || e);
    return null;
  }
}

async function buildCombinedSummary(topics, wordCount = 200, { noTts = false } = {}) {
  // Fetch all topics IN PARALLEL
  const results = await Promise.allSettled(
    topics.map(t => fetchHeadlinesForTopic(t))
  );
  let collected = [];
  results.forEach((r, idx) => {
    if (r.status === "fulfilled") {
      const t = topics[idx];
      collected = collected.concat(r.value.map(a => ({ ...a, _topic: t })));
    } else {
      console.error(`News fetch error for "${topics[idx]}":`, r.reason?.message || r.reason);
    }
  });

  const deduped = dedupeArticles(collected);
  deduped.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  const capped = deduped.slice(0, 12); // reasonable context size
  const prompt = buildBatchPrompt(topics, capped, wordCount);

  let combinedText = "No summary produced.";
  try {
    const summaryResp = await openai.responses.create({ model: "gpt-4o-mini", input: prompt });
    combinedText = (summaryResp.output_text || "").trim() || combinedText;
  } catch (e) {
    console.error("OpenAI summary error:", e?.message || e);
  }

  // OPTION: skip TTS for faster first paint
  const audioUrl = noTts ? null : await synthesizeTTS(combinedText);

  const combined = {
    id: `combined-${Date.now()}`,
    title: `Top ${topics.join(", ")}`,
    summary: combinedText,
    audioUrl,
  };

  const items = capped.map((a, i) => ({
    id: `a-${i}`,
    title: a.title || "Untitled",
    summary: [a.description, a.content].filter(Boolean).join(" ").slice(0, 220) || "",
    url: a.url || "",
    source: a.source?.name || "",
    topic: a._topic || "",
    audioUrl: null, // sources only
  }));

  return { combined, items };
}

// Single-topic
app.post("/api/summarize", async (req, res, next) => {
  try {
    const topic = (req.body?.topic || "general").toString();
    const wordCount = normalizeWordCount(req.body?.wordCount);
    const noTts = String(req.query.noTts || "0") === "1";
    const result = await buildCombinedSummary([topic], wordCount, { noTts });
    safeJson(res, { combined: result.combined, items: result.items });
  } catch (err) { next(err); }
});

// Multi-topic
app.post("/api/summarize/batch", async (req, res, next) => {
  try {
    const topics = Array.isArray(req.body?.topics)
      ? req.body.topics.map(t => String(t || "").trim()).filter(Boolean)
      : [];
    if (!topics.length) return safeJson(res, { error: "topics[] required" }, 400);

    const wordCount = normalizeWordCount(req.body?.wordCount);
    const noTts = String(req.query.noTts || "0") === "1";
    const result = await buildCombinedSummary(topics, wordCount, { noTts });
    safeJson(res, { combined: result.combined, items: result.items });
  } catch (err) { next(err); }
});

// NEW: on-demand TTS (fast flow: text -> then audio)
app.post("/api/tts", async (req, res) => {
  const text = (req.body?.text || "").toString();
  if (!text.trim()) return safeJson(res, { error: "text required" }, 400);
  const url = await synthesizeTTS(text);
  safeJson(res, { audioUrl: url });
});

// JSON 404 for /api/*
app.use("/api", (req, res) => { safeJson(res, { error: `Not found: ${req.method} ${req.originalUrl}` }, 404); });

// Global error handler
app.use((err, _req, res, _next) => { console.error("Unhandled error:", err?.stack || err); safeJson(res, { error: "Internal server error" }, 500); });

// Start
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => { console.log(`✅ API listening on http://localhost:${PORT}`); });
