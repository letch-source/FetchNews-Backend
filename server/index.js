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
const rateLimit = require("express-rate-limit");
const cache = require("./cache");
const mongoose = require("mongoose");
const connectDB = require("../config/database");
const { authenticateToken, optionalAuth } = require("../middleware/auth");
const authRoutes = require("../routes/auth");
const subscriptionRoutes = require("../routes/subscriptions");
const customTopicsRoutes = require("../routes/customTopics");
const summaryHistoryRoutes = require("../routes/summaryHistory");
const fallbackAuth = require("../utils/fallbackAuth");

// Connect to MongoDB
connectDB();

const app = express();

// Trust proxy for Render.com deployment
app.set('trust proxy', 1);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/", limiter);

// Authentication routes
app.use("/api/auth", authRoutes);

// Subscription routes
app.use("/api/subscriptions", subscriptionRoutes);

// Custom topics routes
app.use("/api/custom-topics", customTopicsRoutes);

// Summary history routes
app.use("/api/summary-history", summaryHistoryRoutes);

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

  // Check cache first
  const cacheKey = cache.getNewsKey(topic, geo, pageSize);
  const cached = await cache.get(cacheKey);
  if (cached) {
    console.log(`Cache hit for ${topic}`);
    return cached;
  }

  let articles = [];
  const normalizedTopic = String(topic || "").toLowerCase();
  const useCategory = CORE_CATEGORIES.has(normalizedTopic) && normalizedTopic !== "world";
  const isLocal = normalizedTopic === "local";
  const isGeneral = normalizedTopic === "general";

  if (isGeneral) {
    // For "general" topic, fetch one article from each of the other 7 base topics
    const otherTopics = ["business", "entertainment", "health", "science", "sports", "technology", "world"];
    const promises = otherTopics.map(async (category) => {
      try {
        if (category === "world") {
          // World is not a NewsAPI category, use everything search
          const worldArticles = await fetchArticlesEverything(["world"], 1);
          return worldArticles.slice(0, 1);
        } else {
          // Use category-based search for other topics
          const categoryArticles = await fetchTopHeadlinesByCategory(category, countryCode, 1);
          return categoryArticles.slice(0, 1);
        }
      } catch (error) {
        console.error(`Error fetching ${category} articles for general topic:`, error);
        return [];
      }
    });
    
    try {
      const results = await Promise.allSettled(promises);
      articles = results
        .filter(result => result.status === 'fulfilled')
        .flatMap(result => result.value)
        .filter(article => article && article.title); // Filter out empty results
      
      console.log(`General topic: fetched ${articles.length} articles from ${otherTopics.length} categories`);
      console.log(`General topic articles:`, articles.map(a => `${a.title} (${a.source})`));
    } catch (error) {
      console.error('Error in parallel general topic fetch:', error);
      // Fallback to regular general category
      articles = await fetchTopHeadlinesByCategory("general", countryCode, pageSize);
    }
  } else if (isLocal) {
    // Parallel API calls for better performance
    const promises = [];
    
    if (city) {
      promises.push(
        fetchTopHeadlinesByCategory("general", countryCode, Math.ceil(pageSize/3), `"${city}"`),
        fetchArticlesEverything([`title:${city}`], Math.ceil(pageSize/3)),
        fetchArticlesEverything([city], Math.ceil(pageSize/3))
      );
    }
    
    if (region) {
      promises.push(
        fetchTopHeadlinesByCategory("general", countryCode, Math.ceil(pageSize/3), `"${region}"`),
        fetchArticlesEverything([`title:${region}`], Math.ceil(pageSize/3)),
        fetchArticlesEverything([region], Math.ceil(pageSize/3))
      );
    }
    
    if (countryCode) {
      promises.push(
        fetchTopHeadlinesByCategory("general", countryCode, Math.ceil(pageSize/2))
      );
    }
    
    // Fallback to general news
    promises.push(
      fetchTopHeadlinesByCategory("general", "", Math.ceil(pageSize/2))
    );
    
    try {
      const results = await Promise.allSettled(promises);
      articles = results
        .filter(result => result.status === 'fulfilled')
        .flatMap(result => result.value)
        .slice(0, pageSize); // Limit to requested size
    } catch (error) {
      console.error('Error in parallel local news fetch:', error);
      // Fallback to single call
      articles = await fetchTopHeadlinesByCategory("general", countryCode || "", pageSize);
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

  const result = { articles: normalized };
  
  // Cache the result for 15 minutes
  await cache.set(cacheKey, result, 900);
  
  return result;
}

async function summarizeArticles(topic, geo, articles, wordCount, goodNewsOnly = false) {
  const baseParts = [String(topic || "").trim()];
  if (geo?.region) baseParts.push(geo.region);
  if (geo?.country || geo?.countryCode) baseParts.push(geo.country || geo.countryCode);
  const base = baseParts.filter(Boolean).join(" ");

  if (!articles || articles.length === 0) {
    return `No recent coverage found for ${base}.`;
  }

  console.log(`Summarizing ${articles.length} articles for topic: ${topic} using ChatGPT`);

  // Check if OpenAI API key is available
  if (!OPENAI_API_KEY) {
    console.warn("OpenAI API key not configured, using simple fallback");
    const upliftingPrefix = goodNewsOnly ? "uplifting " : "";
    return `Here's your ${upliftingPrefix}${topic} news. ${articles.slice(0, 3).map(a => a.title).join('. ')}.`;
  }

  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    
    // Optimized article preparation for ChatGPT (limit to 4 articles for faster processing)
    const articleTexts = articles.slice(0, 4).map((article, index) => {
      // Optimized text cleaning - combine operations for better performance
      const title = (article.title || "")
        .replace(/[\s\-–—]+$/g, "") // Remove trailing dashes/spaces
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();
      
      // Optimized description processing
      const description = (article.description || "")
        .replace(/\s+/g, " ") // Normalize whitespace first
        .trim()
        .slice(0, 150); // Reduced from 200 to 150 for faster processing
      
      const source = article.source || "Unknown";
      return `${index + 1}. **${title}** (${source})\n${description}`;
    }).join("\n\n");

    // Optimized podcaster-style prompt for faster processing
    const upliftingPrefix = goodNewsOnly ? "uplifting " : "";
    const prompt = `Create a ${wordCount}-word ${upliftingPrefix}${topic} news summary in podcast style.

Articles:
${articleTexts}

Requirements:
- Start with "Here's your ${upliftingPrefix}${topic} news."
- Cover key stories in conversational tone
- Connect related stories naturally
- Focus on most significant developments
- Target ${wordCount} words exactly`;

    console.log(`Sending ${articles.length} articles to ChatGPT for summarization`);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a professional news podcaster. Create engaging, conversational summaries with a warm, informative tone."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: Math.min(wordCount * 2, 2000), // Increased to allow for proper word count targets
      temperature: 0.6, // Reduced for more consistent, faster responses
    });

    const summary = completion.choices[0]?.message?.content?.trim();
    
    if (!summary) {
      throw new Error("No summary generated by ChatGPT");
    }

    console.log(`ChatGPT generated summary: ${summary.length} characters`);
    return summary;

  } catch (error) {
    console.error("ChatGPT summarization failed:", error);
    console.log("Falling back to simple summary");
    // Simple fallback: just use article titles
    const titles = articles.slice(0, 3).map(a => a.title || "").filter(Boolean);
    const upliftingPrefix = goodNewsOnly ? "uplifting " : "";
    return `Here's your ${upliftingPrefix}${topic} news. ${titles.join('. ')}.`;
  }
}


