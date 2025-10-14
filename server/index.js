// app.js (backend server)

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// --- Config & helpers ---
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret"; // fallback to avoid "secretOrPrivateKey must have a value"
const NEWSAPI_KEY = process.env.NEWSAPI_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// --- In-memory data store fallback (replace with SQLite later) ---
let users = []; // [{ email, passwordHash, topics: [], location: "" }]

// --- Load from disk so it survives restarts ---
const USERS_FILE = path.join(__dirname, "users.json");
if (fs.existsSync(USERS_FILE)) {
  try {
    users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch (e) {
    console.error("Failed to read users.json:", e);
    users = [];
  }
}
function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error("Failed to write users.json:", e);
  }
}

// --- CORS setup ---
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN; // e.g. "https://your-frontend.onrender.com"
const ALLOWED_ORIGINS = new Set(
  [
    "http://localhost:3000",
    "http://localhost:5173",
    FRONTEND_ORIGIN,
  ].filter(Boolean)
);

app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin / non-browser requests with no Origin header
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
      return cb(new Error(`Not allowed by CORS: ${origin}`), false);
    },
    credentials: true,
  })
);

// --- Static media ---
const MEDIA_DIR = path.join(__dirname, "media");
if (!fs.existsSync(MEDIA_DIR)) {
  try { fs.mkdirSync(MEDIA_DIR, { recursive: true }); } catch {}
}
app.use("/media", express.static(MEDIA_DIR, { fallthrough: true }));

// --- News helpers ---
const CORE_CATEGORIES = new Set([
  "business",
  "entertainment",
  "general",
  "health",
  "science",
  "sports",
  "technology",
  "world", // not a NewsAPI category; fallback to q=world
]);

async function fetchArticlesEverything(qParts, maxResults) {
  const q = encodeURIComponent(qParts.filter(Boolean).join(" "));
  const pageSize = Math.min(Math.max(Number(maxResults) || 5, 1), 50);
  // Prefer recent coverage window to improve relevance/locality
  const from = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const url = `https://newsapi.org/v2/everything?q=${q}&language=en&sortBy=publishedAt&pageSize=${pageSize}&from=${from}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${NEWSAPI_KEY}` } });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`NewsAPI error: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  return Array.isArray(data.articles) ? data.articles : [];
}

async function fetchTopHeadlinesByCategory(category, countryCode, maxResults, extraQuery) {
  const pageSize = Math.min(Math.max(Number(maxResults) || 5, 1), 50);
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (countryCode) params.set("country", String(countryCode).toLowerCase());
  if (extraQuery) params.set("q", extraQuery);
  params.set("pageSize", String(pageSize));
  const url = `https://newsapi.org/v2/top-headlines?${params.toString()}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${NEWSAPI_KEY}` } });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`NewsAPI error: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  return Array.isArray(data.articles) ? data.articles : [];
}

