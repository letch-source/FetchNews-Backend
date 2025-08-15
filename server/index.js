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

// Map US state full names to USPS abbreviations
function stateAbbrevFor(region) {
  const m = {
    "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO",
    "Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID",
    "Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA",
    "Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS",
    "Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ",
    "New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK",
    "Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD",
    "Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA",
    "West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY","District of Columbia":"DC","Washington, D.C.":"DC"
  };
  return m[(region || "").trim()] || null;
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

// ---- NewsAPI helpers ----
async function callNewsApi(pathname, params, timeoutMs = 5000) {
  if (!process.env.NEWSAPI_KEY) return { articles: [] };
  const u = new URL(`https://newsapi.org/v2${pathname}`);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v != null && v !== "") u.searchParams.set(k, String(v));
  });
  const resp = await fetchWithTimeout(
    u.toString(),
    { headers: { "X-Api-Key": process.env.NEWSAPI_KEY } },
    timeoutMs
  );
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`NewsAPI ${pathname} ${resp.status}: ${t}`);
  }
  return resp.json();
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

// Build a location-focused query with synonyms and state/county hints
function stateAbbrevFor(region) {
  const m = {
    "California": "CA",
    "New York": "NY",
    "Texas": "TX",
    "Florida": "FL",
    "Illinois": "IL",
    "Pennsylvania": "PA",
    "Ohio": "OH",
    "Georgia": "GA",
    "North Carolina": "NC",
    "Michigan": "MI",
    // add more as needed
  };
  return m[region] || null;
}

function buildLocalQueryKeywords(geo = {}) {
  const city = (geo.city || "").trim();
  const region = (geo.region || "").trim();
  const abbr = stateAbbrevFor(region);
  const county = /los angeles/i.test(region) || /los angeles/i.test(city) ? "Los Angeles County" : "";

  // City synonyms (customize per city as needed)
  const citySyn = [];
  if (/^west hollywood$/i.test(city)) citySyn.push('"WeHo"', '"West Hollywood"');

  const parts = [];
  if (city) parts.push(`"${city}"`);
  if (citySyn.length) parts.push(citySyn.join(" OR "));
  if (county) parts.push(`"${county}"`);
  if (region) parts.push(`"${region}"`);
  if (abbr) parts.push(`"${abbr}"`); // e.g., "CA"

  // Bias to civic/local beats
  const qualifier = "(news OR local OR city OR county OR council OR mayor OR police OR fire OR school OR traffic OR housing)";
  const base = parts.length ? `(${parts.join(" OR ")})` : "";
  return base ? `${base} AND ${qualifier}` : qualifier;
}

// Merge and dedupe (by url/title) preserving newest first
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

