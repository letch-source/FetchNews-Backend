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
const connectDB = require("./config/database");
const { authenticateToken, optionalAuth } = require("./middleware/auth");
const authRoutes = require("./routes/auth");
const subscriptionRoutes = require("./routes/subscriptions");
const customTopicsRoutes = require("./routes/customTopics");
const summaryHistoryRoutes = require("./routes/summaryHistory");
const adminRoutes = require("./routes/adminActions");
const preferencesRoutes = require("./routes/preferences");
const newsSourcesRoutes = require("./routes/newsSources");
const { fetchAllUSSources } = require("./routes/newsSources");
const trendingAdminRoutes = require("./routes/trendingAdmin");
const notificationsRoutes = require("./routes/notifications");
const { sendEngagementReminder, sendFetchReadyNotification } = require("./utils/notifications");
const fallbackAuth = require("./utils/fallbackAuth");
const { uploadAudioToB2, isB2Configured } = require("./utils/b2Storage");
const User = require("./models/User");
const GlobalSettings = require("./models/GlobalSettings");

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

// Utility function to ensure text ends at a complete sentence
function ensureCompleteSentence(text) {
  if (!text || typeof text !== 'string') return text;
  
  // Remove trailing whitespace
  text = text.trim();
  
  // Check if it already ends with a sentence-ending punctuation
  if (/[.!?]$/.test(text)) {
    return text;
  }
  
  // Find the last complete sentence by looking for sentence-ending punctuation
  const sentenceEndings = /[.!?]/g;
  let lastMatch;
  let match;
  
  while ((match = sentenceEndings.exec(text)) !== null) {
    lastMatch = match;
  }
  
  if (lastMatch) {
    // Only truncate if the incomplete part is more than 20% of the text
    // This prevents aggressive cutting of summaries
    const completePart = text.substring(0, lastMatch.index + 1);
    const incompletePart = text.substring(lastMatch.index + 1);
    
    if (incompletePart.length > text.length * 0.2) {
      // If the incomplete part is significant, keep the full text and add a period
      return text + '.';
    } else {
      // If the incomplete part is small, truncate to the complete sentence
      return completePart;
    }
  }
  
  // If no sentence endings found, add a period
  return text + '.';
}

// Authentication routes
app.use("/api/auth", authRoutes);

// Subscription routes
app.use("/api/subscriptions", subscriptionRoutes);

// Custom topics routes
app.use("/api/custom-topics", customTopicsRoutes);

// Summary history routes
app.use("/api/summary-history", summaryHistoryRoutes);

// Admin routes
app.use("/api/admin", adminRoutes);

// Admin trending topics management
app.use("/api/admin/trending-topics", trendingAdminRoutes);

// Preferences routes
app.use("/api/preferences", preferencesRoutes);

// News sources routes
app.use("/api/news-sources", newsSourcesRoutes);

// Notifications routes
app.use("/api/notifications", notificationsRoutes);

// Function to extract breaking news topics from headlines
function extractBreakingNewsTopics(articles) {
  const topicCounts = {};
  const seenTopics = new Set();
  
  // Focus on headlines only for breaking news
  articles.forEach(article => {
    const headline = article.title || '';
    if (!headline) return;
    
    // Extract key topics from headlines
    const topics = extractTopicsFromHeadline(headline);
    
    topics.forEach(topic => {
      const normalizedTopic = topic.toLowerCase();
      if (!seenTopics.has(normalizedTopic)) {
        seenTopics.add(normalizedTopic);
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    });
  });
  
  // Sort by frequency and return top topics
  // Increase to 8 topics since we're using high-quality sources
  const sortedTopics = Object.entries(topicCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10) // Get more candidates for ChatGPT to refine
    .map(([topic]) => topic);
  
  return sortedTopics.length >= 3 ? sortedTopics : [];
}

// Extract meaningful topics from a single headline
function extractTopicsFromHeadline(headline) {
  const topics = [];
  
  // 1. Extract proper nouns and capitalized terms (most important for breaking news)
  const properNouns = headline.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
  properNouns.forEach(phrase => {
    if (phrase.length >= 3 && phrase.length <= 30 && !isGenericWord(phrase)) {
      topics.push(phrase);
    }
  });
  
  // 2. Extract key phrases (2-3 words) that are likely breaking news topics
  const words = headline.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'will', 'said', 'says',
    'breaking', 'news', 'update', 'latest', 'reports', 'report', 'story', 'stories',
    'chairman', 'finalised', 'commission', 'likely', 'formed', 'next', 'pay',
    'weather', 'forecast', 'surf', 'temperature', 'degrees', 'rain', 'snow', 'wind',
    'storm', 'hurricane', 'tornado', 'climate', 'seasonal', 'outdoor', 'beach',
    'coastal', 'marine', 'atmospheric', 'meteorological', 'december', 'january',
    'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
    'october', 'november', 'tearing', 'right', 'now'
  ]);
  
  for (let i = 0; i < words.length - 1; i++) {
    if (!stopWords.has(words[i]) && !stopWords.has(words[i + 1])) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      if (phrase.length >= 6 && phrase.length <= 25) {
        topics.push(phrase.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
      }
    }
  }
  
  return topics;
}

// Check if a word is too generic for trending topics
function isGenericWord(word) {
  const genericWords = new Set([
    'Report', 'News', 'Update', 'Latest', 'Breaking', 'Story', 'Stories',
    'Chairman', 'Finalised', 'Commission', 'Likely', 'Formed', 'Next', 'Pay',
    'Weather', 'Forecast', 'Surf', 'Temperature', 'Degrees', 'Rain', 'Snow', 'Wind',
    'Storm', 'Hurricane', 'Tornado', 'Climate', 'Seasonal', 'Outdoor', 'Beach',
    'Coastal', 'Marine', 'Atmospheric', 'Meteorological', 'December', 'January',
    'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'Tearing', 'Right', 'Now'
  ]);
  return genericWords.has(word);
}

// Legacy function for general trending topics (kept for fallback)
function extractTrendingTopics(articles) {
  const topicCounts = {};
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
    'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'her', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
    // Additional stop words
    'said', 'says', 'saying', 'told', 'tells', 'telling', 'according', 'reported', 'reports',
    'news', 'story', 'stories', 'article', 'articles', 'update', 'updates', 'breaking',
    'latest', 'recent', 'today', 'yesterday', 'tomorrow', 'week', 'month', 'year',
    'time', 'times', 'day', 'days', 'hour', 'hours', 'minute', 'minutes',
    'people', 'person', 'persons', 'man', 'men', 'woman', 'women', 'child', 'children',
    'company', 'companies', 'business', 'businesses', 'organization', 'organizations',
    'government', 'official', 'officials', 'president', 'minister', 'mayor', 'governor',
    'state', 'states', 'country', 'countries', 'city', 'cities', 'town', 'towns',
    'philadelphia', 'dreamforce', 'conference', 'conferences', 'event', 'events',
    'new', 'high', 'here', 'there', 'where', 'when', 'why', 'how', 'what', 'who',
    // Military/defense terms that might dominate
    'uss', 'ddg', 'burke', 'roosevelt', 'conducts', 'sea', 'anchor', 'evolution',
    'navy', 'military', 'defense', 'forces', 'army', 'air', 'force', 'marine'
  ]);

  // Process each article
  articles.forEach(article => {
    const title = article.title || '';
    const description = article.description || '';
    
    // Extract topics from title (more important) and description
    const titleText = title.toLowerCase();
    const descText = description.toLowerCase();
    
    // 1. Extract proper nouns and capitalized terms from titles (most important)
    const properNouns = title.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || [];
    properNouns.forEach(phrase => {
      const cleanPhrase = phrase.toLowerCase();
      if (cleanPhrase.length >= 3 && cleanPhrase.length <= 30 && 
          !stopWords.has(cleanPhrase) && 
          !cleanPhrase.includes('conference') &&
          !cleanPhrase.includes('philadelphia') &&
          !cleanPhrase.includes('dreamforce')) {
        topicCounts[cleanPhrase] = (topicCounts[cleanPhrase] || 0) + 3; // Weight titles higher
      }
    });
    
    // 2. Extract 2-word phrases (bigrams) that are likely topics
    const text = `${titleText} ${descText}`;
    const words = text.match(/\b[a-z]{3,}\b/g) || [];
    
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      if (!stopWords.has(words[i]) && !stopWords.has(words[i + 1]) &&
          words[i].length >= 3 && words[i + 1].length >= 3 &&
          phrase.length <= 25) {
        topicCounts[phrase] = (topicCounts[phrase] || 0) + 1;
      }
    }
    
    // 3. Extract meaningful single words (less weight)
    words.forEach(word => {
      if (!stopWords.has(word) && 
          word.length >= 4 && 
          word.length <= 15 &&
          !/^\d+$/.test(word) &&
          !word.includes('conference') &&
          !word.includes('philadelphia') &&
          !word.includes('dreamforce')) {
        topicCounts[word] = (topicCounts[word] || 0) + 0.5; // Lower weight for single words
      }
    });
  });

  // Filter and sort topics
  const filteredTopics = Object.entries(topicCounts)
    .filter(([topic, count]) => {
      // Only include topics that appear at least twice or are multi-word
      return count >= 2 || topic.includes(' ');
    })
    .sort(([,a], [,b]) => b - a)
    .slice(0, 8) // Get more candidates
    .map(([topic]) => {
      // Capitalize properly
      return topic.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
    });

  // Return top 6 topics, prioritizing multi-word phrases
  const multiWordTopics = filteredTopics.filter(topic => topic.includes(' '));
  const singleWordTopics = filteredTopics.filter(topic => !topic.includes(' '));
  
  // Mix multi-word and single-word topics for better diversity
  const finalTopics = [];
  const maxTopics = 6;
  
  // Add multi-word topics first (up to 4)
  for (let i = 0; i < Math.min(4, multiWordTopics.length); i++) {
    finalTopics.push(multiWordTopics[i]);
  }
  
  // Add single-word topics to fill remaining slots
  for (let i = 0; i < singleWordTopics.length && finalTopics.length < maxTopics; i++) {
    finalTopics.push(singleWordTopics[i]);
  }
  
  // Only return if we have at least 3 good topics
  return finalTopics.length >= 3 ? finalTopics : [];
}

// Trending topics endpoint
app.get("/api/trending-topics", async (req, res) => {
  try {
    // Prefer admin override if present
    const overridePath = path.join(__dirname, "./server_data/trending_override.json");
    let usingOverride = false;
    let overrideData = null;
    try {
      if (fs.existsSync(overridePath)) {
        const raw = fs.readFileSync(overridePath, 'utf8');
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.topics) && data.topics.length > 0) {
          usingOverride = true;
          overrideData = data;
        }
      }
    } catch {}

    if (usingOverride) {
      return res.json({
        trendingTopics: overrideData.topics,
        lastUpdated: overrideData.lastUpdated || null,
        source: "override",
        setBy: overrideData.setBy || null
      });
    }

    // Fallback to cached trending topics
    res.json({
      trendingTopics: trendingTopicsCache,
      lastUpdated: lastTrendingUpdate ? lastTrendingUpdate.toISOString() : null,
      source: "auto"
    });
  } catch (error) {
    console.error('Get trending topics error:', error);
    res.status(500).json({ 
      error: 'Failed to get trending topics',
      details: error.message 
    });
  }
});

// Manual trending topics update endpoint (for testing)
// COMMENTED OUT: Auto-generated trending topics disabled - only manual topics allowed
app.post("/api/trending-topics/update", async (req, res) => {
  try {
    console.log('[TRENDING] Manual update triggered - DISABLED (auto-generated topics disabled)');
    // await updateTrendingTopics();
    res.json({ 
      message: 'Auto-generated trending topics are disabled. Only manual topics are allowed.',
      trendingTopics: trendingTopicsCache,
      lastUpdated: lastTrendingUpdate ? lastTrendingUpdate.toISOString() : null
    });
  } catch (error) {
    console.error('Manual trending topics update error:', error);
    res.status(500).json({ 
      error: 'Failed to update trending topics',
      details: error.message 
    });
  }
});

// Get source articles for a specific trending topic
app.get("/api/trending-topics/:topic/sources", async (req, res) => {
  try {
    const { topic } = req.params;
    
    if (!trendingTopicsWithSources || !trendingTopicsWithSources[topic]) {
      return res.status(404).json({ 
        error: 'Topic not found or no source articles available',
        topic: topic
      });
    }
    
    const sourceArticles = trendingTopicsWithSources[topic];
    
    // Format articles for frontend
    const formattedArticles = sourceArticles.map(article => ({
      title: article.title || "",
      description: article.description || "",
      url: article.url || "",
      publishedAt: article.published_at || "",
      source: article.source || "Unknown",
      image: article.image || ""
    }));
    
    res.json({ 
      topic: topic,
      articles: formattedArticles,
      count: formattedArticles.length
    });
  } catch (error) {
    console.error('Get trending topic sources error:', error);
    res.status(500).json({ error: 'Failed to get source articles' });
  }
});

// Timezone endpoint
app.post("/api/auth/timezone", authenticateToken, async (req, res) => {
  try {
    const { timezone } = req.body;
    const user = req.user;
    
    if (!timezone) {
      return res.status(400).json({ error: 'Timezone is required' });
    }
    
    // Validate timezone format (basic IANA timezone check)
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch (error) {
      return res.status(400).json({ error: 'Invalid timezone format' });
    }
    
    // Update user's timezone preference
    // User model is already imported at top of file
    const userDoc = await User.findById(user.id);
    
    if (!userDoc) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Store timezone in user preferences
    if (!userDoc.preferences) {
      userDoc.preferences = {};
    }
    userDoc.preferences.timezone = timezone;
    userDoc.updatedAt = new Date();
    
    await userDoc.save();
    
    res.json({ 
      message: 'Timezone updated successfully',
      timezone: timezone 
    });
  } catch (error) {
    console.error('Set timezone error:', error);
    res.status(500).json({ error: 'Failed to set timezone' });
  }
});

// Scheduled summaries routes
const scheduledSummariesRoutes = require("./routes/scheduledSummaries");
app.use("/api/scheduled-summaries", scheduledSummariesRoutes);

// Serve admin website
// Admin directory is located in backend/admin (relative to this file)
const adminPath = path.join(__dirname, "admin");

// Explicitly handle /admin routes first
app.get("/admin", (req, res) => {
  const indexPath = path.join(adminPath, "index.html");
  res.sendFile(indexPath);
});

app.get("/admin/", (req, res) => {
  const indexPath = path.join(adminPath, "index.html");
  res.sendFile(indexPath);
});

// Then serve static files from admin directory
app.use("/admin", express.static(adminPath, {
  index: 'index.html'
}));

// Serve AASA file for password autofill
app.get("/.well-known/apple-app-site-association", (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, "../public/.well-known/apple-app-site-association"));
});

// Serve other static files
app.use(express.static(path.join(__dirname, "../public")));

// --- Config & helpers ---
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const MEDIASTACK_KEY = process.env.MEDIASTACK_KEY || "";
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
    "https://fetchnews-backend.onrender.com", // Admin dashboard
  ].filter(Boolean)
);

app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin / non-browser requests with no Origin header
      if (!origin) return cb(null, true);
      
      console.log(`CORS request from origin: ${origin}`);
      console.log(`Allowed origins:`, Array.from(ALLOWED_ORIGINS));
      
      if (ALLOWED_ORIGINS.has(origin)) {
        console.log(`Origin ${origin} is allowed`);
        return cb(null, true);
      }
      
      // Allow admin dashboard requests from the same domain
      if (origin && origin.includes('fetchnews-backend.onrender.com')) {
        console.log(`Allowing admin dashboard origin: ${origin}`);
        return cb(null, true);
      }
      
      console.log(`Origin ${origin} is not allowed`);
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