async function fetchArticlesForTopic(topic, geo, maxResults) {
  const queryParts = [topic];
  const countryCode = geo?.country || geo?.countryCode || "";
  const region = geo?.region || geo?.state || "";
  const city = geo?.city || "";
  if (region) queryParts.push(region);
  if (city) queryParts.push(city);
  const pageSize = Math.min(Math.max(Number(maxResults) || 5, 1), 50);

  if (!NEWSAPI_KEY) {
    return { articles: [], note: "Missing NEWSAPI_KEY" };
  }

  let articles = [];
  const normalizedTopic = String(topic || "").toLowerCase();
  const useCategory = CORE_CATEGORIES.has(normalizedTopic) && normalizedTopic !== "world";
  const isLocal = normalizedTopic === "local";

  if (isLocal) {
    // Strategy 1: Try strict local with city/region names
    const qStrict = city || region || "";
    if (qStrict) {
      articles = await fetchTopHeadlinesByCategory("general", countryCode, pageSize, `"${qStrict}"`);
    }
    
    // Strategy 2: Try broader regional search
    if ((articles?.length || 0) < Math.min(3, pageSize) && region) {
      const extra = await fetchTopHeadlinesByCategory("general", countryCode, pageSize, region);
      articles = [...articles, ...extra];
    }
    
    // Strategy 3: Try everything endpoint with location terms
    if ((articles?.length || 0) < Math.min(5, pageSize) && (city || region)) {
      const qInTitle = city || region;
      const extra = await fetchArticlesEverything([`title:${qInTitle}`], pageSize - (articles?.length || 0));
      articles = [...articles, ...extra];
    }
    
    // Strategy 4: Try general search with location terms
    if ((articles?.length || 0) < Math.min(5, pageSize)) {
      const extra = await fetchArticlesEverything([city, region].filter(Boolean), pageSize - (articles?.length || 0));
      articles = [...articles, ...extra];
    }
    
    // Strategy 5: Fallback to country-wide news if no local articles found
    if ((articles?.length || 0) < Math.min(3, pageSize) && countryCode) {
      const fallback = await fetchTopHeadlinesByCategory("general", countryCode, pageSize - (articles?.length || 0));
      articles = [...articles, ...fallback];
    }
    
    // Strategy 6: Final fallback to general news
    if ((articles?.length || 0) < Math.min(3, pageSize)) {
      const finalFallback = await fetchTopHeadlinesByCategory("general", "", pageSize - (articles?.length || 0));
      articles = [...articles, ...finalFallback];
    }
  } else if (useCategory) {
    const category = normalizedTopic;
    // Include a light keyword from region/city if present to bias towards local context
    const bias = city || region || "";
    articles = await fetchTopHeadlinesByCategory(category, countryCode, pageSize, bias || undefined);
    if ((articles?.length || 0) < Math.min(5, pageSize) && bias) {
      const extra = await fetchArticlesEverything([normalizedTopic, bias], pageSize - (articles?.length || 0));
      articles = [...articles, ...extra];
    }
  } else {
    articles = await fetchArticlesEverything(queryParts, pageSize);
  }

  const normalized = articles.map((a) => ({
    title: a.title || "",
    description: a.description || "",
    url: a.url || "",
    source: (a.source && a.source.name) || "",
    publishedAt: a.publishedAt || "",
    urlToImage: a.urlToImage || "",
  }));

  return { articles: normalized };
}