async function fetchLocalHeadlines(geo = {}) {
  if (!process.env.NEWSAPI_KEY) return [];

  const countryCode = String(geo.country || "US").toLowerCase();
  const stateName = (geo.region || "").trim();         // e.g., "California"
  const stateAbbr = stateAbbrevFor(stateName);         // e.g., "CA"
  const cityName  = (geo.city || "").trim();           // optional city

  // --- Build state-focused queries ---
  // A) Headlines that explicitly name the state (or its USPS abbr) in the TITLE
  const qInTitle = [stateName, stateAbbr].filter(Boolean).map(s => `"${s}"`).join(" OR ") || null;

  // B) Wider query: state in title/description plus civic/local terms to reduce noise
  const qualifier = "(news OR local OR county OR city OR council OR mayor OR police OR fire OR school OR housing OR development OR traffic)";
  const qStateWide = stateName ? `("${stateName}"${stateAbbr ? ` OR "${stateAbbr}"` : ""}) AND ${qualifier}` : qualifier;

  // C) Optional city boost (if we have a city): city/county tokens
  const countyMaybe = /los angeles/i.test(stateName) || /los angeles/i.test(cityName) ? "Los Angeles County" : "";
  const qCityWide = cityName
    ? `("${cityName}"${countyMaybe ? ` OR "${countyMaybe}"` : ""}${stateName ? ` OR "${stateName}"` : ""}${stateAbbr ? ` OR "${stateAbbr}"` : ""}) AND ${qualifier}`
    : null;

  // Fire off requests
  const pTitle = qInTitle
    ? callNewsApi("/everything", {
        qInTitle,
        sortBy: "publishedAt",
        pageSize: 50,
        language: countryCode === "us" ? "en" : undefined
      })
    : Promise.resolve({ articles: [] });

  const pStateWide = callNewsApi("/everything", {
    q: qStateWide,
    searchIn: "title,description",
    sortBy: "publishedAt",
    pageSize: 50,
    language: countryCode === "us" ? "en" : undefined
  });

  const pCityWide = qCityWide
    ? callNewsApi("/everything", {
        q: qCityWide,
        searchIn: "title,description",
        sortBy: "publishedAt",
        pageSize: 40,
        language: countryCode === "us" ? "en" : undefined
      })
    : Promise.resolve({ articles: [] });

  // Optional lightweight backstop (national top-headlines) if results are thin
  const pTop = callNewsApi("/top-headlines", {
    pageSize: 15,
    country: countryCode
  });

  const [rTitle, rStateWide, rCityWide, rTop] = await Promise.allSettled([
    pTitle, pStateWide, pCityWide, pTop
  ]);

  // Merge
  let articles = [];
  if (rTitle.status === "fulfilled")     articles = articles.concat(rTitle.value.articles || []);
  if (rStateWide.status === "fulfilled") articles = articles.concat(rStateWide.value.articles || []);
  if (rCityWide.status === "fulfilled")  articles = articles.concat(rCityWide.value.articles || []);

  // Dedupe + recency sort
  const seen = new Set();
  const deduped = [];
  for (const a of articles) {
    const k = (a.url || a.title || "").toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    deduped.push(a);
  }
  deduped.sort((x, y) => new Date(y.publishedAt || 0) - new Date(x.publishedAt || 0));

  // If thin, sprinkle only top-headlines that mention the state tokens to avoid drift
  if (deduped.length < 12 && rTop.status === "fulfilled") {
    const needles = [stateName, stateAbbr, cityName].filter(Boolean).map(s => s.toLowerCase());
    const filteredTop = (rTop.value.articles || []).filter(a => {
      const hay = `${a.title || ""} ${a.description || ""}`.toLowerCase();
      return needles.some(n => n && hay.includes(n));
    });
    for (const a of filteredTop) {
      const k = (a.url || a.title || "").toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      deduped.push(a);
    }
  }

  // Cap for prompt size
  return deduped.slice(0, 30);
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

async function buildCombinedSummary(topics, wordCount = 200, { noTts = false, geo = null } = {}) {
  // Fetch all topics IN PARALLEL (special-case "local")
  const results = await Promise.allSettled(
    topics.map(t => {
      if (String(t).toLowerCase() === "local") {
        return fetchLocalHeadlines(geo || {}); // geo may be null; function handles fallback
      }
      return fetchHeadlinesForTopic(t);
    })
  );

  let collected = [];
  results.forEach((r, idx) => {
    const t = topics[idx];
    if (r.status === "fulfilled") {
      collected = collected.concat(r.value.map(a => ({ ...a, _topic: t })));
    } else {
      console.error(`News fetch error for "${t}":`, r.reason?.message || r.reason);
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

const prettyLocal = (geo && (geo.city || geo.region || geo.country))
  ? ` — ${[geo.city, geo.region].filter(Boolean).join(", ") || geo.country}`
  : "";

const combined = {
  id: `combined-${Date.now()}`,
  title: `Top ${topics.join(", ")}${prettyLocal}`,
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
    // optional geo from client for "local"
    const geo = req.body?.geo && typeof req.body.geo === "object" ? req.body.geo : null;

    const result = await buildCombinedSummary([topic], wordCount, { noTts, geo });
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
    // optional geo from client if "local" is among topics
    const geo = req.body?.geo && typeof req.body.geo === "object" ? req.body.geo : null;

    const result = await buildCombinedSummary(topics, wordCount, { noTts, geo });
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