// Allowed news sources for US users
const US_ALLOWED_SOURCES = new Set([
  "the new york times",
  "cnn",
  "fox news",
  "yahoo finance",
  "msn",
  "usa today",
  "people",
  "bbc",
  "google news",
  "nbc news",
  "ap news",
  "new york post",
  "the washington post",
  "substack",
  "cnbc",
  "newsweek",
  "abc news",
  "the guardian",
  "cbs news",
  "business insider",
  "bloomberg",
  "marketwatch",
  "reuters",
  "the hill",
  "politico",
  "huffpost",
  "the atlantic",
  "axios",
  "los angeles times",
  "rolling stone",
  "forbes",
  "the verge",
  "fox",
  "the sun",
  "the independent",
  "sfgate",
  "vogue",
  "elle",
  "harper's bazaar",
  "vanity fair",
  "w magazine",
  "the cut",
  "gq",
  "esquire",
  "instyle",
  "who what wear",
  "refinery29",
  "business of fashion",
  "women's wear daily",
  "dazed",
  "i-d",
  "the gentlewoman",
  "mr porter",
  "highsnobiety",
  "hypebeast",
  "the zoe report"
]);

// Helper function to normalize source name for comparison
function normalizeSourceName(source) {
  if (!source) return "";
  // Handle both string and object formats
  const sourceName = typeof source === 'string' ? source : (source.name || source.id || "");
  return sourceName.toLowerCase().trim();
}

// Helper function to check if a source is allowed for US users
function isSourceAllowedForUS(source) {
  const normalized = normalizeSourceName(source);
  return US_ALLOWED_SOURCES.has(normalized);
}

// Map our normalized source names to Mediastack source identifiers
// Mediastack uses source names as they appear in their API (often capitalized, with spaces)
function getMediastackSourceNames() {
  // Return array of source names as Mediastack expects them
  // Note: Mediastack source names may vary - this is a best-effort mapping
  // Common patterns: "CNN", "BBC News", "The New York Times", etc.
  return [
    "The New York Times", "CNN", "Fox News", "Yahoo Finance", "MSN",
    "USA Today", "People", "BBC News", "Google News", "NBC News",
    "Associated Press", "New York Post", "The Washington Post", "Substack",
    "CNBC", "Newsweek", "ABC News", "The Guardian", "CBS News",
    "Business Insider", "Bloomberg", "MarketWatch", "Reuters", "The Hill",
    "Politico", "HuffPost", "The Atlantic", "Axios", "Los Angeles Times",
    "Rolling Stone", "Forbes", "The Verge", "Fox", "The Sun",
    "The Independent", "SFGate", "Vogue", "Elle", "Harper's Bazaar",
    "Vanity Fair", "W Magazine", "The Cut", "GQ", "Esquire",
    "InStyle", "Who What Wear", "Refinery29", "Business of Fashion",
    "Women's Wear Daily", "Dazed", "i-D", "The Gentlewoman", "Mr Porter",
    "Highsnobiety", "Hypebeast", "The Zoe Report"
  ];
}

// Get Mediastack-compatible source names for US users
function getUSMediastackSources() {
  return getMediastackSourceNames();
}

async function fetchArticlesEverything(qParts, maxResults, selectedSources = [], countryCode = null) {
  const q = encodeURIComponent(qParts.filter(Boolean).join(" "));
  const pageSize = Math.min(Math.max(Number(maxResults) || 5, 1), 50);
  // Extend to 7 days for more variety (24 hours was too restrictive)
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  
  // Build country parameter if provided
  const countryParam = countryCode ? `&countries=${String(countryCode).toLowerCase()}` : '';
  
  // Build sources parameter if provided
  const sourcesParam = selectedSources && selectedSources.length > 0 
    ? `&sources=${encodeURIComponent(selectedSources.join(','))}` 
    : '';
  
  // Try multiple search strategies for better coverage
  const searchStrategies = [
    // Strategy 1: Exact phrase search
    `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&keywords="${q}"&languages=en&sort=published_desc&limit=${pageSize}&date=${from}${countryParam}${sourcesParam}`,
    // Strategy 2: Individual keywords
    `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&keywords=${q}&languages=en&sort=published_desc&limit=${pageSize}&date=${from}${countryParam}${sourcesParam}`,
    // Strategy 3: Broader search without date restriction
    `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&keywords=${q}&languages=en&sort=published_desc&limit=${pageSize}${countryParam}${sourcesParam}`,
    // Strategy 4: Search without keywords (general news) - only add country if provided
    countryCode 
      ? `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&languages=en&sort=published_desc&limit=${pageSize}${countryParam}${sourcesParam}`
      : `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&languages=en&sort=published_desc&limit=${pageSize}${sourcesParam}`
  ];
  
  let articles = [];
  let lastError = null;
  let got422Error = false;
  
  for (const url of searchStrategies) {
    try {
      console.log(`[SEARCH] Trying strategy: ${url}`);
      const resp = await fetch(url);
      
      if (resp.ok) {
        const data = await resp.json();
        if (data.data && data.data.length > 0) {
          articles = data.data;
          console.log(`[SEARCH] Found ${articles.length} articles with current strategy`);
          // Debug: Check how many articles have images
          const articlesWithImages = articles.filter(a => a.image).length;
          console.log(`[SEARCH] Articles with images: ${articlesWithImages} out of ${articles.length}`);
          if (articles.length > 0 && !articles[0].image) {
            console.log(`[SEARCH] Sample article keys:`, Object.keys(articles[0]));
          }
          break;
        }
      } else {
        // Check if we got a 422 error (validation error) - likely invalid sources
        if (resp.status === 422 && selectedSources && selectedSources.length > 0) {
          got422Error = true;
          console.log(`[SEARCH] Got 422 error with sources parameter, will fallback to post-filtering`);
          lastError = `Mediastack error: ${resp.status} (invalid sources parameter)`;
          break; // Exit loop to try fallback
        } else {
          lastError = `Mediastack error: ${resp.status}`;
        }
      }
    } catch (error) {
      lastError = error.message;
      console.log(`[SEARCH] Strategy failed: ${error.message}`);
    }
  }
  
  // If we got a 422 error with sources, retry without sources and post-filter
  if (got422Error && selectedSources && selectedSources.length > 0) {
    console.log(`[SEARCH] Falling back to fetching without sources parameter, will post-filter`);
    const fallbackStrategies = [
      `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&keywords="${q}"&languages=en&sort=published_desc&limit=${pageSize * 3}&date=${from}${countryParam}`,
      `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&keywords=${q}&languages=en&sort=published_desc&limit=${pageSize * 3}&date=${from}${countryParam}`,
      `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&keywords=${q}&languages=en&sort=published_desc&limit=${pageSize * 3}${countryParam}`,
      countryCode 
        ? `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&languages=en&sort=published_desc&limit=${pageSize * 3}${countryParam}`
        : `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&languages=en&sort=published_desc&limit=${pageSize * 3}`
    ];
    
    for (const url of fallbackStrategies) {
      try {
        console.log(`[SEARCH FALLBACK] Trying strategy: ${url}`);
        const resp = await fetch(url);
        
        if (resp.ok) {
          const data = await resp.json();
          if (data.data && data.data.length > 0) {
            // Post-filter to only include allowed sources
            const allowedSourcesSet = new Set(selectedSources.map(s => s.toLowerCase()));
            articles = data.data.filter(article => {
              const articleSource = (article.source || '').toLowerCase();
              return allowedSourcesSet.has(articleSource);
            }).slice(0, pageSize); // Limit to requested size
            
            if (articles.length > 0) {
              console.log(`[SEARCH FALLBACK] Post-filtered to ${articles.length} articles from allowed sources`);
              break;
            }
          }
        }
      } catch (error) {
        console.log(`[SEARCH FALLBACK] Strategy failed: ${error.message}`);
      }
    }
  }
  
  if (articles.length === 0) {
    throw new Error(lastError || 'No articles found with any search strategy');
  }
  
  // Map Mediastack response to match expected format
  const mappedArticles = articles.map(article => {
    // Debug: Log image-related fields for troubleshooting
    if (!article.image) {
      console.log(`[MEDIASTACK] Article "${article.title?.substring(0, 50)}" has no image field. Available fields:`, Object.keys(article));
    }
    
    return {
      title: article.title,
      description: article.description,
      url: article.url,
      publishedAt: article.published_at,
      source: { id: article.source, name: article.source },
      urlToImage: article.image || "" // Mediastack uses 'image' field
    };
  });
  
  // Removed source printing log
  return mappedArticles;
}

// Function to ensure variety by getting articles from multiple sources with progressive time expansion
async function fetchArticlesWithVariety(selectedSources, maxResults = 10) {
  if (!selectedSources || selectedSources.length === 0) {
    return [];
  }
  
  console.log(`Ensuring variety from ${selectedSources.length} sources with progressive time expansion`);
  const targetVariety = Math.min(5, selectedSources.length); // Aim for 5 different sources
  
  // Progressive time windows: 1h, 2h, 4h, 8h, 16h, 24h
  const timeWindows = [1, 2, 4, 8, 16, 24]; // hours
  
  for (const hours of timeWindows) {
    console.log(`Trying ${hours} hour(s) time window...`);
    const articles = [];
    const usedSources = new Set();
    const from = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString().slice(0, 10);
    
    // Try to get at least one article from each source within this time window
    for (const source of selectedSources) {
      if (usedSources.size >= targetVariety) break;
      
      try {
        // Use everything endpoint with time filter for more control
        const url = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&sources=${source}&date=${from}&sort=published_desc&limit=1&languages=en`;
        const resp = await fetch(url);
        
        if (resp.ok) {
          const data = await resp.json();
          if (data.data && data.data.length > 0) {
            // Map Mediastack response to expected format
            const article = {
              title: data.data[0].title,
              description: data.data[0].description,
              url: data.data[0].url,
              publishedAt: data.data[0].published_at,
              source: { id: data.data[0].source, name: data.data[0].source }
            };
            articles.push(article);
            usedSources.add(source);
            console.log(`Got article from ${source} (${hours}h window)`);
          }
        }
      } catch (error) {
        console.log(`Failed to get article from ${source} (${hours}h window): ${error.message}`);
      }
    }
    
    // If we got enough variety, return the articles
    if (usedSources.size >= targetVariety) {
      console.log(`Variety achieved: ${usedSources.size} different sources in ${hours} hour(s)`);
      return articles;
    }
    
    // If we got some articles but not enough variety, continue to next time window
    if (articles.length > 0) {
      console.log(`Got ${usedSources.size} sources in ${hours}h, expanding to next time window...`);
    }
  }
  
  // If we still don't have enough variety after all time windows, return what we have
  console.log(`Final attempt: trying top-headlines without time filter for maximum coverage`);
  const articles = [];
  const usedSources = new Set();
  
  for (const source of selectedSources) {
    if (usedSources.size >= targetVariety) break;
    
    try {
      const url = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&sources=${source}&limit=1&languages=en`;
      const resp = await fetch(url);
      
      if (resp.ok) {
        const data = await resp.json();
        if (data.data && data.data.length > 0) {
          // Map Mediastack response to expected format
          const article = {
            title: data.data[0].title,
            description: data.data[0].description,
            url: data.data[0].url,
            publishedAt: data.data[0].published_at,
            source: { id: data.data[0].source, name: data.data[0].source }
          };
          articles.push(article);
          usedSources.add(source);
          console.log(`Got article from ${source} (no time filter)`);
        }
      }
    } catch (error) {
      console.log(`Failed to get article from ${source} (no time filter): ${error.message}`);
    }
  }
  
  console.log(`Final variety achieved: ${usedSources.size} different sources`);
  return articles;
}

async function fetchTopHeadlinesByCategory(category, countryCode, maxResults, extraQuery, selectedSources = []) {
  const pageSize = Math.min(Math.max(Number(maxResults) || 5, 1), 50);
  const params = new URLSearchParams();
  
  // Mediastack parameter mapping
  if (selectedSources && selectedSources.length > 0) {
    console.log(`Filtering by sources: ${selectedSources.join(",")}`);
    params.set("sources", selectedSources.join(","));
  } else {
    console.log(`No source filtering applied (using all sources)`);
    if (category) params.set("categories", category);
  }
  
  // Always apply country filter if countryCode is provided (works with both sources and categories)
  if (countryCode) {
    params.set("countries", String(countryCode).toLowerCase());
    console.log(`Applying country filter: ${String(countryCode).toLowerCase()}`);
  }
  
  if (extraQuery) params.set("keywords", extraQuery);
  params.set("limit", String(pageSize));
  params.set("languages", "en");
  const url = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&${params.toString()}`;
  console.log(`[DEBUG] Final Mediastack URL: ${url}`);
  let resp = await fetch(url);
  let data;
  
  // Handle 422 errors (invalid sources parameter) by retrying without sources
  if (!resp.ok && resp.status === 422 && selectedSources && selectedSources.length > 0) {
    console.log(`[DEBUG] Got 422 error with sources parameter, retrying without sources and post-filtering`);
    // Retry without sources parameter
    const fallbackParams = new URLSearchParams();
    if (category) fallbackParams.set("categories", category);
    if (countryCode) fallbackParams.set("countries", String(countryCode).toLowerCase());
    if (extraQuery) fallbackParams.set("keywords", extraQuery);
    fallbackParams.set("limit", String(pageSize * 3)); // Get more to account for filtering
    fallbackParams.set("languages", "en");
    
    const fallbackUrl = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&${fallbackParams.toString()}`;
    console.log(`[DEBUG] Fallback URL: ${fallbackUrl}`);
    resp = await fetch(fallbackUrl);
    
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.log(`[DEBUG] Fallback also failed: ${resp.status} ${text}`);
      throw new Error(`Mediastack error: ${resp.status} ${text}`);
    }
    
    const fallbackData = await resp.json();
    console.log(`[DEBUG] Fallback returned ${fallbackData.data?.length || 0} articles`);
    
    // Post-filter to only include allowed sources
    const allowedSourcesSet = new Set(selectedSources.map(s => s.toLowerCase()));
    data = {
      ...fallbackData,
      data: (fallbackData.data || []).filter(article => {
        const articleSource = (article.source || '').toLowerCase();
        return allowedSourcesSet.has(articleSource);
      }).slice(0, pageSize)
    };
    
    console.log(`[DEBUG] Post-filtered to ${data.data.length} articles from allowed sources`);
  } else if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.log(`[DEBUG] Mediastack error response: ${resp.status} ${text}`);
    throw new Error(`Mediastack error: ${resp.status} ${text}`);
  } else {
    data = await resp.json();
    console.log(`[DEBUG] Mediastack category response:`, JSON.stringify(data, null, 2));
    console.log(`Mediastack returned ${data.data?.length || 0} articles`);
  }
  
  // Debug: Check how many articles have images
  if (data.data && data.data.length > 0) {
    const articlesWithImages = data.data.filter(a => a.image).length;
    console.log(`[DEBUG] Articles with images: ${articlesWithImages} out of ${data.data.length}`);
    if (!data.data[0].image && data.data.length > 0) {
      console.log(`[DEBUG] Sample article keys:`, Object.keys(data.data[0]));
    }
  }
  
  // Map Mediastack response to match expected format
  const articles = (data.data || []).map(article => {
    // Debug: Log image-related fields for troubleshooting
    if (!article.image) {
      console.log(`[MEDIASTACK] Article "${article.title?.substring(0, 50)}" has no image field. Available fields:`, Object.keys(article));
    }
    
    return {
      title: article.title,
      description: article.description,
      url: article.url,
      publishedAt: article.published_at,
      source: { id: article.source, name: article.source },
      urlToImage: article.image || "" // Mediastack uses 'image' field
    };
  });
  
  // Removed source printing log
  return articles;
}