function summarizeArticlesSimple(topic, geo, articles, wordCount) {
  const baseParts = [String(topic || "").trim()];
  if (geo?.region) baseParts.push(geo.region);
  if (geo?.country || geo?.countryCode) baseParts.push(geo.country || geo.countryCode);
  const base = baseParts.filter(Boolean).join(" ");

  if (!articles || articles.length === 0) {
    return `No recent coverage found for ${base}.`;
  }

  const topicLowerForMode = String(topic || "").toLowerCase();
  const isLocalMode = topicLowerForMode === "local";
  const isCoreTopicMode = CORE_CATEGORIES.has(topicLowerForMode);

  // helper: strip trailing publisher from title (e.g., " - BBC", " | BBC", " — AOL.com")
  function cleanTitle(rawTitle = "") {
    let t = String(rawTitle).trim();
    if (!t) return t;
    const suffixRe = /\s+(?:-|\||—|–)\s+[^\-\|—–]{2,}$/u;
    let prev;
    do {
      prev = t;
      t = t.replace(suffixRe, "");
    } while (t !== prev);
    return t.trim().replace(/[\s\-–—]+$/u, "");
  }

  function tokenSet(s) {
    return new Set(String(s).toLowerCase().replace(/[^a-z0-9\s]/gi, " ").split(/\s+/).filter((w) => w.length >= 3));
  }
  function isRedundant(title, desc) {
    const tset = tokenSet(title);
    const dset = tokenSet(desc);
    if (tset.size === 0 || dset.size === 0) return false;
    let inter = 0;
    for (const w of dset) if (tset.has(w)) inter++;
    const union = new Set([...tset, ...dset]).size || 1;
    const jaccard = inter / union;
    return jaccard >= 0.7;
  }

  // New: extract blurb sentences that mention topic or geo terms
  function extractRelevantBlurb(title, description) {
    const topicTokens = String(topic || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3);
    const geoTokens = [geo?.city, geo?.region, geo?.country, geo?.countryCode]
      .map((t) => String(t || "").toLowerCase())
      .filter((t) => t.length >= 3);

    const sentences = String(description || "")
      .replace(/\s+/g, " ")
      .split(/(?<=[\.!?])\s+/);

    function containsAny(s, toks) {
      const lc = String(s || "").toLowerCase();
      return toks.some((t) => t && lc.includes(t));
    }

    // Prefer sentences that mention both topic and geo
    const both = sentences.filter((s) => containsAny(s, topicTokens) && containsAny(s, geoTokens));
    if (both.length) return both.slice(0, 2).join(" ");

    // Then sentences that mention topic
    const topicOnly = sentences.filter((s) => containsAny(s, topicTokens));
    if (topicOnly.length) return topicOnly.slice(0, 2).join(" ");

    // Then sentences that mention geo (only if local)
    if (isLocalMode) {
      const geoOnly = sentences.filter((s) => containsAny(s, geoTokens));
      if (geoOnly.length) return geoOnly.slice(0, 1).join(" ");
    }

    // For local mode, be more lenient - use any description or title
    if (isLocalMode) {
      if (description && !isRedundant(title, description)) {
        return sentences[0] || "";
      }
      // If no good description, use title as fallback
      return title || "";
    }

    // For core topics, allow a general first sentence
    if (isCoreTopicMode) {
      const first = sentences[0] || "";
      return first;
    }

    // Fallback: if description is redundant with title, return empty to mark irrelevant
    if (!description || isRedundant(title, description)) return "";

    // Otherwise, return first sentence
    return sentences[0] || "";
  }

  // Scale by requested length
  const maxItems = wordCount >= 1500 ? 12 : wordCount >= 800 ? 8 : 5;

  // Deduplicate (exact-ish)
  function makeKey(a) {
    const t = cleanTitle(a.title || "");
    const d = String(a.description || "").toLowerCase();
    return (t + "|" + d).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 160);
  }
  const seen = new Set();
  const unique = [];
  for (const a of articles) {
    const key = makeKey(a);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(a);
    if (unique.length >= maxItems) break;
  }
  if (unique.length === 0) return `No recent coverage found for ${base}.`;

  // Collapse near-duplicate stories across multiple sources using token overlap clustering
  const STOPWORDS = new Set([
    "the","and","for","with","from","that","this","into","over","after","before","about","your","news",
    "week","today","tonight","update","updates","breaking","live","report","reports","says","as","in","on"
  ]);
  function normalizeTokens(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  }
  function jaccard(aTokens, bTokens) {
    const aSet = new Set(aTokens);
    let inter = 0;
    for (const w of bTokens) if (aSet.has(w)) inter++;
    const union = new Set([...aTokens, ...bTokens]).size || 1;
    return inter / union;
  }

  const clusters = [];
  const used = new Set();
  for (let i = 0; i < unique.length; i++) {
    if (used.has(i)) continue;
    const a = unique[i];
    const aTitle = cleanTitle(a.title || "");
    const aTokens = normalizeTokens(aTitle);
    const group = [i];
    used.add(i);
    for (let j = i + 1; j < unique.length; j++) {
      if (used.has(j)) continue;
      const b = unique[j];
      const bTitle = cleanTitle(b.title || "");
      const bTokens = normalizeTokens(bTitle);
      const sim = jaccard(aTokens, bTokens);
      if (sim >= 0.5) {
        group.push(j);
        used.add(j);
      }
    }
    clusters.push(group);
  }

  // Build sentences: one per cluster, prefer a relevant blurb; for core allow title-only
  const sentences = [];
  const opening = `Here’s your ${String(topic || "").trim()} news.`;
  sentences.push(opening);

  for (const group of clusters) {
    let bestIdx = -1;
    let bestScore = -1;
    let bestBlurb = "";
    for (const idx of group) {
      const it = unique[idx];
      const title = cleanTitle((it.title || "").replace(/[\s\-–—]+$/g, "").trim());
      const blurb = extractRelevantBlurb(title, it.description || "").trim();
      if (!blurb && !isCoreTopicMode) continue; // require relevance unless core
      const score = (blurb ? blurb.length : 0) + (title ? 10 : 0);
      if (score > bestScore) { bestScore = score; bestIdx = idx; bestBlurb = blurb; }
    }
    if (bestIdx === -1) continue;

    const rep = unique[bestIdx];
    const repTitle = cleanTitle((rep.title || "").replace(/[\s\-–—]+$/g, "").trim());
    const blurb = bestBlurb; // may be empty for core

    let line = repTitle;
    if (blurb && !isRedundant(repTitle, blurb)) {
      line = `${repTitle}. ${blurb}`;
    }
    if (!/[\.!?]$/.test(line)) line += ".";
    sentences.push(line);
  }

  const maxSentenceCount = wordCount >= 1500 ? sentences.length : wordCount >= 800 ? Math.min(sentences.length, 7) : Math.min(sentences.length, 5);
  const trimmed = sentences.slice(0, maxSentenceCount);

  const paragraph = trimmed.join(" ");
  const maxChars = Math.min(Math.max(wordCount * 6, 800), 12000);
  return paragraph.length > maxChars ? paragraph.slice(0, maxChars - 3) + "..." : paragraph;
}