// Uplifting news filter: identify positive, inspiring articles
function isUpliftingNews(article) {
  const title = (article.title || "").toLowerCase();
  const description = (article.description || "").toLowerCase();
  const text = `${title} ${description}`;
  
  // Uplifting keywords - more focused on inspiring, positive content
  const upliftingKeywords = [
    "breakthrough", "achievement", "success", "victory", "triumph", "milestone",
    "innovation", "discovery", "progress", "advancement", "improvement", "growth",
    "celebration", "record", "award", "recognition", "honor", "accomplishment",
    "recovery", "healing", "cure", "treatment", "solution", "rescue", "save",
    "donation", "charity", "volunteer", "help", "support", "community", "kindness",
    "environmental", "sustainability", "green", "renewable", "clean energy", "conservation",
    "education", "learning", "scholarship", "graduation", "inspiration", "motivation",
    "art", "culture", "festival", "celebration", "music", "creativity", "beauty",
    "sports", "championship", "medal", "gold", "silver", "bronze", "teamwork",
    "technology", "invention", "startup", "funding", "investment", "entrepreneur",
    "hope", "optimism", "resilience", "courage", "determination", "perseverance"
  ];
  
  // Negative keywords to avoid
  const negativeKeywords = [
    "death", "died", "killed", "murder", "crime", "violence", "attack",
    "war", "conflict", "battle", "fighting", "bomb", "explosion",
    "disaster", "accident", "crash", "fire", "flood", "earthquake",
    "crisis", "emergency", "danger", "threat", "risk", "problem",
    "scandal", "corruption", "fraud", "theft", "robbery", "arrest",
    "disease", "pandemic", "outbreak", "infection", "virus", "illness",
    "recession", "unemployment", "layoff", "bankruptcy", "debt", "loss"
  ];
  
  // Check for negative keywords first
  const hasNegative = negativeKeywords.some(keyword => text.includes(keyword));
  if (hasNegative) return false;
  
  // Check for uplifting keywords
  const hasUplifting = upliftingKeywords.some(keyword => text.includes(keyword));
  return hasUplifting;
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

// Single summarize: expects { topics: string[], wordCount?: number, location?: string, goodNewsOnly?: boolean }
app.post("/api/summarize", optionalAuth, async (req, res) => {
  // Set a longer timeout for this endpoint
  req.setTimeout(45000); // 45 seconds
  res.setTimeout(45000);
  
  try {
    // Check user usage limits (if authenticated)
    if (req.user) {
      let usageCheck;
      if (mongoose.connection.readyState === 1) {
        usageCheck = req.user.canFetchNews();
      } else {
        usageCheck = fallbackAuth.canFetchNews(req.user);
      }
      
      if (!usageCheck.allowed) {
        return res.status(429).json({
          error: "Daily limit reached",
          message: "You've reached your daily limit of 1 summary. Upgrade to Premium for unlimited access.",
          dailyCount: usageCheck.dailyCount,
          limit: 1
        });
      }
    }
    
    const { topics = [], wordCount = 200, location = "", geo = null, goodNewsOnly = false } = req.body || {};
    if (!Array.isArray(topics)) {
      return res.status(400).json({ error: "topics must be an array" });
    }

    const items = [];
    const combinedPieces = [];
    const globalCandidates = [];


    // Helper to format topics like "A and B" or "A, B, and C"
    function formatTopicList(list, geoData) {
      const names = (list || []).map((t) => {
        if (String(t).toLowerCase() === "local") {
          const r = geoData?.region || geoData?.city || geoData?.country || location || "local";
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
        
        // Handle different location formats
        let geoData = null;
        if (geo && typeof geo === 'object') {
          // Format: { city: "Los Angeles", region: "California", country: "US" }
          geoData = {
            city: geo.city || "",
            region: geo.region || "",
            country: geo.country || geo.countryCode || "",
            countryCode: geo.countryCode || geo.country || ""
          };
        } else if (location && typeof location === 'string') {
          // Format: "New York" or "Los Angeles, California"
          const locationStr = String(location).trim();
          if (locationStr) {
            // Try to parse location string (e.g., "New York" or "Los Angeles, California")
            const parts = locationStr.split(',').map(p => p.trim());
            
            // Common US states mapping for better parsing
            const stateMap = {
              'california': 'California', 'ca': 'California',
              'new york': 'New York', 'ny': 'New York',
              'texas': 'Texas', 'tx': 'Texas',
              'florida': 'Florida', 'fl': 'Florida',
              'illinois': 'Illinois', 'il': 'Illinois',
              'pennsylvania': 'Pennsylvania', 'pa': 'Pennsylvania',
              'ohio': 'Ohio', 'oh': 'Ohio',
              'georgia': 'Georgia', 'ga': 'Georgia',
              'north carolina': 'North Carolina', 'nc': 'North Carolina',
              'michigan': 'Michigan', 'mi': 'Michigan'
            };
            
            let city = parts[0] || "";
            let region = parts[1] || "";
            
            // If no comma but it looks like a state name, treat as state
            if (!region && parts.length === 1) {
              const lowerPart = parts[0].toLowerCase();
              if (stateMap[lowerPart]) {
                city = "";
                region = stateMap[lowerPart];
              }
            }
            
            geoData = {
              city: city,
              region: region,
              country: "US", // Default to US for now
              countryCode: "US"
            };
          }
        }
        
        const { articles } = await fetchArticlesForTopic(topic, geoData, perTopic);

        // Optimized pool of unfiltered candidates for global backfill
        for (let idx = 0; idx < articles.length; idx++) {
          const a = articles[idx];
          globalCandidates.push({
            id: `${topic}-cand-${idx}-${Date.now()}`,
            title: a.title || "",
            summary: (a.description || a.title || "")
              .replace(/\s+/g, " ") // Normalize whitespace
              .trim()
              .slice(0, 150), // Reduced for better performance
            source: a.source || "",
            url: a.url || "",
            topic,
          });
        }

        const topicLower = String(topic || "").toLowerCase();
        const isCore = CORE_CATEGORIES.has(topicLower);
        const isLocal = topicLower === "local";

        // Filter relevant articles
        let relevant = filterRelevantArticles(topic, geoData, articles, perTopic);
        
        // Apply uplifting news filter if enabled
        if (goodNewsOnly) {
          relevant = relevant.filter(isUpliftingNews);
        }

        const summary = await summarizeArticles(topic, geoData, relevant, wordCount, goodNewsOnly);

        // For single topic, use the summary as-is (ChatGPT already includes the intro)
        if (summary) combinedPieces.push(summary);

        const sourceItems = relevant.map((a, idx) => ({
          id: `${topic}-${idx}-${Date.now()}`,
          title: a.title || "",
          summary: (a.description || a.title || "")
            .replace(/\s+/g, " ") // Normalize whitespace
            .trim()
            .slice(0, 180), // Optimized truncation length
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

    // Get the first geoData for formatting (they should all be the same)
    const firstGeoData = topics.includes('local') ? (() => {
      if (geo && typeof geo === 'object') {
        return {
          city: geo.city || "",
          region: geo.region || "",
          country: geo.country || geo.countryCode || "",
          countryCode: geo.countryCode || geo.country || ""
        };
      } else if (location && typeof location === 'string') {
        const locationStr = String(location).trim();
        if (locationStr) {
          const parts = locationStr.split(',').map(p => p.trim());
          
          // Common US states mapping for better parsing
          const stateMap = {
            'california': 'California', 'ca': 'California',
            'new york': 'New York', 'ny': 'New York',
            'texas': 'Texas', 'tx': 'Texas',
            'florida': 'Florida', 'fl': 'Florida',
            'illinois': 'Illinois', 'il': 'Illinois',
            'pennsylvania': 'Pennsylvania', 'pa': 'Pennsylvania',
            'ohio': 'Ohio', 'oh': 'Ohio',
            'georgia': 'Georgia', 'ga': 'Georgia',
            'north carolina': 'North Carolina', 'nc': 'North Carolina',
            'michigan': 'Michigan', 'mi': 'Michigan'
          };
          
          let city = parts[0] || "";
          let region = parts[1] || "";
          
          // If no comma but it looks like a state name, treat as state
          if (!region && parts.length === 1) {
            const lowerPart = parts[0].toLowerCase();
            if (stateMap[lowerPart]) {
              city = "";
              region = stateMap[lowerPart];
            }
          }
          
          return {
            city: city,
            region: region,
            country: "US",
            countryCode: "US"
          };
        }
      }
      return null;
    })() : null;
    
    // For single topic, just use the summary as-is (no overall intro needed)
    let combinedText;
    if (topics.length === 1) {
      combinedText = combinedPieces.join(" ").trim();
    } else {
      // For multi-topic, create separate segments
      const topicsLabel = formatTopicList(topics, firstGeoData);
      combinedText = combinedPieces.join(" ").trim();
    }

    // Increment user usage for successful request (if authenticated)
    if (req.user) {
      if (mongoose.connection.readyState === 1) {
        await req.user.incrementUsage();
      } else {
        await fallbackAuth.incrementUsage(req.user);
      }
    }
    
    return res.json({
      items,
      combined: {
        text: combinedText,
        audioUrl: null,
      },
    });
  } catch (e) {
    console.error("Summarize endpoint error:", e);
    console.error("Error stack:", e.stack);
    res.status(500).json({ 
      error: "summarize failed", 
      details: e.message,
      type: e.constructor.name
    });
  }
});

// Batch summarize: expects { batches: Array<{ topics: string[], wordCount?: number, location?: string, goodNewsOnly?: boolean }> }
// Returns an array of results in the same shape as /api/summarize for each batch
app.post("/api/summarize/batch", optionalAuth, async (req, res) => {
  // Set a longer timeout for this endpoint
  req.setTimeout(60000); // 60 seconds for batch processing
  res.setTimeout(60000);
  
  try {
    // Check user usage limits (if authenticated)
    if (req.user) {
      let usageCheck;
      if (mongoose.connection.readyState === 1) {
        usageCheck = req.user.canFetchNews();
      } else {
        usageCheck = fallbackAuth.canFetchNews(req.user);
      }
      
      if (!usageCheck.allowed) {
        return res.status(429).json({
          error: "Daily limit reached",
          message: "You've reached your daily limit of 1 summary. Upgrade to Premium for unlimited access.",
          dailyCount: usageCheck.dailyCount,
          limit: 1
        });
      }
    }
    
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
        const goodNewsOnly = Boolean(b.goodNewsOnly);

        const items = [];
        const combinedPieces = [];
        const globalCandidates = [];


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
              globalCandidates.push({
                id: `${topic}-cand-${idx}-${Date.now()}`,
                title: a.title || "",
                summary: (a.description || a.title || "")
                  .replace(/\s+/g, " ") // Normalize whitespace
                  .trim()
                  .slice(0, 150), // Reduced for better performance
                source: a.source || "",
                url: a.url || "",
                topic,
              });
            }

            const topicLower = String(topic || "").toLowerCase();
            const isCore = CORE_CATEGORIES.has(topicLower);

            let relevant = filterRelevantArticles(topic, { country: location }, articles, perTopic);
            
            // Apply uplifting news filter if enabled
            if (goodNewsOnly) {
              relevant = relevant.filter(isUpliftingNews);
            }

            const summary = await summarizeArticles(topic, { country: location }, relevant, wordCount, goodNewsOnly);
            // For multi-topic, each summary already includes its own intro, so use as-is
            if (summary) combinedPieces.push(summary);

            const sourceItems = relevant.map((a, idx) => ({
              id: `${topic}-${idx}-${Date.now()}`,
              title: a.title || "",
              summary: (a.description || a.title || "")
                .replace(/\s+/g, " ") // Normalize whitespace
                .trim()
                .slice(0, 180), // Optimized truncation length
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

        // For multi-topic, each piece already has its own intro, so just join them
        const combinedText = combinedPieces.join(" ").trim();

        return {
          items,
          combined: {
            text: combinedText,
            audioUrl: null,
          },
        };
      })
    );

    // Increment user usage for successful request (if authenticated)
    if (req.user) {
      if (mongoose.connection.readyState === 1) {
        await req.user.incrementUsage();
      } else {
        await fallbackAuth.incrementUsage(req.user);
      }
    }
    
    res.json({ results, batches: results });
  } catch (e) {
    console.error("Batch summarize endpoint error:", e);
    console.error("Error stack:", e.stack);
    res.status(500).json({ 
      error: "batch summarize failed", 
      details: e.message,
      type: e.constructor.name
    });
  }
});

// Note: Usage endpoint is now handled by /api/auth/usage in auth routes

// --- TTS endpoint (OpenAI) ---
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voice = "alloy", speed = 1.0 } = req.body || {};
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required" });
    }
    if (!OPENAI_API_KEY) {
      return res.status(501).json({ error: "TTS not configured" });
    }

    // Optimized text sanitization for TTS stability
    const cleaned = String(text)
      .replace(/[\n\r\u2018\u2019\u201C\u201D]/g, (match) => {
        // Single pass replacement for better performance
        switch(match) {
          case '\n': case '\r': return ' ';
          case '\u2018': case '\u2019': return "'";
          case '\u201C': case '\u201D': return '"';
          default: return match;
        }
      })
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();
    
    // OpenAI TTS has a 4096 character limit, so we'll use a reasonable limit
    const maxLength = 4000; // Leave some buffer for safety
    const finalText = cleaned.length > maxLength ? cleaned.slice(0, maxLength - 3) + "..." : cleaned;

    // Check cache first (using final processed text)
    const cacheKey = cache.getTTSKey(finalText, voice, speed);
    const cached = await cache.get(cacheKey);
    
    // Temporarily disable cache for voice testing
    const disableCache = true; // Set to false to re-enable caching
    
    if (cached && !disableCache) {
      console.log(`TTS cache hit for ${finalText.substring(0, 50)}... with voice: ${voice}`);
      // Ensure cached URL is absolute
      const baseUrl = req.protocol + '://' + req.get('host');
      const audioUrl = cached.audioUrl.startsWith('http') ? cached.audioUrl : `${baseUrl}${cached.audioUrl}`;
      return res.json({ audioUrl });
    }
    
    console.log(`TTS cache miss - generating new audio with voice: ${voice}`);

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    async function tryModel(model, voice) {
      return await openai.audio.speech.create({
        model,
        voice,
        input: finalText,
        format: "mp3",
      });
    }

    // Map voice names to lowercase (OpenAI expects lowercase)
    const normalizedVoice = String(voice || "alloy").toLowerCase();
    
    // Available OpenAI TTS voices
    const availableVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    const selectedVoice = availableVoices.includes(normalizedVoice) ? normalizedVoice : "alloy";
    
    console.log(`TTS Request - Original voice: "${voice}", Normalized: "${normalizedVoice}", Selected: "${selectedVoice}"`);
    
    let speech;
    let lastErr;
    
    // Try the requested voice with different models
    const attempts = [
      { model: "tts-1", voice: selectedVoice },
      { model: "tts-1-hd", voice: selectedVoice },
      { model: "gpt-4o-mini-tts", voice: selectedVoice },
    ];
    
    // Only fall back to alloy if the requested voice completely fails
    const fallbackAttempts = [
      { model: "tts-1", voice: "alloy" },
      { model: "tts-1-hd", voice: "alloy" },
    ];
    
    // Try requested voice first
    for (const { model, voice: attemptVoice } of attempts) {
      try {
        console.log(`TTS Attempt - Model: ${model}, Voice: ${attemptVoice}`);
        speech = await tryModel(model, attemptVoice);
        if (speech) {
          console.log(`TTS Success - Model: ${model}, Voice: ${attemptVoice}`);
          break;
        }
      } catch (e) {
        lastErr = e;
        try {
          const msg = e?.message || String(e);
          console.warn(`/api/tts attempt failed (model=${model}, voice=${attemptVoice}):`, msg);
          if (e?.response) {
            const body = await e.response.text().catch(() => "");
            console.warn("OpenAI response:", body);
          }
        } catch {}
      }
    }
    
    // If requested voice failed, try fallback
    if (!speech) {
      console.log(`TTS Fallback - Requested voice "${selectedVoice}" failed, trying alloy`);
      for (const { model, voice: attemptVoice } of fallbackAttempts) {
        try {
          console.log(`TTS Fallback Attempt - Model: ${model}, Voice: ${attemptVoice}`);
          speech = await tryModel(model, attemptVoice);
          if (speech) {
            console.log(`TTS Fallback Success - Model: ${model}, Voice: ${attemptVoice}`);
            break;
          }
        } catch (e) {
          lastErr = e;
          console.warn(`/api/tts fallback failed (model=${model}, voice=${attemptVoice}):`, e?.message || String(e));
        }
      }
    }

    if (!speech) {
      throw lastErr || new Error("All TTS attempts failed");
    }

    const buffer = Buffer.from(await speech.arrayBuffer());
    const fileBase = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    const outPath = path.join(MEDIA_DIR, fileBase);
    fs.writeFileSync(outPath, buffer);

    // Create absolute URL for the audio file
    const baseUrl = req.protocol + '://' + req.get('host');
    const audioUrl = `${baseUrl}/media/${fileBase}`;
    
    // Cache the TTS result for 24 hours
    await cache.set(cacheKey, { audioUrl }, 86400);
    
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