async function fetchArticlesForTopic(topic, geo, maxResults, selectedSources = []) {
  // Check if this is a trending topic and combine source articles with fresh content
  if (trendingTopicsWithSources && trendingTopicsWithSources[topic]) {
    console.log(`[TRENDING] Combining source articles with fresh content for trending topic: ${topic}`);
    const sourceArticles = trendingTopicsWithSources[topic];
    
    // Convert source articles to the expected format
    const sourceArticlesFormatted = sourceArticles.map(article => ({
      title: article.title || "",
      description: article.description || "",
      url: article.url || "",
      publishedAt: article.published_at || "",
      source: { id: article.source, name: article.source },
      urlToImage: article.image || "",
      isSourceArticle: true // Mark as source article
    }));
    
    // Calculate how many additional articles to fetch
    const sourceCount = sourceArticlesFormatted.length;
    const additionalNeeded = Math.max(0, maxResults - sourceCount);
    
    let additionalArticles = [];
    if (additionalNeeded > 0) {
      console.log(`[TRENDING] Fetching ${additionalNeeded} additional articles for ${topic}`);
      
      // Fetch additional articles using the normal process
      const queryParts = [topic];
      // Prefer countryCode (lowercase) over country (uppercase) for API compatibility
      const countryCode = (geo?.countryCode || geo?.country || "").toLowerCase();
      const region = geo?.region || geo?.state || "";
      const city = geo?.city || "";
      if (region) queryParts.push(region);
      if (city) queryParts.push(city);
      
      try {
        // Use the existing logic to fetch additional articles
        const additionalResult = await fetchArticlesEverything(queryParts, additionalNeeded, selectedSources, countryCode);
        additionalArticles = additionalResult.map(article => ({
          title: article.title || "",
          description: article.description || "",
          url: article.url || "",
          publishedAt: article.publishedAt || "",
          source: article.source || { id: "unknown", name: "Unknown" },
          urlToImage: article.urlToImage || "",
          isSourceArticle: false // Mark as additional article
        }));
      } catch (error) {
        console.log(`[TRENDING] Failed to fetch additional articles for ${topic}:`, error.message);
      }
    }
    
    // Combine source articles with additional articles
    const allArticles = [...sourceArticlesFormatted, ...additionalArticles];
    
    return { 
      articles: allArticles, 
      note: `Trending topic: ${sourceCount} source articles + ${additionalArticles.length} additional articles` 
    };
  }
  
  const queryParts = [topic];
  // Prefer countryCode (lowercase) over country (uppercase) for API compatibility
  const countryCode = (geo?.countryCode || geo?.country || "").toLowerCase();
  const region = geo?.region || geo?.state || "";
  const city = geo?.city || "";
  if (region) queryParts.push(region);
  if (city) queryParts.push(city);
  const pageSize = Math.min(Math.max(Number(maxResults) || 5, 1), 50);

  if (!MEDIASTACK_KEY) {
    return { articles: [], note: "Missing MEDIASTACK_KEY" };
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
  // For general news, use a simple approach without date filtering
  try {
    const countryParam = countryCode ? `&countries=${String(countryCode).toLowerCase()}` : '';
    const sourcesParam = selectedSources && selectedSources.length > 0 
      ? `&sources=${encodeURIComponent(selectedSources.join(','))}` 
      : '';
    let url = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&languages=en&limit=${pageSize}${countryParam}${sourcesParam}`;
    let resp = await fetch(url);
    let data;
    
    // Handle 422 errors (invalid sources parameter) by retrying without sources
    if (!resp.ok && resp.status === 422 && selectedSources && selectedSources.length > 0) {
      console.log(`[GENERAL] Got 422 error with sources parameter, retrying without sources and post-filtering`);
      url = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&languages=en&limit=${pageSize * 3}${countryParam}`;
      resp = await fetch(url);
      
      if (!resp.ok) {
        throw new Error(`Mediastack error: ${resp.status}`);
      }
      
      const fallbackData = await resp.json();
      // Post-filter to only include allowed sources
      const allowedSourcesSet = new Set(selectedSources.map(s => s.toLowerCase()));
      data = {
        ...fallbackData,
        data: (fallbackData.data || []).filter(article => {
          const articleSource = (article.source || '').toLowerCase();
          return allowedSourcesSet.has(articleSource);
        }).slice(0, pageSize)
      };
      console.log(`[GENERAL] Post-filtered to ${data.data.length} articles from allowed sources`);
    } else if (!resp.ok) {
      throw new Error(`Mediastack error: ${resp.status}`);
    } else {
      data = await resp.json();
    }
    
    // Map Mediastack response to expected format
    articles = (data.data || []).map(article => ({
      title: article.title,
      description: article.description,
      url: article.url,
      publishedAt: article.published_at,
      source: { id: article.source, name: article.source },
      urlToImage: article.image || "" // Mediastack uses 'image' field
    }));
    } catch (error) {
      console.error(`Error fetching general news:`, error);
      // Fallback to category-based approach
      try {
        articles = await fetchTopHeadlinesByCategory("general", countryCode, pageSize, undefined, selectedSources);
        console.log(`General topic: fallback fetched ${articles.length} articles using category`);
      } catch (fallbackError) {
        console.error(`Fallback also failed:`, fallbackError);
        articles = [];
      }
    }
  } else if (isLocal) {
    // Parallel API calls for better performance
    const promises = [];
    
    if (city) {
      promises.push(
        fetchTopHeadlinesByCategory("general", countryCode, Math.ceil(pageSize/3), `"${city}"`, selectedSources),
        fetchArticlesEverything([`title:${city}`], Math.ceil(pageSize/3), selectedSources, countryCode),
        fetchArticlesEverything([city], Math.ceil(pageSize/3), selectedSources, countryCode)
      );
    }
    
    if (region) {
      promises.push(
        fetchTopHeadlinesByCategory("general", countryCode, Math.ceil(pageSize/3), `"${region}"`, selectedSources),
        fetchArticlesEverything([`title:${region}`], Math.ceil(pageSize/3), selectedSources, countryCode),
        fetchArticlesEverything([region], Math.ceil(pageSize/3), selectedSources, countryCode)
      );
    }
    
    if (countryCode) {
      promises.push(
        fetchTopHeadlinesByCategory("general", countryCode, Math.ceil(pageSize/2), undefined, selectedSources)
      );
    }
    
    // Fallback to general news (use countryCode if available)
    promises.push(
      fetchTopHeadlinesByCategory("general", countryCode || "", Math.ceil(pageSize/2), undefined, selectedSources)
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
      articles = await fetchTopHeadlinesByCategory("general", countryCode || "", pageSize, undefined, selectedSources);
    }
  } else if (useCategory) {
    const category = normalizedTopic;
    
    // If we have selected sources, try variety approach first
    if (selectedSources && selectedSources.length > 0) {
      console.log(`${category} topic with selected sources - ensuring variety`);
      const varietyArticles = await fetchArticlesWithVariety(selectedSources, pageSize);
      if (varietyArticles.length > 0) {
        articles = varietyArticles;
        console.log(`${category} topic: fetched ${articles.length} articles with variety from ${selectedSources.length} sources`);
      }
    }
    
    // Fallback to category-based approach if variety didn't work or no sources selected
    if (articles.length === 0) {
      console.log(`${category} topic: using category-based approach`);
      // Include a light keyword from region/city if present to bias towards local context
      const bias = city || region || "";
      articles = await fetchTopHeadlinesByCategory(category, countryCode, pageSize, bias || undefined, selectedSources);
    }
    
    if ((articles?.length || 0) < Math.min(5, pageSize) && (city || region)) {
      const extra = await fetchArticlesEverything([normalizedTopic, bias], pageSize - (articles?.length || 0), selectedSources, countryCode);
      articles = [...articles, ...extra];
    }
  } else {
    articles = await fetchArticlesEverything(queryParts, pageSize, selectedSources, countryCode);
  }

  // Debug: Check original articles from news API
  if (articles.length > 0) {
    console.log(`🔍 [fetchArticlesForTopic] Received ${articles.length} articles from news API`);
    console.log(`🔍 [fetchArticlesForTopic] First article urlToImage:`, articles[0].urlToImage);
    console.log(`🔍 [fetchArticlesForTopic] First article keys:`, Object.keys(articles[0]));
  }
  
  const normalized = articles.map((a) => ({
    title: a.title || "",
    description: a.description || "",
    url: a.url || "",
    source: (a.source && a.source.name) || "",
    publishedAt: a.publishedAt || "",
    urlToImage: a.urlToImage || "",
  }));
  
  // Debug: Check normalized articles
  if (normalized.length > 0) {
    console.log(`🔍 [fetchArticlesForTopic] Normalized ${normalized.length} articles. First urlToImage:`, normalized[0].urlToImage);
  }

  const result = { articles: normalized };
  
  // Cache the result for 15 minutes
  await cache.set(cacheKey, result, 900);
  
  return result;
}

async function summarizeArticles(topic, geo, articles, wordCount, goodNewsOnly = false, user = null) {
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

    // Get user's timezone for personalized greeting
    const userTimezone = user?.preferences?.timezone || 'America/New_York';
    const now = new Date();
    const userTime = new Date(now.toLocaleString("en-US", {timeZone: userTimezone}));
    const hour = userTime.getHours();
    
    let timeGreeting;
    if (hour < 12) {
      timeGreeting = "Good morning";
    } else if (hour < 17) {
      timeGreeting = "Good afternoon";
    } else {
      timeGreeting = "Good evening";
    }
    
    // Format topics for the intro
    const topicsText = Array.isArray(topic) ? topic.join(", ") : topic;
    const upliftingPrefix = goodNewsOnly ? "uplifting " : "";
    
    const prompt = `Create a ${upliftingPrefix}${topicsText} news summary in a conversational style.

Articles:
${articleTexts}

Requirements:
- Cover key stories in conversational tone
- Connect related stories naturally
- Focus on most significant developments
- Target ${wordCount} words exactly
- For short summaries (≤200 words), be very concise and stick to the word limit
- End at a complete sentence, but prioritize staying within the word count
- Do not use phrases like "welcome back to our podcast" or refer to it as a podcast`;

    console.log(`Sending ${articles.length} articles to ChatGPT for summarization`);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a professional news presenter. Create engaging, conversational news summaries with a warm, informative tone. Do not refer to the summary as a podcast."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: Math.min(wordCount * 2, 2000), // Increased to allow for proper word count targets
      temperature: 0.6, // Reduced for more consistent, faster responses
    });

    let summary = completion.choices[0]?.message?.content?.trim();
    
    if (!summary) {
      throw new Error("No summary generated by ChatGPT");
    }
    
    // Log actual word count vs target
    const actualWordCount = summary.split(/\s+/).length;
    console.log(`Summary generated: ${actualWordCount} words (target: ${wordCount})`);

    // Ensure summary ends at a complete sentence
    summary = ensureCompleteSentence(summary);

    console.log(`ChatGPT generated summary: ${summary.length} characters`);
    return summary;

  } catch (error) {
    console.error("ChatGPT summarization failed:", error);
    console.log("Falling back to simple summary");
    
    // Get user's timezone for personalized greeting (fallback)
    const userTimezone = user?.preferences?.timezone || 'America/New_York';
    const now = new Date();
    const userTime = new Date(now.toLocaleString("en-US", {timeZone: userTimezone}));
    const hour = userTime.getHours();
    
    let timeGreeting;
    if (hour < 12) {
      timeGreeting = "Good morning";
    } else if (hour < 17) {
      timeGreeting = "Good afternoon";
    } else {
      timeGreeting = "Good evening";
    }
    
    // Simple fallback: just use article titles
    const titles = articles.slice(0, 3).map(a => a.title || "").filter(Boolean);
    const topicsText = Array.isArray(topic) ? topic.join(", ") : topic;
    const upliftingPrefix = goodNewsOnly ? "uplifting " : "";
    return `Here's your ${upliftingPrefix}${topicsText} news. ${titles.join('. ')}.`;
  }
}


// Helper function to generate varied transition phrases between topics
function getTopicTransition(topic, index, totalTopics) {
  // Format topic name for display (capitalize first letter, handle multi-word topics)
  const formattedTopic = topic.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
  
  // Array of varied transition phrases
  const transitions = [
    `And moving onto news about ${formattedTopic}.`,
    `Now, let's turn to ${formattedTopic}.`,
    `Shifting focus to ${formattedTopic}.`,
    `Next up, ${formattedTopic} news.`,
    `Turning our attention to ${formattedTopic}.`,
    `And now for updates on ${formattedTopic}.`,
    `Let's check in on ${formattedTopic}.`,
    `Switching gears to ${formattedTopic}.`,
    `Up next, ${formattedTopic}.`,
    `Now for ${formattedTopic} updates.`,
    `Moving forward with ${formattedTopic} news.`,
    `Here's what's happening in ${formattedTopic}.`,
    `And in ${formattedTopic} news.`,
    `Let's dive into ${formattedTopic}.`,
    `Now covering ${formattedTopic}.`
  ];
  
  // Use index to select a transition (cycles through options)
  return transitions[index % transitions.length];
}

// Helper function to combine topic summaries with varied transitions
function combineTopicSummaries(summariesWithTopics) {
  if (!summariesWithTopics || summariesWithTopics.length === 0) {
    return "";
  }
  
  // If only one topic, return it without transition
  if (summariesWithTopics.length === 1) {
    return summariesWithTopics[0].summary.trim();
  }
  
  // Combine summaries with transitions
  const parts = [];
  summariesWithTopics.forEach((item, index) => {
    if (item.summary && item.summary.trim()) {
      // Add transition for all topics except the first one
      if (index > 0) {
        const transition = getTopicTransition(item.topic, index - 1, summariesWithTopics.length);
        parts.push(transition);
      }
      parts.push(item.summary.trim());
    }
  });
  
  return parts.join(" ");
}

// Helper function to add intro and outro to final summary
function addIntroAndOutro(summary, topics, goodNewsOnly = false, user = null) {
  if (!summary || summary.trim().length === 0) {
    return summary;
  }
  
  // Get user's timezone for personalized greeting
  const userTimezone = user?.preferences?.timezone || 'America/New_York';
  const now = new Date();
  const userTime = new Date(now.toLocaleString("en-US", {timeZone: userTimezone}));
  const hour = userTime.getHours();
  
  let timeGreeting;
  if (hour < 12) {
    timeGreeting = "Good morning";
  } else if (hour < 17) {
    timeGreeting = "Good afternoon";
  } else {
    timeGreeting = "Good evening";
  }
  
  // Extract first name from user's name if available
  let firstName = null;
  if (user?.name) {
    const nameParts = user.name.trim().split(/\s+/);
    firstName = nameParts[0] || null;
  }
  
  // Format topics for the intro with "and" before the last topic
  let topicsText;
  if (Array.isArray(topics)) {
    if (topics.length === 0) {
      topicsText = "";
    } else if (topics.length === 1) {
      topicsText = topics[0];
    } else if (topics.length === 2) {
      topicsText = `${topics[0]} and ${topics[1]}`;
    } else {
      topicsText = `${topics.slice(0, -1).join(", ")}, and ${topics[topics.length - 1]}`;
    }
  } else {
    topicsText = topics;
  }
  const upliftingPrefix = goodNewsOnly ? "uplifting " : "";
  
  // Add personalized greeting with first name if available
  const personalizedGreeting = firstName ? `${timeGreeting}, ${firstName}` : timeGreeting;
  
  // Add intro and outro
  const intro = `${personalizedGreeting}, here's your ${upliftingPrefix}${topicsText} news update. `;
  const outro = " That's it for your news summary, brought to you by Fetch News.";
  
  return intro + summary.trim() + outro;
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
    newsConfigured: !!process.env.MEDIASTACK_KEY,
    ttsConfigured: !!process.env.OPENAI_API_KEY,
  });
});

// Simple test endpoint
app.get("/api/test", (req, res) => {
  res.json({ message: "Test endpoint working", timestamp: new Date().toISOString() });
});