// Relevance filter: keep articles that explicitly mention the topic or local geo
function filterRelevantArticles(topic, geo, articles, minCount = 6) {
  const original = Array.isArray(articles) ? articles : [];
  const out = [];
  const topicLower = String(topic || "").toLowerCase();
  const isLocal = topicLower === "local";
  const geoTokens = new Set(
    [geo?.city, geo?.region, geo?.country, geo?.countryCode]
      .map((s) => String(s || "").toLowerCase())
      .filter((s) => s.length >= 2)
  );
  const topicTokens = new Set(
    topicLower
      .split(/[^a-z0-9]+/i)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s && s.length >= 3)
  );

  function textHasAny(text, tokens) {
    const t = String(text || "").toLowerCase();
    for (const tok of tokens) {
      if (tok && t.includes(tok)) return true;
    }
    return false;
  }

  // First pass: strict matches
  for (const a of original) {
    const t = a.title || "";
    const d = a.description || "";
    if (isLocal) {
      // For local news, be more lenient - include articles that mention location OR are recent general news
      if (geoTokens.size > 0 && (textHasAny(t, geoTokens) || textHasAny(d, geoTokens))) {
        out.push(a);
      } else if (geoTokens.size === 0) {
        // If no location data, include recent articles as fallback
        out.push(a);
      }
    } else {
      if (CORE_CATEGORIES.has(topicLower)) {
        out.push(a);
      } else if (topicTokens.size > 0 && (textHasAny(t, topicTokens) || textHasAny(d, topicTokens))) {
        out.push(a);
      }
    }
  }

  // If we have enough, return
  if (out.length >= minCount) return out.slice(0, minCount);

  // Second pass: score and backfill best near matches until minCount
  function score(a) {
    const t = (a.title || "").toLowerCase();
    const d = (a.description || "").toLowerCase();
    let s = 0;
    // Geo boosts
    for (const g of geoTokens) {
      if (!g) continue;
      if (t.includes(g)) s += 2; else if (d.includes(g)) s += 1;
    }
    // Topic boosts (for non-core topics)
    if (!CORE_CATEGORIES.has(topicLower)) {
      for (const k of topicTokens) {
        if (!k) continue;
        if (t.includes(k)) s += 2; else if (d.includes(k)) s += 1;
      }
    }
    // Freshness boost via publishedAt presence
    if (a.publishedAt) s += 0.5;
    return s;
  }

  const selected = new Set(out);
  const candidates = original
    .filter((a) => !selected.has(a))
    .map((a) => ({ a, s: score(a) }))
    .sort((x, y) => y.s - x.s);

  for (const { a } of candidates) {
    out.push(a);
    if (out.length >= minCount) break;
  }

  // For local news, if we still don't have enough, be more permissive
  if (isLocal && out.length < minCount) {
    const remaining = original.filter((a) => !selected.has(a));
    for (const a of remaining) {
      out.push(a);
      if (out.length >= minCount) break;
    }
  }

  // Fallback to originals if still empty
  return out.length > 0 ? out : original.slice(0, minCount);
}

