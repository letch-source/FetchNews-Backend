// backend/server/index.js  (CommonJS, Node 18+)

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai"); // CommonJS import for SDK v4
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// Node 18+ has global fetch

// === Config ===
// Set this in Render backend env to your service URL, e.g. https://fetch-bpof.onrender.com
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";

// App
const app = express();

// CORS — allow local dev, your Render frontend, and any *.onrender.com previews
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://news-podcast-app-frontend.onrender.com", // adjust if your slug differs
]);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl / same-origin
      if (ALLOWED_ORIGINS.has(origin) || /\.onrender\.com$/.test(origin)) {
        return cb(null, true);
      }
      return cb(null, false);
    },
  })
);

app.use(express.json());

// Static media (TTS mp3 files)
const MEDIA_DIR = path.join(__dirname, "media");
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
app.use("/media", express.static(MEDIA_DIR));

// Logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Safe JSON helper
function safeJson(res, payload, status = 200) {
  let body = payload;
  if (!body || (typeof body === "object" && Object.keys(body).length === 0)) {
    body = { ok: true };
  }
  res.status(status).type("application/json").send(JSON.stringify(body));
}

// Health
app.get("/api/health", (_req, res) => {
  safeJson(res, { ok: true, env: process.env.NODE_ENV || "dev" });
});

// Env guards
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}
if (!process.env.NEWSAPI_KEY) {
  console.warn("⚠️  Missing NEWSAPI_KEY — summaries may be generic.");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Canonical NewsAPI categories
const TOPIC_CATEGORIES = new Set([
  "business",
  "entertainment",
  "general",
  "health",
  "science",
  "sports",
  "technology",
  "world",
]);

async function fetchHeadlinesForTopic(topic) {
  if (!process.env.NEWSAPI_KEY) return [];
  const u = new URL("https://newsapi.org/v2/top-headlines");
  u.searchParams.set("pageSize", "12");
  u.searchParams.set("language", "en");

  const canonical = String(topic || "").toLowerCase();
  if (TOPIC_CATEGORIES.has(canonical)) {
    u.searchParams.set("country", "us");
    u.searchParams.set("category", canonical);
  } else {
    u.searchParams.set("q", canonical || "news");
  }

  const resp = await fetch(u.toString(), {
    headers: { "X-Api-Key": process.env.NEWSAPI_KEY },
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`NewsAPI ${resp.status}: ${t}`);
  }
  const json = await resp.json();
  return Array.isArray(json.articles) ? json.articles : [];
}

function dedupeArticles(arr) {
  const seen = new Set();
  const out = [];
  for (const a of arr) {
    const key = (a.url || a.title || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

function buildBatchPrompt(topics, articles) {
  const lines = [
    `You are a concise news editor. Create one coherent audio-ready summary that covers these topics: ${topics.join(", ")}.`,
    `Write ~180–260 words. Be factual, neutral, no list formatting. Merge overlapping stories.`,
    `Headlines:`,
  ];
  const snippets = articles.slice(0, 14).map((a, i) => {
    const src = a.source?.name || "";
    const ctx = [a.description, a.content].filter(Boolean).join(" ").slice(0, 600);
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

    // Return absolute URL in prod if PUBLIC_BASE_URL is set
    return PUBLIC_BASE_URL
      ? `${PUBLIC_BASE_URL}/media/${fname}`
      : `/media/${fname}`;
  } catch (e) {
    console.error("TTS error:", e?.message || e);
    return null;
  }
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
  }

  const deduped = dedupeArticles(collected);
  deduped.sort(
    (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
  );

  const capped = deduped.slice(0, 14);
  const prompt = buildBatchPrompt(topics, capped);

  let combinedText = "No summary produced.";
  try {
    const summaryResp = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });
    combinedText = (summaryResp.output_text || "").trim() || combinedText;
  } catch (e) {
    console.error("OpenAI summary error:", e?.message || e);
  }

  const audioUrl = await synthesizeTTS(combinedText);

  const combined = {
    id: `combined-${Date.now()}`,
    title: `Top ${topics.join(", ")} right now`,
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
    audioUrl: null, // per-article TTS not generated
  }));

  return { combined, items };
}

// Single-topic
app.post("/api/summarize", async (req, res, next) => {
  try {
    const topic = (req.body?.topic || "general").toString();
    const result = await buildCombinedSummary([topic]);
    safeJson(res, { combined: result.combined, items: result.items });
  } catch (err) {
    next(err);
  }
});

// Multi-topic
app.post("/api/summarize/batch", async (req, res, next) => {
  try {
    const topics = Array.isArray(req.body?.topics)
      ? req.body.topics.map((t) => String(t || "").trim()).filter(Boolean)
      : [];
    if (!topics.length) return safeJson(res, { error: "topics[] required" }, 400);
    const result = await buildCombinedSummary(topics);
    safeJson(res, { combined: result.combined, items: result.items });
  } catch (err) {
    next(err);
  }
});

// JSON 404 for /api/*
app.use("/api", (req, res) => {
  safeJson(res, { error: `Not found: ${req.method} ${req.originalUrl}` }, 404);
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err?.stack || err);
  safeJson(res, { error: "Internal server error" }, 500);
});

// Start
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ API listening on http://localhost:${PORT}`);
});