// Test Mediastack API endpoint
app.get("/api/test-mediastack", async (req, res) => {
  try {
    const url = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&languages=en&limit=5`;
    console.log(`[TEST] Testing Mediastack URL: ${url}`);
    const resp = await fetch(url);
    
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return res.status(500).json({ 
        error: `Mediastack API error: ${resp.status}`, 
        details: text,
        url: url
      });
    }
    
    const data = await resp.json();
    console.log(`[TEST] Mediastack test response:`, JSON.stringify(data, null, 2));
    
    res.json({
      success: true,
      articlesCount: data.data?.length || 0,
      response: data
    });
  } catch (error) {
    console.error('[TEST] Mediastack test error:', error);
    res.status(500).json({ 
      error: 'Mediastack test failed', 
      details: error.message 
    });
  }
});

// Signup - DISABLED: Google-only authentication required
app.post("/api/auth/signup", (req, res) => {
  return res.status(403).json({ 
    error: 'Email/password registration is disabled. Please sign in with Google.' 
  });
});

// Login - DISABLED: Google-only authentication required
app.post("/api/auth/login", (req, res) => {
  return res.status(403).json({ 
    error: 'Email/password login is disabled. Please sign in with Google.' 
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
        usageCheck = await req.user.canFetchNews();
        // Reload user to ensure we have the latest dailyUsageCount after potential reset
        req.user = await User.findById(req.user._id);
      } else {
        usageCheck = fallbackAuth.canFetchNews(req.user);
        // Save the user if it was reset
        await fallbackAuth.saveUser(req.user);
      }
      
      if (!usageCheck.allowed) {
        const limit = usageCheck.limit || (req.user?.isPremium ? 20 : 3);
        const isPremium = req.user?.isPremium || false;
        const message = isPremium
          ? `You've used all ${limit} of your daily Fetches. Your limit will reset tomorrow.`
          : `You've used all ${limit} of your daily Fetches. Your limit will reset tomorrow, or upgrade to Premium for unlimited access.`;
        
        return res.status(429).json({
          error: "Daily limit reached",
          message: message,
          dailyCount: usageCheck.dailyCount,
          limit: limit
        });
      }
    }
    
    const { topics = [], wordCount = 200, location = "", geo = null, goodNewsOnly = false, country = null } = req.body || {};
    if (!Array.isArray(topics)) {
      return res.status(400).json({ error: "topics must be an array" });
    }
    
    // Get user's country preference if not provided in request
    let userCountry = country;
    if (!userCountry && req.user) {
      const user = await User.findById(req.user.id);
      if (user) {
        const preferences = user.getPreferences();
        userCountry = preferences.selectedCountry || 'us';
      }
    }
    // Default to 'us' if no country specified
    if (!userCountry) {
      userCountry = 'us';
    }
    
    // Debug: Log country being used
    console.log(`🌍 [SUMMARIZE] Country from request: ${country || 'none'}, Final userCountry: ${userCountry}`);

    // Check for global excluded news sources first (admin override)
    let excludedSources = [];
    const globalSettings = await GlobalSettings.getOrCreate();
    
    if (globalSettings.excludedNewsSourcesEnabled && globalSettings.excludedNewsSources && globalSettings.excludedNewsSources.length > 0) {
      // Use global excluded sources (override user exclusions)
      excludedSources = globalSettings.excludedNewsSources;
      console.log(`[GLOBAL SOURCES] Excluding ${excludedSources.length} global news sources:`, excludedSources);
    } else {
      // Get user's excluded news sources (if authenticated and premium)
      if (req.user && req.user.isPremium) {
        const user = await User.findById(req.user.id);
        if (user) {
          const preferences = user.getPreferences();
          excludedSources = preferences.excludedNewsSources || [];
          
          console.log(`Premium user ${req.user.id} has ${excludedSources.length} sources excluded:`, excludedSources);
        }
      } else {
        console.log(`Non-premium user, using all sources (no exclusions)`);
      }
    }
    
    // For US users, use only allowed sources via Mediastack API filtering
    // For other countries, fetch from all sources and filter afterwards
    let selectedSources = [];
    if (userCountry && userCountry.toLowerCase() === 'us') {
      selectedSources = getUSMediastackSources();
      console.log(`[US SOURCES] Using ${selectedSources.length} allowed US sources via Mediastack API`);
    }

    const items = [];
    const summariesWithTopics = [];
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

    // Helper function to process a single topic (extracted for parallelization)
    async function processTopic(topic) {
      try {
        const perTopic = wordCount >= 1500 ? 20 : wordCount >= 800 ? 12 : 6;
        
        // Always initialize geoData with userCountry (which is always set, defaults to 'us')
        // Then enhance it with geo or location if provided
        let geoData = {
          city: "",
          region: "",
          country: userCountry.toUpperCase() || "US",
          countryCode: userCountry.toLowerCase() || "us"
        };
        
        if (geo && typeof geo === 'object') {
          // Format: { city: "Los Angeles", region: "California", country: "US" }
          // Enhance geoData with geo object values
          geoData.city = geo.city || geoData.city;
          geoData.region = geo.region || geoData.region;
          geoData.country = geo.country || geo.countryCode || geoData.country;
          geoData.countryCode = geo.countryCode || geo.country || geoData.countryCode;
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
            
            // Enhance geoData with parsed location
            geoData.city = city;
            geoData.region = region;
            // Keep userCountry for country/countryCode since location string doesn't include country
          }
        }
        
        // Debug: Log country information
        console.log(`🌍 [COUNTRY FILTER] Topic: ${topic}, Country: ${geoData.countryCode || geoData.country || 'none'}, GeoData:`, JSON.stringify(geoData));
        console.log(`🌍 [COUNTRY FILTER] userCountry: ${userCountry}, geoData.countryCode: ${geoData.countryCode}, geoData.country: ${geoData.country}`);
        
        const { articles } = await fetchArticlesForTopic(topic, geoData, perTopic, selectedSources);

        // Optimized pool of unfiltered candidates for global backfill
        const topicCandidates = [];
        for (let idx = 0; idx < articles.length; idx++) {
          const a = articles[idx];
          topicCandidates.push({
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

        // Filter out excluded sources (if any)
        if (excludedSources && excludedSources.length > 0) {
          const excludedSet = new Set(excludedSources.map(s => s.toLowerCase()));
          articles = articles.filter(article => {
            const articleSource = normalizeSourceName(article.source);
            return !excludedSet.has(articleSource);
          });
          console.log(`[FILTER] Filtered out excluded sources, ${articles.length} articles remaining`);
        }
        
        // For US users: post-filter as fallback (API-level filtering should handle most cases)
        // This ensures we catch any sources that might have slipped through
        if (userCountry && userCountry.toLowerCase() === 'us' && selectedSources.length === 0) {
          // Only post-filter if we didn't use API-level filtering (shouldn't happen, but safety check)
          const beforeCount = articles.length;
          articles = articles.filter(article => {
            return isSourceAllowedForUS(article.source);
          });
          console.log(`[US FILTER FALLBACK] Post-filtered to allowed US sources: ${beforeCount} -> ${articles.length} articles`);
        }
        
        // Filter relevant articles
        let relevant = filterRelevantArticles(topic, geoData, articles, perTopic);
        
        // Apply uplifting news filter if enabled
        if (goodNewsOnly) {
          relevant = relevant.filter(isUpliftingNews);
        }

        const summary = await summarizeArticles(topic, geoData, relevant, wordCount, goodNewsOnly, req.user);

        // Debug: Check if articles have urlToImage
        if (relevant.length > 0) {
          console.log(`🔍 [${topic}] First article urlToImage:`, relevant[0].urlToImage);
          console.log(`🔍 [${topic}] First article keys:`, Object.keys(relevant[0]));
        }
        
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
          imageUrl: a.urlToImage || "",
        }));

        return {
          summary,
          sourceItems,
          candidates: topicCandidates
        };
      } catch (innerErr) {
        console.error("summarize topic failed", topic, innerErr);
        return {
          summary: null,
          sourceItems: [{
            id: `${topic}-error-${Date.now()}`,
            title: `Issue fetching ${topic}`,
            summary: `Failed to fetch news for "${topic}".`,
            source: "",
            url: "",
            topic,
          }],
          candidates: []
        };
      }
    }

    // Process all topics in parallel for better performance
    const topicResults = await Promise.all(topics.map(topic => processTopic(topic)));
    
    // Combine results from parallel processing, tracking which summary belongs to which topic
    for (let i = 0; i < topicResults.length; i++) {
      const result = topicResults[i];
      const topic = topics[i];
      if (result.summary) {
        summariesWithTopics.push({ summary: result.summary, topic: topic });
      }
      items.push(...result.sourceItems);
      globalCandidates.push(...result.candidates);
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
    
    // Combine all topic summaries with varied transitions
    let combinedText = combineTopicSummaries(summariesWithTopics);
    
    // Add intro and outro to the final summary (once per summary, not per topic)
    combinedText = addIntroAndOutro(combinedText, topics, goodNewsOnly, req.user);

    // Increment user usage for successful request (if authenticated)
    if (req.user) {
      try {
        if (mongoose.connection.readyState === 1) {
          // Reload user to ensure we have the latest data before incrementing
          const freshUser = await User.findById(req.user._id || req.user.id);
          if (freshUser) {
            await freshUser.incrementUsage();
            console.log(`[SUMMARIZE] Incremented usage for user ${freshUser.email}, new count: ${freshUser.dailyUsageCount}`);
          } else {
            console.error(`[SUMMARIZE] User not found when trying to increment usage: ${req.user._id || req.user.id}`);
          }
        } else {
          await fallbackAuth.incrementUsage(req.user);
          console.log(`[SUMMARIZE] Incremented usage (fallback) for user ${req.user.email}, new count: ${req.user.dailyUsageCount}`);
        }
      } catch (incrementError) {
        console.error(`[SUMMARIZE] Error incrementing usage:`, incrementError);
        // Don't fail the request if increment fails, but log it
      }
    }

    // Generate a better title based on topics
    let title = "Summary";
    if (topics.length === 1) {
      title = `${topics[0].charAt(0).toUpperCase() + topics[0].slice(1)} Summary`;
    } else if (topics.length > 1) {
      title = "Mixed Summary";
    }

    // Send notification if user is not in app and has device token (after response is sent)
    // Check appInForeground from query params or body (defaults to true for backward compatibility)
    const appInForeground = req.query.appInForeground !== 'false' && req.body.appInForeground !== false;
    
    // Send response first
    res.json({
      items,
      combined: {
        id: `combined-${Date.now()}`,
        title: title,
        summary: combinedText,
        audioUrl: null,
      },
    });

    // Send notification asynchronously after response (don't wait for it)
    if (!appInForeground && req.user) {
      console.log(`[NOTIFICATIONS] User ${req.user.email} not in foreground, will send notification`);
      setImmediate(async () => {
        try {
          // Reload user to get latest device token
          let userWithToken;
          if (mongoose.connection.readyState === 1) {
            userWithToken = await User.findById(req.user._id || req.user.id);
          } else {
            userWithToken = req.user;
          }
          
          if (userWithToken && userWithToken.deviceToken) {
            console.log(`[NOTIFICATIONS] Sending Fetch-ready notification to user ${userWithToken.email} with token ${userWithToken.deviceToken.substring(0, 8)}...`);
            await sendFetchReadyNotification(userWithToken.deviceToken, title);
            console.log(`[NOTIFICATIONS] ✅ Successfully sent Fetch-ready notification to user ${userWithToken.email}`);
          } else {
            console.log(`[NOTIFICATIONS] ⚠️  No device token found for user ${userWithToken?.email || req.user.email}, skipping notification`);
          }
        } catch (notifError) {
          // Don't fail the request if notification fails
          console.error('[NOTIFICATIONS] ❌ Error sending Fetch-ready notification:', notifError);
        }
      });
    } else {
      if (req.user) {
        console.log(`[NOTIFICATIONS] User ${req.user.email} is in foreground (appInForeground=${appInForeground}), skipping notification`);
      } else {
        console.log(`[NOTIFICATIONS] No authenticated user, skipping notification`);
      }
    }
  } catch (e) {
    console.error("Summarize endpoint error:", e);
    console.error("Error stack:", e.stack);
    
    // Ensure response hasn't been sent yet
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "summarize failed", 
        details: e.message,
        type: e.constructor.name
      });
    } else {
      console.error("Response already sent, cannot send error response");
    }
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
        usageCheck = await req.user.canFetchNews();
        // Reload user to ensure we have the latest dailyUsageCount after potential reset
        req.user = await User.findById(req.user._id);
      } else {
        usageCheck = fallbackAuth.canFetchNews(req.user);
        // Save the user if it was reset
        await fallbackAuth.saveUser(req.user);
      }
      
      if (!usageCheck.allowed) {
        const limit = usageCheck.limit || (req.user?.isPremium ? 20 : 3);
        const isPremium = req.user?.isPremium || false;
        const message = isPremium
          ? `You've used all ${limit} of your daily Fetches. Your limit will reset tomorrow.`
          : `You've used all ${limit} of your daily Fetches. Your limit will reset tomorrow, or upgrade to Premium for unlimited access.`;
        
        return res.status(429).json({
          error: "Daily limit reached",
          message: message,
          dailyCount: usageCheck.dailyCount,
          limit: limit
        });
      }
    }
    
    const { batches = [] } = req.body || {};
    if (!Array.isArray(batches)) {
      return res.status(400).json({ error: "batches must be an array" });
    }

    // Check for global excluded news sources first (admin override)
    let excludedSources = [];
    const globalSettings = await GlobalSettings.getOrCreate();
    
    if (globalSettings.excludedNewsSourcesEnabled && globalSettings.excludedNewsSources && globalSettings.excludedNewsSources.length > 0) {
      // Use global excluded sources (override user exclusions)
      excludedSources = globalSettings.excludedNewsSources;
      console.log(`[GLOBAL SOURCES] Excluding ${excludedSources.length} global news sources:`, excludedSources);
    } else {
      // Get user's excluded news sources (if authenticated and premium)
      if (req.user && req.user.isPremium) {
        const user = await User.findById(req.user.id);
        if (user) {
          const preferences = user.getPreferences();
          excludedSources = preferences.excludedNewsSources || [];
          
          console.log(`Premium user ${req.user.id} has ${excludedSources.length} sources excluded:`, excludedSources);
        }
      } else {
        console.log(`Non-premium user, using all sources (no exclusions)`);
      }
    }
    
    // Get user's country preference for batch requests
    let batchCountry = 'us';
    if (req.user) {
      const user = await User.findById(req.user.id);
      if (user) {
        const preferences = user.getPreferences();
        batchCountry = preferences.selectedCountry || 'us';
      }
    }
    
    // For US users, use only allowed sources via Mediastack API filtering
    // For other countries, fetch from all sources and filter afterwards
    let selectedSources = [];
    if (batchCountry && batchCountry.toLowerCase() === 'us') {
      selectedSources = getUSMediastackSources();
      console.log(`[US SOURCES BATCH] Using ${selectedSources.length} allowed US sources via Mediastack API`);
    }

    const results = await Promise.all(
      batches.map(async (b) => {
        const topics = Array.isArray(b.topics) ? b.topics : [];
        const wordCount =
          Number.isFinite(b.wordCount) && b.wordCount > 0 ? b.wordCount : 200;
        const location = typeof b.location === "string" ? b.location : "";
        const goodNewsOnly = Boolean(b.goodNewsOnly);

        const items = [];
        const summariesWithTopics = [];
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
              country: batchCountry.toUpperCase(),
              countryCode: batchCountry.toLowerCase()
            } : {
              city: "",
              region: "",
              country: batchCountry.toUpperCase(),
              countryCode: batchCountry.toLowerCase()
            };
            
            let { articles } = await fetchArticlesForTopic(topic, geoData, perTopic, selectedSources);
            
            // Filter out excluded sources (if any)
            if (excludedSources && excludedSources.length > 0) {
              const excludedSet = new Set(excludedSources.map(s => s.toLowerCase()));
              articles = articles.filter(article => {
                const articleSource = normalizeSourceName(article.source);
                return !excludedSet.has(articleSource);
              });
            }
            
            // For US users: post-filter as fallback (API-level filtering should handle most cases)
            if (batchCountry && batchCountry.toLowerCase() === 'us' && selectedSources.length === 0) {
              // Only post-filter if we didn't use API-level filtering (shouldn't happen, but safety check)
              const beforeCount = articles.length;
              articles = articles.filter(article => {
                return isSourceAllowedForUS(article.source);
              });
              console.log(`[US FILTER BATCH FALLBACK] Post-filtered to allowed US sources: ${beforeCount} -> ${articles.length} articles`);
            }

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

            const summary = await summarizeArticles(topic, { country: location }, relevant, wordCount, goodNewsOnly, req.user);
            // Track summaries with their topics for transition generation
            if (summary) summariesWithTopics.push({ summary: summary, topic: topic });

            // Debug: Check if articles have urlToImage
            if (relevant.length > 0) {
              console.log(`🔍 [BATCH ${topic}] First article urlToImage:`, relevant[0].urlToImage);
            }

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
              imageUrl: a.urlToImage || "",
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

        // Combine all topic summaries with varied transitions
        let combinedText = combineTopicSummaries(summariesWithTopics);
        
        // Add intro and outro to the final summary (once per summary, not per topic)
        combinedText = addIntroAndOutro(combinedText, topics, goodNewsOnly, req.user);

        // Generate a better title based on topics
        let title = "Summary";
        if (topics.length === 1) {
          title = `${topics[0].charAt(0).toUpperCase() + topics[0].slice(1)} Summary`;
        } else if (topics.length > 1) {
          title = "Mixed Summary";
        }

        return {
          items,
          combined: {
            id: `combined-${Date.now()}`,
            title: title,
            summary: combinedText,
            audioUrl: null,
          },
        };
      })
    );

    // Increment user usage for successful request (if authenticated)
    if (req.user) {
      try {
        if (mongoose.connection.readyState === 1) {
          // Reload user to ensure we have the latest data before incrementing
          const freshUser = await User.findById(req.user._id || req.user.id);
          if (freshUser) {
            await freshUser.incrementUsage();
            console.log(`[BATCH_SUMMARIZE] Incremented usage for user ${freshUser.email}, new count: ${freshUser.dailyUsageCount}`);
          } else {
            console.error(`[BATCH_SUMMARIZE] User not found when trying to increment usage: ${req.user._id || req.user.id}`);
          }
        } else {
          await fallbackAuth.incrementUsage(req.user);
          console.log(`[BATCH_SUMMARIZE] Incremented usage (fallback) for user ${req.user.email}, new count: ${req.user.dailyUsageCount}`);
        }
      } catch (incrementError) {
        console.error(`[BATCH_SUMMARIZE] Error incrementing usage:`, incrementError);
        // Don't fail the request if increment fails, but log it
      }
    }

    // Send notification if user is not in app and has device token (after response is sent)
    // Check appInForeground from first batch (all batches should have same value)
    const appInForeground = batches.length > 0 && batches[0].appInForeground !== false;
    
    // Send response first
    res.json({ results, batches: results });

    // Send notification asynchronously after response (don't wait for it)
    if (!appInForeground && req.user) {
      setImmediate(async () => {
        try {
          // Reload user to get latest device token
          let userWithToken;
          if (mongoose.connection.readyState === 1) {
            userWithToken = await User.findById(req.user._id || req.user.id);
          } else {
            userWithToken = req.user;
          }
          
          if (userWithToken && userWithToken.deviceToken) {
            // Generate title from first batch topics
            const firstBatch = batches[0];
            const firstTopics = Array.isArray(firstBatch.topics) ? firstBatch.topics : [];
            let title = "Summary";
            if (firstTopics.length === 1) {
              title = `${firstTopics[0].charAt(0).toUpperCase() + firstTopics[0].slice(1)} Summary`;
            } else if (firstTopics.length > 1) {
              title = "Mixed Summary";
            }
            
            await sendFetchReadyNotification(userWithToken.deviceToken, title);
            console.log(`[NOTIFICATIONS] Sent Fetch-ready notification to user ${userWithToken.email} (batch)`);
          }
        } catch (notifError) {
          // Don't fail the request if notification fails
          console.error('[NOTIFICATIONS] Error sending Fetch-ready notification:', notifError);
        }
      });
    }
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
    const maxLength = 4090; // Use most of the available limit
    const finalText = cleaned.length > maxLength ? cleaned.slice(0, maxLength - 3) + "..." : cleaned;
    
    // Log if text was truncated
    if (cleaned.length > maxLength) {
      console.log(`TTS text truncated from ${cleaned.length} to ${finalText.length} characters`);
    }

    // Check cache first (using final processed text)
    const cacheKey = cache.getTTSKey(finalText, voice, speed);
    const cached = await cache.get(cacheKey);
    
    // Cache is enabled for better performance
    const disableCache = false;
    
    if (cached && !disableCache) {
      // If B2 is configured, only use cached URLs that are B2 URLs
      // This prevents using stale local file URLs that may have been deleted
      const isB2Url = cached.audioUrl && cached.audioUrl.includes('backblazeb2.com');
      const shouldUseCache = !isB2Configured() || isB2Url;
      
      if (shouldUseCache) {
        console.log(`TTS cache hit for ${finalText.substring(0, 50)}... with voice: ${voice}`);
        // Ensure cached URL is absolute
        const baseUrl = req.protocol + '://' + req.get('host');
        const audioUrl = cached.audioUrl.startsWith('http') ? cached.audioUrl : `${baseUrl}${cached.audioUrl}`;
        return res.json({ audioUrl });
      } else {
        console.log(`TTS cache skipped - B2 configured but cached URL is local (may be stale)`);
      }
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

    // Try the requested voice with different models in parallel for faster response
    const attempts = [
      { model: "tts-1", voice: selectedVoice },
      { model: "tts-1-hd", voice: selectedVoice },
    ];
    
    // Try all models in parallel and use the first successful one
    let speech = null;
    let lastErr = null;
    
    const attemptPromises = attempts.map(async ({ model, voice: attemptVoice }) => {
      try {
        console.log(`TTS Attempt - Model: ${model}, Voice: ${attemptVoice}`);
        const result = await tryModel(model, attemptVoice);
        return { success: true, model, voice: attemptVoice, result };
      } catch (e) {
        const msg = e?.message || String(e);
        console.warn(`/api/tts attempt failed (model=${model}, voice=${attemptVoice}):`, msg);
        return { success: false, model, voice: attemptVoice, error: e };
      }
    });
    
    // Wait for all attempts and find the first successful one
    const results = await Promise.all(attemptPromises);
    const successful = results.find(r => r.success);
    
    if (successful) {
      speech = successful.result;
      console.log(`TTS Success - Model: ${successful.model}, Voice: ${successful.voice}`);
    } else {
      // If requested voice failed, try fallback models in parallel
      console.log(`TTS Fallback - Requested voice "${selectedVoice}" failed, trying alloy`);
      const fallbackAttempts = [
        { model: "tts-1", voice: "alloy" },
        { model: "tts-1-hd", voice: "alloy" },
      ];
      
      const fallbackPromises = fallbackAttempts.map(async ({ model, voice: attemptVoice }) => {
        try {
          console.log(`TTS Fallback Attempt - Model: ${model}, Voice: ${attemptVoice}`);
          const result = await tryModel(model, attemptVoice);
          return { success: true, model, voice: attemptVoice, result };
        } catch (e) {
          console.warn(`/api/tts fallback failed (model=${model}, voice=${attemptVoice}):`, e?.message || String(e));
          return { success: false, model, voice: attemptVoice, error: e };
        }
      });
      
      const fallbackResults = await Promise.all(fallbackPromises);
      const fallbackSuccessful = fallbackResults.find(r => r.success);
      
      if (fallbackSuccessful) {
        speech = fallbackSuccessful.result;
        console.log(`TTS Fallback Success - Model: ${fallbackSuccessful.model}, Voice: ${fallbackSuccessful.voice}`);
      } else {
        lastErr = fallbackResults[0]?.error || results[0]?.error;
      }
    }

    if (!speech) {
      throw lastErr || new Error("All TTS attempts failed");
    }

    const buffer = Buffer.from(await speech.arrayBuffer());
    const fileBase = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    
    let audioUrl;
    
    // Upload to B2 if configured, otherwise save locally
    if (isB2Configured()) {
      try {
        console.log('📤 Uploading audio to Backblaze B2...');
        audioUrl = await uploadAudioToB2(buffer, fileBase);
        console.log('✅ Audio uploaded to B2 successfully');
      } catch (b2Error) {
        console.error('❌ B2 upload failed, falling back to local storage:', b2Error);
        // Fallback to local storage
        const outPath = path.join(MEDIA_DIR, fileBase);
        fs.writeFileSync(outPath, buffer);
        const baseUrl = req.protocol + '://' + req.get('host');
        audioUrl = `${baseUrl}/media/${fileBase}`;
      }
    } else {
      console.log('⚠️  B2 not configured, using local storage');
      const outPath = path.join(MEDIA_DIR, fileBase);
      fs.writeFileSync(outPath, buffer);
      const baseUrl = req.protocol + '://' + req.get('host');
      audioUrl = `${baseUrl}/media/${fileBase}`;
    }
    
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

// --- Scheduled Fetch Checker ---
// Check if scheduler is disabled via environment variable
const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED !== 'false'; // Default to enabled unless explicitly disabled

// Lock to prevent concurrent scheduler executions
let schedulerRunning = false;
let schedulerTimeout = null;

// Helper function to save user with retry logic for version conflicts (for scheduler use)
async function saveUserWithRetryForScheduler(user, retries = 3) {
  while (retries > 0) {
    try {
      await user.save();
      return;
    } catch (error) {
      if (error.name === 'VersionError' && retries > 1) {
        console.log(`[SCHEDULER] Version conflict, retrying... (${retries - 1} retries left)`);
        // Reload the document to get the latest version
        const freshUser = await User.findById(user._id);
        if (freshUser) {
          // Preserve all changes from the current user object before reloading
          const modifiedPaths = user.modifiedPaths();
          const changesToPreserve = {};
          
          // Store all modified values
          for (const path of modifiedPaths) {
            changesToPreserve[path] = user.get(path);
          }
          
          // Also check for common fields that might have been modified
          if (user.isModified('scheduledSummaries')) {
            changesToPreserve['scheduledSummaries'] = user.scheduledSummaries;
          }
          
          // Copy the fresh user data to the original user object
          Object.assign(user, freshUser.toObject());
          
          // Now apply our preserved changes on top of the fresh data
          for (const [path, value] of Object.entries(changesToPreserve)) {
            user.set(path, value);
            user.markModified(path);
          }
          
          retries--;
          continue;
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }
  throw new Error('Failed to save user after retries');
}

// Function to check for scheduled summaries
async function checkScheduledSummaries() {
  // Early return if scheduler is disabled
  if (!SCHEDULER_ENABLED) {
    console.log(`[SCHEDULER] Scheduler is DISABLED (SCHEDULER_ENABLED=false). Skipping check.`);
    return;
  }
  
  // Prevent concurrent executions
  if (schedulerRunning) {
    console.log(`[SCHEDULER] Scheduler already running, skipping concurrent execution`);
    return;
  }
  
  schedulerRunning = true;
  
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`; // HH:mm format
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
    
    console.log(`[SCHEDULER] ============================================`);
    console.log(`[SCHEDULER] CHECKING SCHEDULED SUMMARIES`);
    console.log(`[SCHEDULER] Current time: ${currentTime} on ${currentDay}`);
    console.log(`[SCHEDULER] Server timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    console.log(`[SCHEDULER] Full server time: ${now.toString()}`);
    
    // Find all users with scheduled summaries
    // Use the User model that's already imported at the top of the file
    const users = await User.find({
      'scheduledSummaries': { $exists: true, $ne: [] }
    });
    
    console.log(`[SCHEDULER] Found ${users.length} users with scheduled summaries`);
    
    let executedCount = 0;
    let checkedCount = 0;
    const usersToSave = []; // Batch user saves (only for cleanup operations, not execution locks)
    
    for (const user of users) {
      let scheduledSummaries = user.scheduledSummaries || [];
      let needsSave = false;
      
      // Clean up summaries with empty days arrays (they can't execute anyway)
      const originalCount = scheduledSummaries.length;
      scheduledSummaries = scheduledSummaries.filter(summary => 
        summary.days && summary.days.length > 0
      );
      
      if (scheduledSummaries.length !== originalCount) {
        console.log(`[SCHEDULER] Cleaned up ${originalCount - scheduledSummaries.length} summaries with empty days for user ${user.email}`);
        user.scheduledSummaries = scheduledSummaries;
        needsSave = true;
      }
      
      for (const summary of scheduledSummaries) {
        checkedCount++;
        const isEnabled = summary.isEnabled;
        
        if (!isEnabled) {
          continue;
        }
        
        // Get user's timezone from preferences (default to UTC if not set)
        const userTimezone = user.preferences?.timezone || 'UTC';
        
        // Convert server's current time to user's timezone for comparison
        // Reuse formatter if same timezone (optimization)
        const formatterOptions = {
          timeZone: userTimezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          weekday: 'long'
        };
        const formatter = new Intl.DateTimeFormat('en-US', formatterOptions);
        
        const parts = formatter.formatToParts(now);
        const userHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
        const userMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
        const userTime = `${String(userHour).padStart(2, '0')}:${String(userMinute).padStart(2, '0')}`;
        const userDay = parts.find(p => p.type === 'weekday')?.value || currentDay;
        
        // Check if it's the correct day in user's timezone
        const isCorrectUserDay = summary.days && summary.days.includes(userDay);
        
        if (!isCorrectUserDay) {
          console.log(`[SCHEDULER] Summary "${summary.name}": wrong day in user timezone (${userDay}, needs ${JSON.stringify(summary.days)})`);
          continue;
        }
        
        // Parse scheduled time (stored as HH:mm in user's local timezone)
        const [scheduledHour, scheduledMinute] = summary.time.split(':').map(Number);
        const scheduledTimeMinutes = scheduledHour * 60 + scheduledMinute;
        const userTimeMinutes = userHour * 60 + userMinute;
        
        // Execute if we're within 5 minutes of the scheduled time (accounts for scheduler check intervals)
        // Since we check at :00, :10, :20, :30, :40, :50, we need a small window to catch scheduled times
        // The lastRun check ensures it only executes once per day, even if scheduler checks multiple times
        const timeDifference = Math.abs(userTimeMinutes - scheduledTimeMinutes);
        const isWithinTimeWindow = timeDifference <= 5; // Allow 5 minute window for scheduler check intervals
        
        // Check if summary has already run today in user's timezone (prevent duplicate executions)
        const lastRun = summary.lastRun ? new Date(summary.lastRun) : null;
        let alreadyRanToday = false;
        if (lastRun) {
          // Use a robust date comparison that accounts for timezone
          const dateFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: userTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
          
          const lastRunDateStr = dateFormatter.format(lastRun);
          const nowDateStr = dateFormatter.format(now);
          const sameDate = lastRunDateStr === nowDateStr;
          
          if (sameDate) {
            // If it ran today, check if it was less than 23 hours ago to prevent duplicate runs
            // This handles edge cases where the scheduler might check multiple times
            const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
            alreadyRanToday = hoursSinceLastRun < 23;
          } else {
            // Different dates - allow it to run (it ran yesterday or earlier)
            alreadyRanToday = false;
          }
        }
        
        console.log(`[SCHEDULER] Summary "${summary.name}": enabled=${isEnabled}, time=${summary.time} (user time=${userTime}, server time=${currentTime}), user timezone=${userTimezone}, user day=${userDay}, timeDiff=${timeDifference}min, withinWindow=${isWithinTimeWindow}, alreadyRanToday=${alreadyRanToday}`);
        
        if (isWithinTimeWindow && !alreadyRanToday) {
          // CRITICAL: Reload user from database to get latest lastRun value and prevent concurrent executions
          let freshUser;
          try {
            freshUser = await User.findById(user._id);
            if (!freshUser) {
              console.error(`[SCHEDULER] User ${user.email} not found in database`);
              continue;
            }
          } catch (dbError) {
            console.error(`[SCHEDULER] Error reloading user ${user.email}:`, dbError);
            continue;
          }
          
          // Check again with fresh data to prevent race conditions
          const freshSummary = freshUser.scheduledSummaries?.find(s => s.id === summary.id);
          if (!freshSummary) {
            console.log(`[SCHEDULER] Summary "${summary.name}" not found for user ${user.email} after reload`);
            continue;
          }
          
          // Double-check lastRun with fresh data
          const freshLastRun = freshSummary.lastRun ? new Date(freshSummary.lastRun) : null;
          let freshAlreadyRanToday = false;
          if (freshLastRun) {
            const dateFormatter = new Intl.DateTimeFormat('en-US', {
              timeZone: userTimezone,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            });
            const freshLastRunDateStr = dateFormatter.format(freshLastRun);
            const nowDateStr = dateFormatter.format(now);
            const freshSameDate = freshLastRunDateStr === nowDateStr;
            
            if (freshSameDate) {
              // If it ran today, check if it was less than 23 hours ago to prevent duplicate runs
              const hoursSinceLastRun = (now.getTime() - freshLastRun.getTime()) / (1000 * 60 * 60);
              freshAlreadyRanToday = hoursSinceLastRun < 23;
            } else {
              // Different dates - allow it to run (it ran yesterday or earlier)
              freshAlreadyRanToday = false;
            }
          }
          
          if (freshAlreadyRanToday) {
            console.log(`[SCHEDULER] Summary "${summary.name}" already ran today for user ${user.email} (checked with fresh data)`);
            continue;
          }
          
          // Update lastRun IMMEDIATELY before execution to prevent concurrent runs
          const summaryIndex = freshUser.scheduledSummaries.findIndex(s => s.id === summary.id);
          if (summaryIndex !== -1) {
            freshUser.scheduledSummaries[summaryIndex].lastRun = new Date().toISOString();
            freshUser.markModified('scheduledSummaries');
            
            // Save immediately to lock the execution with retry logic for version conflicts
            try {
              await saveUserWithRetryForScheduler(freshUser);
              console.log(`[SCHEDULER] Locked execution for "${summary.name}" - updated lastRun before execution`);
            } catch (saveError) {
              console.error(`[SCHEDULER] Failed to lock execution for "${summary.name}":`, saveError);
              // If save fails, skip execution to prevent duplicates
              continue;
            }
          }
          
          console.log(`[SCHEDULER] Executing scheduled fetch "${summary.name}" for user ${user.email} on ${currentDay}`);
          
          try {
            // Import and call the execution function directly
            const { executeScheduledSummary } = require('./routes/scheduledSummaries');
            await executeScheduledSummary(freshUser, freshSummary);
            console.log(`[SCHEDULER] Successfully executed scheduled fetch "${summary.name}" for user ${user.email}`);
            executedCount++;
          } catch (error) {
            console.error(`[SCHEDULER] Failed to execute scheduled fetch "${summary.name}" for user ${user.email}:`, error);
            // Note: lastRun was already updated, so this won't retry until tomorrow
          }
        }
      }
      
      // Batch save user if needed (only for cleanup operations, not execution locks)
      // Note: Execution locks are saved immediately before execution to prevent race conditions
      if (needsSave) {
        usersToSave.push(user);
      }
    }
    
    // Batch save all modified users (only for cleanup operations)
    if (usersToSave.length > 0) {
      await Promise.all(usersToSave.map(user => user.save().catch(err => 
        console.error(`[SCHEDULER] Error saving user ${user.email}:`, err)
      )));
    }
    
    // Always log the result, even if nothing was checked
    if (checkedCount > 0) {
      console.log(`[SCHEDULER] Result: Checked ${checkedCount} summaries, executed ${executedCount}`);
    } else {
      console.log(`[SCHEDULER] Result: No summaries to check or no matches found`);
    }
    console.log(`[SCHEDULER] Next check in 10 minutes`);
    console.log(`[SCHEDULER] ============================================`);
  } catch (error) {
    console.error('[SCHEDULER] Error checking scheduled summaries:', error);
    console.log(`[SCHEDULER] Next check in 10 minutes`);
    console.log(`[SCHEDULER] ============================================`);
  } finally {
    schedulerRunning = false;
  }
}

// Schedule checks at :00, :10, :20, :30, :40, and :50 minutes past each hour
function scheduleNextCheck() {
  // Clear any existing timeout to prevent duplicates
  if (schedulerTimeout) {
    clearTimeout(schedulerTimeout);
    schedulerTimeout = null;
  }
  
  const now = new Date();
  const currentMinute = now.getMinutes();
  const currentSecond = now.getSeconds();
  const currentMillisecond = now.getMilliseconds();
  
  // Target minutes: 0, 10, 20, 30, 40, 50
  const targetMinutes = [0, 10, 20, 30, 40, 50];
  
  // Find next target minute (always schedule for the NEXT target, never immediate)
  let nextMinute = null;
  for (const target of targetMinutes) {
    if (target > currentMinute) {
      nextMinute = target;
      break;
    }
  }
  
  // If no target found in this hour, use the first target of next hour
  if (nextMinute === null) {
    nextMinute = targetMinutes[0];
  }
  
  // Calculate milliseconds until next check
  let msUntilNext;
  if (nextMinute > currentMinute) {
    // Next check is in the same hour
    const minutesUntilNext = nextMinute - currentMinute;
    const secondsUntilNext = minutesUntilNext * 60 - currentSecond;
    msUntilNext = secondsUntilNext * 1000 - currentMillisecond;
  } else {
    // Next check is in the next hour
    const minutesUntilNext = 60 - currentMinute + nextMinute;
    const secondsUntilNext = minutesUntilNext * 60 - currentSecond;
    msUntilNext = secondsUntilNext * 1000 - currentMillisecond;
  }
  
  // Ensure minimum delay of at least 1 second to prevent immediate re-execution
  if (msUntilNext < 1000) {
    msUntilNext = 60000; // If we're at or past the target, wait for next interval (1 minute minimum)
  }
  
  console.log(`[SCHEDULER] Next check scheduled in ${Math.floor(msUntilNext / 1000 / 60)} minutes ${Math.floor((msUntilNext / 1000) % 60)} seconds (at :${String(nextMinute).padStart(2, '0')})`);
  
  schedulerTimeout = setTimeout(() => {
    schedulerTimeout = null;
    checkScheduledSummaries().then(() => {
      // Schedule the next check after this one completes
      scheduleNextCheck();
    }).catch((error) => {
      console.error('[SCHEDULER] Error in checkScheduledSummaries, will retry:', error);
      // Still schedule next check even on error
      scheduleNextCheck();
    });
  }, msUntilNext);
}

// Start the scheduling only if enabled
if (SCHEDULER_ENABLED) {
  console.log(`[SCHEDULER] Scheduled summary checker ENABLED - checking every 10 minutes`);
  scheduleNextCheck();
} else {
  console.log(`[SCHEDULER] ⚠️  Scheduled summary checker DISABLED (SCHEDULER_ENABLED=false)`);
  console.log(`[SCHEDULER] Automatic news fetching is disabled. Set SCHEDULER_ENABLED=true to enable.`);
}

// --- Daily Usage Reset Scheduler ---
// Reset all users' dailyUsageCount at midnight PST
let dailyResetRunning = false;
let dailyResetTimeout = null;
let lastResetDate = null;

// Helper function to get date string in PST timezone
function getDateStringInPST(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  
  const pstDate = new Date(`${year}-${month}-${day}T00:00:00`);
  return pstDate.toDateString();
}

// Function to reset all users' daily usage counts
async function resetAllUsersDailyCount() {
  // Prevent concurrent executions
  if (dailyResetRunning) {
    console.log(`[DAILY_RESET] Reset already running, skipping concurrent execution`);
    return;
  }
  
  dailyResetRunning = true;
  
  try {
    const now = new Date();
    const todayPST = getDateStringInPST(now);
    
    // Check if we've already reset today
    if (lastResetDate === todayPST) {
      console.log(`[DAILY_RESET] Already reset today (${todayPST}), skipping`);
      dailyResetRunning = false;
      return;
    }
    
    // Get current time in PST
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const pstTimeParts = formatter.formatToParts(now);
    const pstHour = parseInt(pstTimeParts.find(p => p.type === 'hour').value);
    const pstMinute = parseInt(pstTimeParts.find(p => p.type === 'minute').value);
    
    // Only reset at or just after midnight PST (between 00:00 and 00:05)
    if (pstHour === 0 && pstMinute <= 5) {
      console.log(`[DAILY_RESET] ============================================`);
      console.log(`[DAILY_RESET] RESETTING ALL USERS' DAILY USAGE COUNTS`);
      console.log(`[DAILY_RESET] Current PST time: ${pstHour}:${String(pstMinute).padStart(2, '0')}`);
      console.log(`[DAILY_RESET] PST date: ${todayPST}`);
      
      // Find all users
      const users = await User.find({});
      console.log(`[DAILY_RESET] Found ${users.length} users to reset`);
      
      let resetCount = 0;
      let errorCount = 0;
      
      // Reset all users' dailyUsageCount to 0 and update lastUsageDate
      for (const user of users) {
        try {
          // Always reset at midnight PST - set dailyUsageCount to 0 and update lastUsageDate
          // This ensures all users are synchronized to the new day
          const needsReset = user.dailyUsageCount > 0 || 
                            !user.lastUsageDate || 
                            getDateStringInPST(new Date(user.lastUsageDate)) !== todayPST;
          
          if (needsReset) {
            user.dailyUsageCount = 0;
            user.lastUsageDate = now;
            await user.save();
            resetCount++;
          }
        } catch (err) {
          console.error(`[DAILY_RESET] Error resetting user ${user.email}:`, err);
          errorCount++;
        }
      }
      
      lastResetDate = todayPST;
      
      console.log(`[DAILY_RESET] Reset completed: ${resetCount} users reset, ${errorCount} errors`);
      console.log(`[DAILY_RESET] ============================================`);
    } else {
      // Not midnight yet, skip
      console.log(`[DAILY_RESET] Not midnight PST yet (current: ${pstHour}:${String(pstMinute).padStart(2, '0')}), skipping reset`);
    }
  } catch (error) {
    console.error('[DAILY_RESET] Error resetting daily usage counts:', error);
  } finally {
    dailyResetRunning = false;
  }
}

// Function to schedule the next daily reset check
function scheduleDailyResetCheck() {
  // Clear any existing timeout
  if (dailyResetTimeout) {
    clearTimeout(dailyResetTimeout);
    dailyResetTimeout = null;
  }
  
  const now = new Date();
  
  // Get current time in PST
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const pstTimeParts = formatter.formatToParts(now);
  const pstHour = parseInt(pstTimeParts.find(p => p.type === 'hour').value);
  const pstMinute = parseInt(pstTimeParts.find(p => p.type === 'minute').value);
  const pstSecond = parseInt(pstTimeParts.find(p => p.type === 'second').value);
  
  let msUntilNextCheck;
  
  // If we're in the midnight window (23:55 - 00:05), check every minute
  if ((pstHour === 23 && pstMinute >= 55) || (pstHour === 0 && pstMinute <= 5)) {
    // Check every minute during the reset window
    msUntilNextCheck = 60 * 1000; // 1 minute
  } else {
    // Otherwise, check every hour (but we'll recalculate when we get closer to midnight)
    msUntilNextCheck = 60 * 60 * 1000; // 1 hour
  }
  
  dailyResetTimeout = setTimeout(() => {
    dailyResetTimeout = null;
    resetAllUsersDailyCount().then(() => {
      // Schedule the next check
      scheduleDailyResetCheck();
    }).catch((error) => {
      console.error('[DAILY_RESET] Error in resetAllUsersDailyCount, will retry:', error);
      // Still schedule next check even on error
      scheduleDailyResetCheck();
    });
  }, msUntilNextCheck);
}

// Start the daily reset scheduler
console.log(`[DAILY_RESET] Daily usage reset scheduler ENABLED - will reset all users at midnight PST`);
scheduleDailyResetCheck();

// --- Engagement Reminder Scheduler ---
// Send engagement reminders to users who haven't used the app in 24+ hours
let engagementReminderRunning = false;
let engagementReminderTimeout = null;

async function checkEngagementReminders() {
  // Prevent concurrent executions
  if (engagementReminderRunning) {
    console.log(`[ENGAGEMENT] Engagement reminder check already running, skipping`);
    return;
  }
  
  engagementReminderRunning = true;
  
  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    
    console.log(`[ENGAGEMENT] ============================================`);
    console.log(`[ENGAGEMENT] Checking for users needing engagement reminders`);
    console.log(`[ENGAGEMENT] Current time: ${now.toISOString()}`);
    
    // Find users who:
    // 1. Have a device token registered
    // 2. Have engagement reminders enabled (default: true)
    // 3. Haven't used app in 24+ hours (based on lastUsageDate)
    // 4. Haven't received reminder in 48+ hours
    const users = await User.find({
      deviceToken: { $exists: true, $ne: null },
      lastUsageDate: { $lt: twentyFourHoursAgo }
    });
    
    console.log(`[ENGAGEMENT] Found ${users.length} users with device tokens who haven't used app in 24+ hours`);
    
    let remindersSent = 0;
    let remindersSkipped = 0;
    
    for (const user of users) {
      try {
        // Check if engagement reminders are enabled (default: true)
        const notificationPrefs = user.notificationPreferences || {};
        const engagementRemindersEnabled = notificationPrefs.engagementReminders !== false;
        
        if (!engagementRemindersEnabled) {
          console.log(`[ENGAGEMENT] Engagement reminders disabled for user ${user.email}`);
          remindersSkipped++;
          continue;
        }
        
        // Check when last reminder was sent
        const lastReminderSent = notificationPrefs.lastEngagementReminderSent 
          ? new Date(notificationPrefs.lastEngagementReminderSent) 
          : null;
        
        // Skip if reminder was sent within last 48 hours
        if (lastReminderSent && lastReminderSent > fortyEightHoursAgo) {
          const hoursSinceReminder = Math.floor((now.getTime() - lastReminderSent.getTime()) / (60 * 60 * 1000));
          console.log(`[ENGAGEMENT] Skipping user ${user.email} - reminder sent ${hoursSinceReminder} hours ago (min 48h)`);
          remindersSkipped++;
          continue;
        }
        
        // Get device token (check both MongoDB and fallback)
        let deviceToken = null;
        if (mongoose.connection.readyState === 1) {
          deviceToken = user.deviceToken;
        } else {
          deviceToken = user.preferences?.deviceToken || null;
        }
        
        if (!deviceToken) {
          console.log(`[ENGAGEMENT] No device token found for user ${user.email}`);
          remindersSkipped++;
          continue;
        }
        
        // Send engagement reminder
        const success = await sendEngagementReminder(deviceToken);
        
        if (success) {
          // Update last reminder sent time
          if (!user.notificationPreferences) {
            user.notificationPreferences = {};
          }
          user.notificationPreferences.lastEngagementReminderSent = now;
          
          if (mongoose.connection.readyState === 1) {
            user.markModified('notificationPreferences');
            await user.save();
          } else {
            if (!user.preferences) {
              user.preferences = {};
            }
            user.preferences.notificationPreferences = user.notificationPreferences;
            await fallbackAuth.updatePreferences(user, user.preferences);
          }
          
          const hoursSinceUsage = Math.floor((now.getTime() - user.lastUsageDate.getTime()) / (60 * 60 * 1000));
          console.log(`[ENGAGEMENT] ✅ Sent engagement reminder to user ${user.email} (last used ${hoursSinceUsage}h ago)`);
          remindersSent++;
        } else {
          console.log(`[ENGAGEMENT] ❌ Failed to send engagement reminder to user ${user.email}`);
          remindersSkipped++;
        }
      } catch (error) {
        console.error(`[ENGAGEMENT] Error processing user ${user.email}:`, error);
        remindersSkipped++;
      }
    }
    
    console.log(`[ENGAGEMENT] Summary: ${remindersSent} reminders sent, ${remindersSkipped} skipped`);
    console.log(`[ENGAGEMENT] ============================================`);
  } catch (error) {
    console.error('[ENGAGEMENT] Error in checkEngagementReminders:', error);
  } finally {
    engagementReminderRunning = false;
  }
}

// Function to schedule the next engagement reminder check (runs every hour)
function scheduleEngagementReminderCheck() {
  // Clear any existing timeout
  if (engagementReminderTimeout) {
    clearTimeout(engagementReminderTimeout);
    engagementReminderTimeout = null;
  }
  
  // Run every hour (60 minutes)
  const msUntilNextCheck = 60 * 60 * 1000; // 1 hour
  
  engagementReminderTimeout = setTimeout(() => {
    engagementReminderTimeout = null;
    checkEngagementReminders().then(() => {
      // Schedule the next check
      scheduleEngagementReminderCheck();
    }).catch((error) => {
      console.error('[ENGAGEMENT] Error in checkEngagementReminders, will retry:', error);
      // Still schedule next check even on error
      scheduleEngagementReminderCheck();
    });
  }, msUntilNextCheck);
  
  console.log(`[ENGAGEMENT] Next engagement reminder check scheduled in 1 hour`);
}

// Start the engagement reminder scheduler
console.log(`[ENGAGEMENT] Engagement reminder scheduler ENABLED - checking every hour`);
// Run initial check after 5 minutes (to allow server to fully start)
setTimeout(() => {
  checkEngagementReminders().then(() => {
    scheduleEngagementReminderCheck();
  });
}, 5 * 60 * 1000);

// --- Trending Topics Updater ---
// Update trending topics every hour
let trendingTopicsCache = [];
let trendingTopicsWithSources = {}; // Store topics with their source articles
let lastTrendingUpdate = null;

// Persistent file for trending topics cache
const TRENDING_TOPICS_FILE = path.join(__dirname, "./server_data/trending_topics_cache.json");

// Ensure server_data directory exists
const serverDataDir = path.join(__dirname, "./server_data");
if (!fs.existsSync(serverDataDir)) {
  fs.mkdirSync(serverDataDir, { recursive: true });
}

// Load trending topics from MongoDB (with file fallback)
async function loadTrendingTopics() {
  // Wait for MongoDB connection if it's connecting (readyState 2 = connecting)
  if (mongoose.connection.readyState === 2) {
    console.log('[TRENDING] MongoDB is connecting, waiting up to 10 seconds...');
    let waited = 0;
    while (mongoose.connection.readyState !== 1 && waited < 10000) {
      await new Promise(resolve => setTimeout(resolve, 500));
      waited += 500;
    }
  }
  
  let loadedFromMongoDB = false;
  
  // Try MongoDB first
  if (mongoose.connection.readyState === 1) {
    try {
      const settings = await GlobalSettings.getOrCreate();
      if (settings.trendingTopics && settings.trendingTopics.length > 0) {
        trendingTopicsCache = settings.trendingTopics;
        trendingTopicsWithSources = settings.trendingTopicsWithSources || {};
        lastTrendingUpdate = settings.lastTrendingUpdate;
        const sourcesCount = Object.keys(trendingTopicsWithSources).length;
        console.log(`[TRENDING] Loaded ${trendingTopicsCache.length} trending topics and ${sourcesCount} topic sources from MongoDB`);
        loadedFromMongoDB = true;
        return; // Successfully loaded from MongoDB, no need to check file
      } else {
        console.log('[TRENDING] MongoDB connected but no trending topics found in database, checking file fallback...');
      }
    } catch (error) {
      console.error('[TRENDING] Error loading from MongoDB, falling back to file:', error.message);
    }
  } else {
    console.log(`[TRENDING] MongoDB not connected (readyState: ${mongoose.connection.readyState}), falling back to file`);
  }
  
  // Fallback to file if MongoDB not available or empty
  try {
    if (fs.existsSync(TRENDING_TOPICS_FILE)) {
      const data = fs.readFileSync(TRENDING_TOPICS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed && Array.isArray(parsed.topics) && parsed.topics.length > 0) {
        trendingTopicsCache = parsed.topics;
        if (parsed.lastUpdated) {
          lastTrendingUpdate = new Date(parsed.lastUpdated);
        }
        // Load topics with sources if available
        if (parsed.topicsWithSources && typeof parsed.topicsWithSources === 'object') {
          trendingTopicsWithSources = parsed.topicsWithSources;
          console.log(`[TRENDING] Loaded ${trendingTopicsCache.length} trending topics and sources from cache file`);
        } else {
          console.log(`[TRENDING] Loaded ${trendingTopicsCache.length} trending topics from cache file`);
        }
        // Migrate file data to MongoDB if available
        if (mongoose.connection.readyState === 1) {
          try {
            const settings = await GlobalSettings.getOrCreate();
            await settings.updateTrendingTopics(trendingTopicsCache, trendingTopicsWithSources);
            console.log('[TRENDING] Migrated trending topics from file to MongoDB');
          } catch (error) {
            console.error('[TRENDING] Error migrating to MongoDB:', error.message);
          }
        }
        return; // Successfully loaded from file
      }
    }
    
    // If we get here, neither MongoDB nor file had data
    if (!loadedFromMongoDB) {
      console.log('[TRENDING] No cache found, starting with empty trending topics');
    }
  } catch (error) {
    console.error('[TRENDING] Error loading trending topics from file:', error);
  }
  
  // If trending topics are still empty after trying all sources, trigger an update
  // COMMENTED OUT: Auto-generated trending topics disabled - only manual topics allowed
  // if (trendingTopicsCache.length === 0) {
  //   console.log('[TRENDING] No trending topics found, triggering automatic update...');
  //   // Trigger update asynchronously (don't await to avoid blocking startup)
  //   updateTrendingTopics().catch(error => {
  //     console.error('[TRENDING] Failed to auto-update trending topics:', error);
  //   });
  // }
}

// Save trending topics to MongoDB (with file backup)
async function saveTrendingTopics() {
  // Try MongoDB first
  if (mongoose.connection.readyState === 1) {
    try {
      const settings = await GlobalSettings.getOrCreate();
      await settings.updateTrendingTopics(trendingTopicsCache, trendingTopicsWithSources);
      const sourcesCount = Object.keys(trendingTopicsWithSources || {}).length;
      console.log(`[TRENDING] Saved ${trendingTopicsCache.length} trending topics and ${sourcesCount} topic sources to MongoDB`);
      // Also save to file as backup
      try {
        const data = {
          topics: trendingTopicsCache,
          topicsWithSources: trendingTopicsWithSources || {},
          lastUpdated: lastTrendingUpdate ? lastTrendingUpdate.toISOString() : null
        };
        fs.writeFileSync(TRENDING_TOPICS_FILE, JSON.stringify(data, null, 2), 'utf8');
      } catch (fileError) {
        // Non-critical - MongoDB is primary storage
        console.warn('[TRENDING] Could not save backup to file:', fileError.message);
      }
      return;
    } catch (error) {
      console.error('[TRENDING] Error saving to MongoDB, falling back to file:', error.message);
    }
  }
  
  // Fallback to file if MongoDB not available
  try {
    const data = {
      topics: trendingTopicsCache,
      topicsWithSources: trendingTopicsWithSources || {},
      lastUpdated: lastTrendingUpdate ? lastTrendingUpdate.toISOString() : null
    };
    fs.writeFileSync(TRENDING_TOPICS_FILE, JSON.stringify(data, null, 2), 'utf8');
    const sourcesCount = Object.keys(trendingTopicsWithSources || {}).length;
    console.log(`[TRENDING] Saved ${trendingTopicsCache.length} trending topics and ${sourcesCount} topic sources to cache file`);
  } catch (error) {
    console.error('[TRENDING] Error saving trending topics to file:', error);
  }
}

// Load trending topics on startup (async, but don't block)
// Try loading immediately in case MongoDB is already connected
loadTrendingTopics().catch(error => {
  console.error('[TRENDING] Failed to load trending topics on startup:', error);
});

// Also load trending topics when MongoDB connects (in case it wasn't connected on startup)
mongoose.connection.on('connected', () => {
  console.log('[TRENDING] MongoDB connected, loading trending topics...');
  loadTrendingTopics().then(() => {
    // After loading, check if we still have empty trending topics and trigger update if needed
    // COMMENTED OUT: Auto-generated trending topics disabled - only manual topics allowed
    // if (trendingTopicsCache.length === 0) {
    //   console.log('[TRENDING] Trending topics still empty after MongoDB connection, triggering update...');
    //   updateTrendingTopics().catch(error => {
    //     console.error('[TRENDING] Failed to auto-update trending topics after MongoDB connection:', error);
    //   });
    // }
  }).catch(error => {
    console.error('[TRENDING] Failed to load trending topics after MongoDB connection:', error);
    // Even if load failed, try to update if cache is empty
    // COMMENTED OUT: Auto-generated trending topics disabled - only manual topics allowed
    // if (trendingTopicsCache.length === 0) {
    //   console.log('[TRENDING] Triggering update after failed load...');
    //   updateTrendingTopics().catch(updateError => {
    //     console.error('[TRENDING] Failed to auto-update trending topics:', updateError);
    //   });
    // }
  });
});

// Extract trending topics using ChatGPT analysis of news articles
// COMMENTED OUT: Auto-generated trending topics disabled - only manual topics allowed
/*async function extractTrendingTopicsWithChatGPT(articles, initialTopics = []) {
  try {
    if (!OPENAI_API_KEY) {
      console.log('[TRENDING] OpenAI API key not configured, skipping ChatGPT analysis');
      return [];
    }
    
    // Prepare article data for ChatGPT
    const articleSummaries = articles.map(article => ({
      title: article.title || '',
      description: article.description || '',
      source: article.source || 'Unknown',
      published_at: article.published_at || ''
    })).filter(article => article.title.length > 0);
    
    if (articleSummaries.length === 0) {
      console.log('[TRENDING] No valid articles to analyze');
      return [];
    }
    
    // Create a comprehensive prompt for ChatGPT
    const articlesText = articleSummaries.map((article, index) => 
      `${index + 1}. ${article.title} (${article.source})\n   ${article.description}`
    ).join('\n\n');
    
    // Include initial topics from headline analysis if available
    const initialTopicsText = initialTopics.length > 0 
      ? `\n\nInitial topics extracted from headlines (for reference): ${initialTopics.join(', ')}`
      : '';
    
    const prompt = `Analyze the following news articles from 9 major trusted sources (CNN, BBC, Reuters, NBC, AP, Bloomberg, NY Times, USA Today, NPR) and extract the 8 most important trending topics/keywords that would be relevant for a news summary app. Focus on:

1. Major political events, policy changes, or government actions
2. Significant business/economic developments
3. Important technology breakthroughs or tech company news
4. Major sports events or developments
5. Entertainment industry news or celebrity events
6. Health/medical breakthroughs or public health issues
7. International relations or global events
8. Environmental or climate-related news

CRITICAL REQUIREMENTS:
- Each topic should be a complete, coherent phrase (2-4 words) that makes sense on its own
- Avoid person names unless they represent major breaking news (e.g., "Trump Trial" is OK, but "John Smith" is not)
- Avoid overlapping or duplicate topics (e.g., don't include both "Israel-Gaza Conflict" and "Israel-Hamas War" - pick the most comprehensive one)
- Focus on events, issues, and developments - not individual people unless they're central to a major story
- Avoid generic terms like "news", "report", "update", "latest", or weather-related terms unless they're truly significant events
- Ensure topics are distinct and cover different aspects of current events

Examples of good topics: "Federal Reserve Policy", "Tesla Stock Performance", "Olympic Games 2024", "Climate Summit", "Election Results"
Examples of bad topics: "Meta", "Fights", "Million", "Penalty" (too fragmented), "John Doe" (person name without context), "Israel Conflict" and "Gaza War" (overlapping)

IMPORTANT: These articles come from 9 trusted news sources. Prioritize topics that appear across multiple sources as they are more likely to be truly trending. Use the initial topics as a guide but refine them to be more comprehensive and avoid overlaps.

Return ONLY a comma-separated list of exactly 8 distinct, non-overlapping topics, in order of importance. Do NOT use numbered lists or bullet points:

Articles:
${articlesText}${initialTopicsText}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a news analyst expert at identifying trending topics from news articles. Return only the requested format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[TRENDING] ChatGPT API error: ${response.status} - ${errorText}`);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    
    if (!content) {
      console.log('[TRENDING] No content returned from ChatGPT');
      return [];
    }
    
    // Parse the response - handle both comma-separated and numbered list formats
    let topics = [];
    
    // First, try to handle numbered lists (1. 2. 3. or 1) 2) 3))
    const numberedListPattern = /^\d+[\.\)]\s*(.+?)(?=\s*\d+[\.\)]|$)/gm;
    const numberedMatches = [...content.matchAll(numberedListPattern)];
    
    if (numberedMatches.length > 0) {
      // Extract topics from numbered list
      topics = numberedMatches.map(match => match[1].trim()).filter(topic => topic.length > 0);
    } else {
      // Fall back to comma-separated parsing
      topics = content.split(',').map(topic => topic.trim()).filter(topic => topic.length > 0);
    }
    
    // Clean up topics: remove leading numbers, periods, and other formatting
    topics = topics.map(topic => {
      // Remove leading numbers and punctuation (e.g., "1. Topic" -> "Topic")
      // Match: one or more digits followed by either a period or closing parenthesis, then optional whitespace
      const regex = new RegExp('^\\d+[.)]\\s*');
      return topic.replace(regex, '').trim();
    }).filter(topic => topic.length > 0);
    
    // Filter out fragmented topics and person names
    const stopWords = ['meta', 'fights', 'million', 'penalty', 'over', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    topics = topics.filter(topic => {
      const words = topic.toLowerCase().split(/\s+/);
      // Keep topics that have 2+ words
      if (words.length < 2) {
        return false;
      }
      // Filter out topics that are just person names (common pattern: FirstName LastName)
      // This is a simple heuristic - if it's 2 words that look like a name, skip it
      const topicParts = topic.split(' ');
      if (words.length === 2) {
        // Check if both parts start with capital letters (likely a name)
        const looksLikeName = /^[A-Z][a-z]+$/.test(topicParts[0]) && /^[A-Z][a-z]+$/.test(topicParts[1]);
        if (looksLikeName) {
          // Check if it's actually a news event (e.g., "Trump Trial" has context)
          const hasContext = topicLower.includes('trial') || 
                            topicLower.includes('election') ||
                            topicLower.includes('war') ||
                            topicLower.includes('conflict') ||
                            topicLower.includes('summit') ||
                            topicLower.includes('meeting') ||
                            topicLower.includes('court') ||
                            topicLower.includes('verdict') ||
                            topicLower.includes('arrest') ||
                            topicLower.includes('resignation');
          if (!hasContext) {
            return false; // Likely just a person name without news context
          }
        }
      }
      return true;
    });
    
    // Deduplicate similar/overlapping topics
    const deduplicatedTopics = [];
    const commonWords = ['the', 'and', 'for', 'with', 'from', 'about', 'in', 'on', 'at', 'to', 'of', 'a', 'an'];
    
    // Helper function to extract significant words (excluding common words)
    function getSignificantWords(text) {
      return text.toLowerCase().split(/[\s\-]+/).filter(w => 
        w.length > 2 && !commonWords.includes(w)
      );
    }
    
    // Helper function to merge two topics into a more comprehensive one
    function mergeTopics(topic1, topic2) {
      const words1 = topic1.toLowerCase().split(/[\s\-]+/);
      const words2 = topic2.toLowerCase().split(/[\s\-]+/);
      const allWords = [...new Set([...words1, ...words2])];
      // Try to preserve word order by checking if one contains the other
      if (topic1.toLowerCase().includes(topic2.toLowerCase())) {
        return topic1;
      }
      if (topic2.toLowerCase().includes(topic1.toLowerCase())) {
        return topic2;
      }
      // Check for sequential overlap (e.g., "Modi Declares" + "Declares Victory")
      const topic1Lower = topic1.toLowerCase();
      const topic2Lower = topic2.toLowerCase();
      // Check if the end of one matches the start of another
      for (let i = 1; i < Math.min(words1.length, words2.length); i++) {
        const endOf1 = words1.slice(-i).join(' ');
        const startOf2 = words2.slice(0, i).join(' ');
        if (endOf1 === startOf2) {
          // Merge them: take all words from topic1 + remaining words from topic2
          return (words1.join(' ') + ' ' + words2.slice(i).join(' '))
            .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
      }
      // If no sequential match, combine unique significant words
      const significant1 = getSignificantWords(topic1);
      const significant2 = getSignificantWords(topic2);
      const combined = [...new Set([...significant1, ...significant2])];
      return combined.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    
    for (const topic of topics) {
      const topicLower = topic.toLowerCase();
      const words = topicLower.split(/[\s\-]+/);
      const significantWords = getSignificantWords(topic);
      
      // Check for overlap with existing topics
      let isDuplicate = false;
      let replaceIndex = -1;
      let mergedTopic = null;
      
      for (let i = 0; i < deduplicatedTopics.length; i++) {
        const existingTopic = deduplicatedTopics[i];
        const existingLower = existingTopic.toLowerCase();
        const existingWords = existingLower.split(/[\s\-]+/);
        const existingSignificantWords = getSignificantWords(existingTopic);
        
        // Check if one topic is fully contained in another
        if (topicLower.length >= 3 && existingLower.length >= 3) {
          if (topicLower.includes(existingLower) || existingLower.includes(topicLower)) {
            // Keep the longer, more specific one
            if (topic.length > existingTopic.length) {
              replaceIndex = i;
              mergedTopic = topic;
            } else {
              mergedTopic = existingTopic;
            }
            isDuplicate = true;
            break;
          }
        }
        
        // Check for sequential overlap (e.g., "Modi Declares" + "Declares Victory")
        const topicWords = topicLower.split(/\s+/);
        const existingTopicWords = existingLower.split(/\s+/);
        for (let j = 1; j < Math.min(topicWords.length, existingTopicWords.length); j++) {
          const endOfTopic = topicWords.slice(-j).join(' ');
          const startOfExisting = existingTopicWords.slice(0, j).join(' ');
          if (endOfTopic === startOfExisting && endOfTopic.length > 3) {
            // Sequential overlap detected - merge them
            mergedTopic = mergeTopics(topic, existingTopic);
            replaceIndex = i;
            isDuplicate = true;
            break;
          }
        }
        if (isDuplicate) break;
        
        // Check if topics share significant keywords (1+ significant word overlap)
        const sharedSignificant = significantWords.filter(w => existingSignificantWords.includes(w));
        if (sharedSignificant.length >= 1 && sharedSignificant.some(w => w.length > 3)) {
          // They share at least one significant word - merge if they're clearly related
          // Check if they share a key entity (person, place, or event)
          const keyEntities = ['modi', 'india', 'election', 'bjp', 'party', 'victory', 'declares'];
          const hasKeyEntity = keyEntities.some(entity => 
            topicLower.includes(entity) && existingLower.includes(entity)
          );
          
          if (hasKeyEntity || sharedSignificant.length >= 2) {
            // Merge them into a more comprehensive topic
            mergedTopic = mergeTopics(topic, existingTopic);
            replaceIndex = i;
            isDuplicate = true;
            break;
          }
        }
        
        // Check if topics share 2+ words (original logic for strong overlap)
        const commonWordsList = words.filter(w => {
          return existingWords.includes(w) && 
                 w.length > 3 && 
                 !commonWords.includes(w);
        });
        
        if (commonWordsList.length >= 2) {
          // They overlap significantly - keep the more comprehensive one
          mergedTopic = mergeTopics(topic, existingTopic);
          replaceIndex = i;
          isDuplicate = true;
          break;
        }
        
        // Special case: check for similar conflicts/wars
        const conflictKeywords = ['conflict', 'war', 'crisis', 'tension', 'fighting'];
        const hasConflictKeyword = conflictKeywords.some(kw => topicLower.includes(kw));
        const existingHasConflictKeyword = conflictKeywords.some(kw => existingLower.includes(kw));
        
        if (hasConflictKeyword && existingHasConflictKeyword) {
          // Check if they share a location or main subject
          const locationWords = words.filter(w => w.length > 4 && !conflictKeywords.includes(w));
          const existingLocationWords = existingWords.filter(w => w.length > 4 && !conflictKeywords.includes(w));
          const sharedLocations = locationWords.filter(w => existingLocationWords.includes(w));
          
          if (sharedLocations.length >= 1) {
            // They're about the same conflict - merge them
            mergedTopic = mergeTopics(topic, existingTopic);
            replaceIndex = i;
            isDuplicate = true;
            break;
          }
        }
      }
      
      if (isDuplicate && replaceIndex >= 0) {
        // Replace the existing topic with the merged one
        deduplicatedTopics[replaceIndex] = mergedTopic || topic;
      } else if (!isDuplicate) {
        deduplicatedTopics.push(topic);
      }
    }
    
    topics = deduplicatedTopics.slice(0, 8); // Limit to 8 topics
    
    console.log(`[TRENDING] ChatGPT extracted ${topics.length} topics: ${topics.join(', ')}`);
    
    // Map topics to their source articles
    const topicsWithSources = {};
    topics.slice(0, 8).forEach(topic => {
      // Find articles that are most relevant to this topic
      const relevantArticles = articles.filter(article => {
        const title = (article.title || '').toLowerCase();
        const description = (article.description || '').toLowerCase();
        const topicLower = topic.toLowerCase();
        
        // Check if topic appears in title or description
        return title.includes(topicLower) || description.includes(topicLower) ||
               // Or check for related keywords
               topicLower.includes('election') && (title.includes('vote') || title.includes('candidate')) ||
               topicLower.includes('economy') && (title.includes('market') || title.includes('economic')) ||
               topicLower.includes('tech') && (title.includes('technology') || title.includes('ai') || title.includes('software'));
      });
      
      // If no direct matches, use the most recent articles
      if (relevantArticles.length === 0) {
        topicsWithSources[topic] = articles.slice(0, 3);
      } else {
        topicsWithSources[topic] = relevantArticles.slice(0, 3);
      }
    });
    
    return { topics: topics.slice(0, 8), topicsWithSources };
    
  } catch (error) {
    console.error('[TRENDING] Error in ChatGPT analysis:', error);
    return [];
  }
}*/

// COMMENTED OUT: Auto-generated trending topics disabled - only manual topics allowed
/*async function updateTrendingTopics() {
  try {
    console.log('[TRENDING] Updating trending topics...');
    
    const MEDIASTACK_KEY = process.env.MEDIASTACK_KEY;
    if (!MEDIASTACK_KEY) {
      console.log('[TRENDING] Mediastack API key not configured, skipping update');
      return;
    }
    
    // Check for global excluded news sources first (admin override)
    let excludedSources = [];
    const globalSettings = await GlobalSettings.getOrCreate();
    
    if (globalSettings.excludedNewsSourcesEnabled && globalSettings.excludedNewsSources && globalSettings.excludedNewsSources.length > 0) {
      // Get excluded sources, then filter them out from default list
      excludedSources = globalSettings.excludedNewsSources;
      console.log(`[TRENDING] Excluding ${excludedSources.length} global news sources:`, excludedSources);
    }
    
    // Default high-quality U.S.-based news sources
    let newsSources = [
        'cnn', 'nbc-news', 'associated-press', 'bloomberg', 
        'the-new-york-times', 'usa-today', 'npr', 'abc-news', 
        'cbs-news', 'washington-post'
      ];
      console.log('[TRENDING] Using default news sources (no global sources configured)');
    }
    
    console.log('[TRENDING] Fetching top articles from news sources...');
    
    // Fetch top articles from each source (increase limit to get more comprehensive coverage)
    const allArticles = [];
    for (const source of newsSources) {
      try {
        // Fetch 5 articles per source for better topic coverage
        const url = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&sources=${source}&languages=en&limit=5&sort=published_desc`;
        const response = await fetch(url);
        
        if (response.ok) {
          const data = await response.json();
          if (data.data && Array.isArray(data.data)) {
            allArticles.push(...data.data);
            console.log(`[TRENDING] Fetched ${data.data.length} articles from ${source}`);
          }
        } else {
          console.log(`[TRENDING] Failed to fetch from ${source}: ${response.status}`);
        }
      } catch (error) {
        console.log(`[TRENDING] Error fetching from ${source}: ${error.message}`);
      }
    }
    
    if (allArticles.length === 0) {
      console.log('[TRENDING] No articles fetched, using fallback approach');
      await updateTrendingTopicsFallback();
      return;
    }
    
    console.log(`[TRENDING] Total articles collected: ${allArticles.length} from ${newsSources.length} sources`);
    
    // First, extract trending topics directly from headlines of these high-quality sources
    // This ensures we're getting topics that are actually trending across multiple trusted sources
    const headlineTopics = extractBreakingNewsTopics(allArticles);
    console.log(`[TRENDING] Extracted ${headlineTopics.length} topics from headlines: ${headlineTopics.join(', ')}`);
    
    // Use ChatGPT to refine, deduplicate, and improve topics from these sources
    // Pass both the articles and the initial topics to help ChatGPT understand what's trending
    const result = await extractTrendingTopicsWithChatGPT(allArticles, headlineTopics);
    
    if (result && result.topics && result.topics.length > 0) {
      trendingTopicsCache = result.topics;
      trendingTopicsWithSources = result.topicsWithSources;
      lastTrendingUpdate = new Date();
      console.log(`[TRENDING] Updated trending topics from ${newsSources.length} sources via ChatGPT analysis: ${result.topics.join(', ')}`);
      // Save to MongoDB (with file backup)
      await saveTrendingTopics();
    } else {
      // Fallback: use the headline-extracted topics if ChatGPT fails
      if (headlineTopics.length >= 3) {
        trendingTopicsCache = headlineTopics.slice(0, 8);
        trendingTopicsWithSources = {};
        lastTrendingUpdate = new Date();
        console.log(`[TRENDING] Using headline-extracted topics as fallback: ${trendingTopicsCache.join(', ')}`);
        await saveTrendingTopics();
      } else {
        console.log('[TRENDING] Not enough topics from headlines, using full fallback approach');
        await updateTrendingTopicsFallback();
      }
    }
    
  } catch (error) {
    console.error('[TRENDING] Error updating trending topics:', error);
    await updateTrendingTopicsFallback();
  }
}*/

// Fallback method using the old approach
// COMMENTED OUT: Auto-generated trending topics disabled - only manual topics allowed
/*async function updateTrendingTopicsFallback() {
  try {
    const categories = ['general', 'business', 'technology', 'sports', 'entertainment', 'health', 'science'];
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    
    const url = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&languages=en&limit=30&sort=published_desc&categories=${randomCategory}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Mediastack API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('Invalid response from Mediastack API');
    }
    
    const trendingTopics = extractBreakingNewsTopics(data.data);
    trendingTopicsCache = trendingTopics;
    // Clear topicsWithSources since fallback method doesn't provide sources
    trendingTopicsWithSources = {};
    lastTrendingUpdate = new Date();
    
    console.log(`[TRENDING] Updated trending topics via fallback (${randomCategory}): ${trendingTopics.join(', ')}`);
    // Save to MongoDB (with file backup)
    await saveTrendingTopics();
  } catch (error) {
    console.error('[TRENDING] Fallback method failed:', error);
  }
}*/

// --- Daily Trending Topics Update Scheduler ---
// COMMENTED OUT: Auto-generated trending topics disabled - only manual topics allowed
// Update trending topics every morning at 5 AM PST
/*let trendingTopicsUpdateTimeout = null;
let trendingTopicsUpdateRunning = false;

// Function to update trending topics (wrapper to prevent concurrent runs)
async function runTrendingTopicsUpdate() {
  if (trendingTopicsUpdateRunning) {
    console.log('[TRENDING] Update already running, skipping concurrent execution');
    return;
  }
  
  trendingTopicsUpdateRunning = true;
  
  try {
    console.log('[TRENDING] Starting scheduled daily update at 5 AM PST...');
    await updateTrendingTopics();
    console.log('[TRENDING] Daily update completed successfully');
  } catch (error) {
    console.error('[TRENDING] Error in scheduled daily update:', error);
  } finally {
    trendingTopicsUpdateRunning = false;
  }
}

// Function to schedule the next 5 AM PST update
function scheduleTrendingTopicsUpdate() {
  // Clear any existing timeout
  if (trendingTopicsUpdateTimeout) {
    clearTimeout(trendingTopicsUpdateTimeout);
    trendingTopicsUpdateTimeout = null;
  }
  
  const now = new Date();
  
  // Get current time in PST/PDT (America/Los_Angeles handles DST automatically)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const pstTimeParts = formatter.formatToParts(now);
  const pstHour = parseInt(pstTimeParts.find(p => p.type === 'hour').value);
  const pstMinute = parseInt(pstTimeParts.find(p => p.type === 'minute').value);
  const pstSecond = parseInt(pstTimeParts.find(p => p.type === 'second').value);
  
  // Calculate milliseconds until next 5 AM PST
  let msUntilNextUpdate;
  
  // If we're in the 5 AM window (4:55 - 5:05), check every minute
  if ((pstHour === 4 && pstMinute >= 55) || (pstHour === 5 && pstMinute <= 5)) {
    // Check every minute during the update window
    msUntilNextUpdate = 60 * 1000; // 1 minute
  } else {
    // Calculate time until next 5 AM PST
    let hoursUntil5AM = 0;
    let minutesUntil5AM = 0;
    
    if (pstHour < 5) {
      // 5 AM is later today
      hoursUntil5AM = 5 - pstHour;
      minutesUntil5AM = -pstMinute;
    } else {
      // 5 AM is tomorrow
      hoursUntil5AM = 24 - pstHour + 5;
      minutesUntil5AM = -pstMinute;
    }
    
    // Calculate total milliseconds
    const totalMinutes = hoursUntil5AM * 60 + minutesUntil5AM;
    const totalSeconds = totalMinutes * 60 - pstSecond;
    msUntilNextUpdate = totalSeconds * 1000 - now.getMilliseconds();
    
    // If calculation resulted in negative or very small value, schedule for next day
    if (msUntilNextUpdate < 60000) {
      // Schedule for next day at 5 AM
      hoursUntil5AM = 24 - pstHour + 5;
      minutesUntil5AM = -pstMinute;
      const nextDayMinutes = hoursUntil5AM * 60 + minutesUntil5AM;
      const nextDaySeconds = nextDayMinutes * 60 - pstSecond;
      msUntilNextUpdate = nextDaySeconds * 1000 - now.getMilliseconds();
    }
    
    // Cap at 24 hours to avoid very long timeouts
    if (msUntilNextUpdate > 24 * 60 * 60 * 1000) {
      msUntilNextUpdate = 24 * 60 * 60 * 1000;
    }
  }
  
  const hoursUntil = Math.floor(msUntilNextUpdate / (60 * 60 * 1000));
  const minutesUntil = Math.floor((msUntilNextUpdate % (60 * 60 * 1000)) / (60 * 1000));
  
  console.log(`[TRENDING] Next daily update scheduled in ${hoursUntil}h ${minutesUntil}m (at 5:00 AM PST)`);
  
  trendingTopicsUpdateTimeout = setTimeout(() => {
    trendingTopicsUpdateTimeout = null;
    runTrendingTopicsUpdate().then(() => {
      // Schedule the next update
      scheduleTrendingTopicsUpdate();
    }).catch((error) => {
      console.error('[TRENDING] Error in scheduled update, will retry:', error);
      // Still schedule next update even on error
      scheduleTrendingTopicsUpdate();
    });
  }, msUntilNextUpdate);
}*/

// Start the daily trending topics update scheduler
// COMMENTED OUT: Auto-generated trending topics disabled - only manual topics allowed
// console.log(`[TRENDING] Daily trending topics update scheduler ENABLED - will update every morning at 5:00 AM PST`);
// scheduleTrendingTopicsUpdate();
console.log(`[TRENDING] Daily trending topics update scheduler DISABLED - only manual topics allowed`);

// --- Deployment Protection ---
const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'development';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Helper to conditionally log based on environment
const log = IS_PRODUCTION ? (...args) => {
  // In production, only log errors and critical info
  if (args[0] && typeof args[0] === 'string' && (args[0].includes('[ERROR]') || args[0].includes('[SCHEDULER]'))) {
    console.log(...args);
  }
} : console.log;

// Add deployment protection warnings
if (IS_PRODUCTION) {
  console.log('🚨 PRODUCTION MODE DETECTED 🚨');
  console.log('This server is running in PRODUCTION mode.');
  console.log('Make sure you have tested all changes in development first!');
  console.log('Deployment mode:', DEPLOYMENT_MODE);
  console.log('Environment:', process.env.NODE_ENV);
  
  // Add a startup delay in production to allow for emergency stops
  if (DEPLOYMENT_MODE === 'production') {
    console.log('⏳ Starting production server in 3 seconds...');
    setTimeout(() => {
      startServer();
    }, 3000);
  } else {
    startServer();
  }
} else {
  console.log('🔧 DEVELOPMENT MODE');
  console.log('Safe to test changes here.');
  startServer();
}

function startServer() {
  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Backend server running on port ${PORT}`);
    
    // Fetch and print all US sources on startup
    setTimeout(async () => {
      await fetchAllUSSources();
    }, 2000); // Wait 2 seconds for server to fully start
    const now = new Date();
    if (SCHEDULER_ENABLED) {
      const firstCheckIn = new Date(now.getTime() + (10 * 60 * 1000));
      console.log(`[SCHEDULER] Scheduled summary checker enabled - checking every 10 minutes`);
      console.log(`[SCHEDULER] Running initial check now, then every 10 minutes thereafter`);
    } else {
      console.log(`[SCHEDULER] ⚠️  Scheduled summary checker DISABLED - no automatic fetching`);
    }
    if (!process.env.JWT_SECRET) {
      console.warn(
        "[WARN] JWT_SECRET is not set. Using an insecure fallback for development."
      );
    }
    if (FRONTEND_ORIGIN) {
      console.log(`CORS allowed origin: ${FRONTEND_ORIGIN}`);
    }
    
    // Add environment-specific warnings
    if (IS_PRODUCTION) {
      console.log('⚠️  PRODUCTION SERVER IS NOW LIVE ⚠️');
      console.log('All changes will affect live users immediately!');
    }
  });
}

// Export functions for use by other modules (like scheduled summaries)
module.exports = {
  fetchArticlesForTopic,
  summarizeArticles,
  addIntroAndOutro,
  combineTopicSummaries,
  filterRelevantArticles,
  isUpliftingNews,
  normalizeSourceName,
  isSourceAllowedForUS,
  getUSMediastackSources
};