// --- JWT helper ---
function createToken(user) {
  return jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: "7d" });
}
function authMiddleware(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = users.find((u) => u.email === decoded.email);
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

// --- Routes ---

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    jwtConfigured: !!process.env.JWT_SECRET, // true means you're using a real secret
    newsConfigured: !!process.env.NEWSAPI_KEY,
    ttsConfigured: !!process.env.OPENAI_API_KEY,
  });
});

// Signup
app.post("/api/auth/signup", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });

  if (users.find((u) => u.email === email)) {
    return res.status(400).json({ error: "Email already in use" });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const newUser = { email, passwordHash, topics: [], location: "" };
  users.push(newUser);
  saveUsers();

  const token = createToken(newUser);
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  res.json({
    message: "Signup successful",
    user: { email, topics: [], location: "" },
  });
});

// Login
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = users.find((u) => u.email === email);
  if (!user) return res.status(400).json({ error: "Invalid credentials" });
  if (!bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(400).json({ error: "Invalid credentials" });
  }
  const token = createToken(user);
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  res.json({
    message: "Login successful",
    user: { email, topics: user.topics, location: user.location },
  });
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  res.json({ message: "Logged out" });
});

// Get current user
app.get("/api/user", authMiddleware, (req, res) => {
  res.json({
    email: req.user.email,
    topics: req.user.topics,
    location: req.user.location,
  });
});

// Add custom topic
app.post("/api/topics", authMiddleware, (req, res) => {
  const { topic } = req.body || {};
  if (!topic) return res.status(400).json({ error: "Topic required" });
  if (!req.user.topics.includes(topic)) {
    req.user.topics.push(topic);
    saveUsers();
  }
  res.json({ topics: req.user.topics });
});

// Remove custom topic
app.delete("/api/topics", authMiddleware, (req, res) => {
  const { topic } = req.body || {};
  req.user.topics = req.user.topics.filter((t) => t !== topic);
  saveUsers();
  res.json({ topics: req.user.topics });
});

// Update location
app.post("/api/location", authMiddleware, (req, res) => {
  const { location } = req.body || {};
  req.user.location = location || "";
  saveUsers();
  res.json({ location: req.user.location });
});

// --- Summarization routes (NewsAPI-backed) ---

// Single summarize: expects { topics: string[], wordCount?: number, location?: string }
app.post("/api/summarize", async (req, res) => {
  try {
    const { topics = [], wordCount = 200, location = "", geo = null } = req.body || {};
    if (!Array.isArray(topics)) {
      return res.status(400).json({ error: "topics must be an array" });
    }

    const items = [];
    const combinedPieces = [];
    const globalCandidates = [];

    function extractRelevantBlurbForSource(topic, geo, a) {
      const topicLower = String(topic || "").toLowerCase();
      const isLocal = topicLower === "local";
      const isCore = CORE_CATEGORIES.has(topicLower);
      const title = (a.title || "");
      const desc = (a.description || "");
      const topicTokens = topicLower.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
      const geoTokens = [geo?.city, geo?.region, geo?.country, geo?.countryCode].map((t) => String(t || "").toLowerCase()).filter((t) => t.length >= 3);
      const sentences = String(desc).replace(/\s+/g, " ").split(/(?<=[\.!?])\s+/);
      const containsAny = (s, toks) => { const lc = String(s||"").toLowerCase(); return toks.some((t)=>t && lc.includes(t)); };
      const both = sentences.filter((s) => containsAny(s, topicTokens) && containsAny(s, geoTokens));
      if (both.length) return both[0];
      const topicOnly = sentences.filter((s) => containsAny(s, topicTokens));
      if (topicOnly.length) return topicOnly[0];
      if (isLocal) {
        const geoOnly = sentences.filter((s) => containsAny(s, geoTokens));
        if (geoOnly.length) return geoOnly[0];
      }
      // For core topics, allow a general first sentence
      if (isCore) return sentences[0] || title;
      return "";
    }

    // Helper to format topics like "A and B" or "A, B, and C"
    function formatTopicList(list) {
      const names = (list || []).map((t) => {
        if (String(t).toLowerCase() === "local") {
          const r = geo?.region || geo?.city || geo?.country || "local";
          return r;
        }
        return String(t);
      });
      if (names.length <= 1) return names[0] || "";
      if (names.length === 2) return `${names[0]} and ${names[1]}`;
      return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
    }

    for (const topic of topics) {
      try {
        const perTopic = wordCount >= 1500 ? 20 : wordCount >= 800 ? 12 : 6;
        // Normalize geo data structure
        const normalizedGeo = geo || location;
        const geoData = normalizedGeo ? {
          city: normalizedGeo.city || "",
          region: normalizedGeo.region || "",
          country: normalizedGeo.country || normalizedGeo.countryCode || "",
          countryCode: normalizedGeo.countryCode || normalizedGeo.country || ""
        } : null;
        
        const { articles } = await fetchArticlesForTopic(topic, geoData, perTopic);

        // Pool of unfiltered candidates for global backfill
        for (let idx = 0; idx < articles.length; idx++) {
          const a = articles[idx];
          const blurb = extractRelevantBlurbForSource(topic, geo || location, a);
          globalCandidates.push({
            id: `${topic}-cand-${idx}-${Date.now()}`,
            title: a.title || "",
            summary: blurb || (a.title || ""),
            source: a.source || "",
            url: a.url || "",
            topic,
          });
        }

        const topicLower = String(topic || "").toLowerCase();
        const isCore = CORE_CATEGORIES.has(topicLower);
        const isLocal = topicLower === "local";

        // Filter relevant and require a non-empty blurb only for local/non-core
        const relevant = filterRelevantArticles(topic, geoData, articles, perTopic).filter((a) => {
          if (isCore) return true;
          const blurb = extractRelevantBlurbForSource(topic, geoData, a);
          // For local news, be more lenient - include articles even without perfect blurbs
          if (isLocal) return true;
          return !!blurb;
        });

        const summary = summarizeArticlesSimple(topic, geoData, relevant, wordCount);

        const perTopicIntro = `Here’s your ${String(topic || "").trim()} news.`;
        const stripped = summary.startsWith(perTopicIntro)
          ? summary.slice(perTopicIntro.length).trim()
          : summary;
        if (stripped) combinedPieces.push(stripped);

        const sourceItems = relevant.map((a, idx) => ({
          id: `${topic}-${idx}-${Date.now()}`,
          title: a.title || "",
          summary: extractRelevantBlurbForSource(topic, geo || location, a) || (a.description || a.title || ""),
          source: a.source || "",
          url: a.url || "",
          topic,
        }));

        items.push(...sourceItems);
      } catch (innerErr) {
        console.error("summarize topic failed", topic, innerErr);
        items.push({
          id: `${topic}-error-${Date.now()}`,
          title: `Issue fetching ${topic}`,
          summary: `Failed to fetch news for "${topic}".`,
          source: "",
          url: "",
          topic,
        });
      }
    }

    // Ensure at least 3 sources overall by backfilling from candidates
    if (items.length < 3 && globalCandidates.length > 0) {
      const have = new Set(items.map((i) => i.url || i.id));
      for (const c of globalCandidates) {
        const key = c.url || c.id;
        if (have.has(key)) continue;
        items.push(c);
        have.add(key);
        if (items.length >= 3) break;
      }
    }

    const topicsLabel = formatTopicList(topics);
    const overallIntro = topicsLabel ? `Here’s your ${topicsLabel} news.` : "Here’s your news.";
    const combinedText = [overallIntro, combinedPieces.join(" ")].filter(Boolean).join(" ").trim();

    return res.json({
      items,
      combined: {
        text: combinedText,
        audioUrl: null,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "summarize failed" });
  }
});

// Batch summarize: expects { batches: Array<{ topics: string[], wordCount?: number, location?: string }> }
// Returns an array of results in the same shape as /api/summarize for each batch
app.post("/api/summarize/batch", async (req, res) => {
  try {
    const { batches = [] } = req.body || {};
    if (!Array.isArray(batches)) {
      return res.status(400).json({ error: "batches must be an array" });
    }

    const results = await Promise.all(
      batches.map(async (b) => {
        const topics = Array.isArray(b.topics) ? b.topics : [];
        const wordCount =
          Number.isFinite(b.wordCount) && b.wordCount > 0 ? b.wordCount : 200;
        const location = typeof b.location === "string" ? b.location : "";

        const items = [];
        const combinedPieces = [];
        const globalCandidates = [];

        function extractRelevantBlurbForSource(topic, geo, a) {
          const topicLower = String(topic || "").toLowerCase();
          const isLocal = topicLower === "local";
          const isCore = CORE_CATEGORIES.has(topicLower);
          const title = (a.title || "");
          const desc = (a.description || "");
          const topicTokens = topicLower.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
          const geoTokens = [geo?.city, geo?.region, geo?.country, geo?.countryCode].map((t) => String(t || "").toLowerCase()).filter((t) => t.length >= 3);
          const sentences = String(desc).replace(/\s+/g, " ").split(/(?<=[\.!?])\s+/);
          const containsAny = (s, toks) => { const lc = String(s||"").toLowerCase(); return toks.some((t)=>t && lc.includes(t)); };
          const both = sentences.filter((s) => containsAny(s, topicTokens) && containsAny(s, geoTokens));
          if (both.length) return both[0];
          const topicOnly = sentences.filter((s) => containsAny(s, topicTokens));
          if (topicOnly.length) return topicOnly[0];
          if (isLocal) {
            const geoOnly = sentences.filter((s) => containsAny(s, geoTokens));
            if (geoOnly.length) return geoOnly[0];
          }
          if (CORE_CATEGORIES.has(topicLower)) return sentences[0] || title;
          return "";
        }

        function formatTopicList(list, geoObj) {
          const names = (list || []).map((t) => {
            if (String(t).toLowerCase() === "local") {
              return geoObj?.region || geoObj?.city || geoObj?.country || "local";
            }
            return String(t);
          });
          if (names.length <= 1) return names[0] || "";
          if (names.length === 2) return `${names[0]} and ${names[1]}`;
          return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
        }

        for (const topic of topics) {
          try {
            const perTopic = wordCount >= 1500 ? 20 : wordCount >= 800 ? 12 : 6;
            // Normalize geo data structure for batch
            const geoData = location ? {
              city: "",
              region: "",
              country: location,
              countryCode: location
            } : null;
            
            const { articles } = await fetchArticlesForTopic(topic, geoData, perTopic);

            for (let idx = 0; idx < articles.length; idx++) {
              const a = articles[idx];
              const blurb = extractRelevantBlurbForSource(topic, { country: location }, a);
              globalCandidates.push({
                id: `${topic}-cand-${idx}-${Date.now()}`,
                title: a.title || "",
                summary: blurb || (a.title || ""),
                source: a.source || "",
                url: a.url || "",
                topic,
              });
            }

            const topicLower = String(topic || "").toLowerCase();
            const isCore = CORE_CATEGORIES.has(topicLower);

            const relevant = filterRelevantArticles(topic, { country: location }, articles, perTopic).filter((a) => {
              if (isCore) return true;
              const blurb = extractRelevantBlurbForSource(topic, { country: location }, a);
              return !!blurb;
            });

            const summary = summarizeArticlesSimple(topic, { country: location }, relevant, wordCount);
            const perTopicIntro = `Here’s your ${String(topic || "").trim()} news.`;
            const stripped = summary.startsWith(perTopicIntro)
              ? summary.slice(perTopicIntro.length).trim()
              : summary;
            if (stripped) combinedPieces.push(stripped);

            const sourceItems = relevant.map((a, idx) => ({
              id: `${topic}-${idx}-${Date.now()}`,
              title: a.title || "",
              summary: extractRelevantBlurbForSource(topic, { country: location }, a) || (a.description || a.title || ""),
              source: a.source || "",
              url: a.url || "",
              topic,
            }));

            items.push(...sourceItems);
          } catch (innerErr) {
            console.error("batch summarize topic failed", topic, innerErr);
            items.push({
              id: `${topic}-error-${Date.now()}`,
              title: `Issue fetching ${topic}`,
              summary: `Failed to fetch news for "${topic}".`,
              source: "",
              url: "",
              topic,
            });
          }
        }

        if (items.length < 3 && globalCandidates.length > 0) {
          const have = new Set(items.map((i) => i.url || i.id));
          for (const c of globalCandidates) {
            const key = c.url || c.id;
            if (have.has(key)) continue;
            items.push(c);
            have.add(key);
            if (items.length >= 3) break;
          }
        }

        const topicsLabel = formatTopicList(topics, { country: location });
        const overallIntro = topicsLabel ? `Here’s your ${topicsLabel} news.` : "Here’s your news.";
        const combinedText = [overallIntro, combinedPieces.join(" ")].filter(Boolean).join(" ").trim();

        return {
          items,
          combined: {
            text: combinedText,
            audioUrl: null,
          },
        };
      })
    );

    res.json({ results, batches: results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "batch summarize failed" });
  }
});

// --- TTS endpoint (OpenAI) ---
app.post("/api/tts", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required" });
    }
    if (!OPENAI_API_KEY) {
      return res.status(501).json({ error: "TTS not configured" });
    }

    // Sanitize and shorten input for TTS stability
    const cleaned = String(text)
      .replace(/[\n\r]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .trim()
      .slice(0, 800);

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    async function tryModel(model, voice) {
      return await openai.audio.speech.create({
        model,
        voice,
        input: cleaned,
        format: "mp3",
      });
    }

    let speech;
    let lastErr;
    const attempts = [
      { model: "tts-1", voice: "alloy" },
      { model: "tts-1", voice: "verse" },
      { model: "gpt-4o-mini-tts", voice: "alloy" },
    ];
    for (const { model, voice } of attempts) {
      try {
        speech = await tryModel(model, voice);
        if (speech) break;
      } catch (e) {
        lastErr = e;
        try {
          const msg = e?.message || String(e);
          console.warn(`/api/tts attempt failed (model=${model}, voice=${voice}):`, msg);
          if (e?.response) {
            const body = await e.response.text().catch(() => "");
            console.warn("OpenAI response:", body);
          }
        } catch {}
      }
    }

    if (!speech) {
      throw lastErr || new Error("All TTS attempts failed");
    }

    const buffer = Buffer.from(await speech.arrayBuffer());
    const fileBase = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const outPath = path.join(MEDIA_DIR, fileBase);
    fs.writeFileSync(outPath, buffer);

    const audioUrl = `/media/${fileBase}`;
    res.json({ audioUrl });
  } catch (e) {
    try {
      const msg = e?.message || String(e);
      console.error("/api/tts failed", msg);
      if (e?.response) {
        const body = await e.response.text().catch(() => "");
        console.error("OpenAI response:", body);
      }
    } catch {}
    res.status(500).json({ error: "tts failed" });
  }
});

// --- Server start ---
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
  if (!process.env.JWT_SECRET) {
    console.warn(
      "[WARN] JWT_SECRET is not set. Using an insecure fallback for development."
    );
  }
  if (FRONTEND_ORIGIN) {
    console.log(`CORS allowed origin: ${FRONTEND_ORIGIN}`);
  }
});
