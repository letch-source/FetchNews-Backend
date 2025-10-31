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
const trendingAdminRoutes = require("./routes/trendingAdmin");
const recommendedAdminRoutes = require("./routes/recommendedAdmin");
const fallbackAuth = require("./utils/fallbackAuth");
const User = require("./models/User");

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

// Helper function to determine time-based fetch name
// Returns "Morning Fetch", "Afternoon Fetch", or "Evening Fetch" based on provided time
// If no timestamp is provided, uses current time
function getTimeBasedFetchName(timestamp = null) {
  const date = timestamp ? new Date(timestamp) : new Date();
  const hour = date.getHours();
  
  // Morning: 5:00 AM - 11:59 AM (5-11)
  if (hour >= 5 && hour < 12) {
    return "Morning Fetch";
  }
  // Afternoon: 12:00 PM - 4:59 PM (12-16)
  else if (hour >= 12 && hour < 17) {
    return "Afternoon Fetch";
  }
  // Evening: 5:00 PM - 4:59 AM (17-23 or 0-4)
  else {
    return "Evening Fetch";
  }
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

// Admin recommended topics management
app.use("/api/admin/recommended-topics", recommendedAdminRoutes);

// Preferences routes
app.use("/api/preferences", preferencesRoutes);

// News sources routes
app.use("/api/news-sources", newsSourcesRoutes);

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
  const sortedTopics = Object.entries(topicCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 6)
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
    // Only use admin override - no auto-generated topics
    const overridePath = path.join(__dirname, "./server_data/trending_override.json");
    let overrideData = null;
    
    try {
      // Ensure directory exists
      const serverDataDir = path.dirname(overridePath);
      if (!fs.existsSync(serverDataDir)) {
        fs.mkdirSync(serverDataDir, { recursive: true });
      }
      
      if (fs.existsSync(overridePath)) {
        const raw = fs.readFileSync(overridePath, 'utf8');
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.topics) && data.topics.length > 0) {
          overrideData = data;
          console.log(`[TRENDING] Loaded ${data.topics.length} trending topics from admin override`);
        }
      } else {
        console.log('[TRENDING] No admin override file found - trending topics will be empty until admin sets them');
      }
    } catch (error) {
      console.error('[TRENDING] Error reading override file:', error);
    }

    if (overrideData) {
      return res.json({
        trendingTopics: overrideData.topics,
        lastUpdated: overrideData.lastUpdated || null,
        source: "override",
        setBy: overrideData.setBy || null
      });
    }

    // No override set - return empty array
    res.json({
      trendingTopics: [],
      lastUpdated: null,
      source: "none"
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
app.post("/api/trending-topics/update", async (req, res) => {
  try {
    console.log('[TRENDING] Manual update triggered');
    await updateTrendingTopics();
    res.json({ 
      message: 'Trending topics updated successfully',
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

// Recommended topics endpoint
app.get("/api/recommended-topics", async (req, res) => {
  try {
    // Prefer admin override if present
    const overridePath = path.join(__dirname, "./server_data/recommended_override.json");
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
        recommendedTopics: overrideData.topics,
        lastUpdated: overrideData.lastUpdated || null,
        source: "override",
        setBy: overrideData.setBy || null
      });
    }

    // Default recommended topics (fallback)
    const defaultTopics = ["Business", "Entertainment", "Health", "Science"];
    res.json({
      recommendedTopics: defaultTopics,
      lastUpdated: null,
      source: "default"
    });
  } catch (error) {
    console.error('Get recommended topics error:', error);
    res.status(500).json({ 
      error: 'Failed to get recommended topics',
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

async function fetchArticlesEverything(qParts, maxResults, selectedSources = []) {
  const q = encodeURIComponent(qParts.filter(Boolean).join(" "));
  const pageSize = Math.min(Math.max(Number(maxResults) || 5, 1), 50);
  // Restrict to 48 hours (2 days) to ensure recent articles only
  const maxAgeMs = 48 * 60 * 60 * 1000;
  const from = new Date(Date.now() - maxAgeMs).toISOString().slice(0, 10);
  
  // Try multiple search strategies for better coverage - ALL with date restrictions
  const searchStrategies = [
    // Strategy 1: Exact phrase search
    `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&keywords="${q}"&languages=en&sort=published_desc&limit=${pageSize}&date=${from}`,
    // Strategy 2: Individual keywords
    `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&keywords=${q}&languages=en&sort=published_desc&limit=${pageSize}&date=${from}`,
    // Strategy 3: Broader search with date restriction (removed unrestricted fallback)
    `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&keywords=${q}&languages=en&sort=published_desc&limit=${pageSize}&date=${from}`
  ];
  
  let articles = [];
  let lastError = null;
  
  for (const url of searchStrategies) {
    try {
      console.log(`[SEARCH] Trying strategy: ${url}`);
      const resp = await fetch(url);
      
      if (resp.ok) {
        const data = await resp.json();
        if (data.data && data.data.length > 0) {
          articles = data.data;
          console.log(`[SEARCH] Found ${articles.length} articles with current strategy`);
          break;
        }
      } else {
        lastError = `Mediastack error: ${resp.status}`;
      }
    } catch (error) {
      lastError = error.message;
      console.log(`[SEARCH] Strategy failed: ${error.message}`);
    }
  }
  
  if (articles.length === 0) {
    throw new Error(lastError || 'No recent articles found with any search strategy');
  }
  
  // Map Mediastack response to match expected format and filter by date
  const now = Date.now();
  const mappedArticles = articles
    .map(article => {
      const publishedAt = article.published_at ? new Date(article.published_at).getTime() : null;
      // Filter out articles older than 48 hours
      if (publishedAt && (now - publishedAt) > maxAgeMs) {
        return null;
      }
      // Also filter out articles without valid published date if it's clearly old
      return {
        title: article.title,
        description: article.description,
        url: article.url,
        publishedAt: article.published_at,
        source: { id: article.source, name: article.source }
      };
    })
    .filter(article => article !== null); // Remove filtered articles
  
  if (mappedArticles.length === 0) {
    throw new Error('No recent articles found after date filtering');
  }
  
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
  // Final attempt: trying with maximum 24-hour window (instead of no filter)
  console.log(`Final attempt: trying with 24-hour window for maximum coverage`);
  const articles = [];
  const usedSources = new Set();
  const maxFinalWindow = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  
  for (const source of selectedSources) {
    if (usedSources.size >= targetVariety) break;
    
    try {
      const url = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&sources=${source}&date=${maxFinalWindow}&sort=published_desc&limit=1&languages=en`;
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
          console.log(`Got article from ${source} (24h window)`);
        }
      }
    } catch (error) {
      console.log(`Failed to get article from ${source} (24h window): ${error.message}`);
    }
  }
  
  console.log(`Final variety achieved: ${usedSources.size} different sources`);
  return articles;
}

async function fetchTopHeadlinesByCategory(category, countryCode, maxResults, extraQuery, selectedSources = []) {
  const pageSize = Math.min(Math.max(Number(maxResults) || 5, 1), 50);
  const params = new URLSearchParams();
  
  // Restrict to 48 hours to ensure recent articles only
  const maxAgeMs = 48 * 60 * 60 * 1000;
  const from = new Date(Date.now() - maxAgeMs).toISOString().slice(0, 10);
  
  // Mediastack parameter mapping
  if (selectedSources && selectedSources.length > 0) {
    console.log(`Filtering by sources: ${selectedSources.join(",")}`);
    params.set("sources", selectedSources.join(","));
  } else {
    console.log(`No source filtering applied (using all sources)`);
    if (category) params.set("categories", category);
    if (countryCode) params.set("countries", String(countryCode).toLowerCase());
  }
  
  if (extraQuery) params.set("keywords", extraQuery);
  params.set("limit", String(pageSize));
  params.set("languages", "en");
  params.set("date", from); // Add date restriction
  params.set("sort", "published_desc"); // Sort by most recent first
  const url = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&${params.toString()}`;
  console.log(`[DEBUG] Final Mediastack URL: ${url}`);
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.log(`[DEBUG] Mediastack error response: ${resp.status} ${text}`);
    throw new Error(`Mediastack error: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  console.log(`[DEBUG] Mediastack category response:`, JSON.stringify(data, null, 2));
  console.log(`Mediastack returned ${data.data?.length || 0} articles`);
  
  // Map Mediastack response to match expected format and filter by date
  const now = Date.now();
  const articles = (data.data || [])
    .map(article => {
      const publishedAt = article.published_at ? new Date(article.published_at).getTime() : null;
      // Filter out articles older than 48 hours
      if (publishedAt && (now - publishedAt) > maxAgeMs) {
        return null;
      }
      return {
        title: article.title,
        description: article.description,
        url: article.url,
        publishedAt: article.published_at,
        source: { id: article.source, name: article.source }
      };
    })
    .filter(article => article !== null); // Remove filtered articles
  
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
      const countryCode = geo?.country || geo?.countryCode || "";
      const region = geo?.region || geo?.state || "";
      const city = geo?.city || "";
      if (region) queryParts.push(region);
      if (city) queryParts.push(city);
      
      try {
        // Use the existing logic to fetch additional articles
        const additionalResult = await fetchArticlesEverything(queryParts, additionalNeeded, selectedSources);
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
  const countryCode = geo?.country || geo?.countryCode || "";
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
  // For general news, use a simple approach with date filtering to ensure recent articles
  try {
    // Restrict to 48 hours to ensure recent articles only
    const maxAgeMs = 48 * 60 * 60 * 1000;
    const from = new Date(Date.now() - maxAgeMs).toISOString().slice(0, 10);
    const url = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&languages=en&limit=${pageSize}&date=${from}&sort=published_desc`;
    const resp = await fetch(url);
    
    if (!resp.ok) {
      throw new Error(`Mediastack error: ${resp.status}`);
    }
    
    const data = await resp.json();
    
    // Map Mediastack response to expected format
    articles = (data.data || []).map(article => ({
      title: article.title,
      description: article.description,
      url: article.url,
      publishedAt: article.published_at,
      source: { id: article.source, name: article.source }
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
        fetchArticlesEverything([`title:${city}`], Math.ceil(pageSize/3)),
        fetchArticlesEverything([city], Math.ceil(pageSize/3))
      );
    }
    
    if (region) {
      promises.push(
        fetchTopHeadlinesByCategory("general", countryCode, Math.ceil(pageSize/3), `"${region}"`, selectedSources),
        fetchArticlesEverything([`title:${region}`], Math.ceil(pageSize/3)),
        fetchArticlesEverything([region], Math.ceil(pageSize/3))
      );
    }
    
    if (countryCode) {
      promises.push(
        fetchTopHeadlinesByCategory("general", countryCode, Math.ceil(pageSize/2), undefined, selectedSources)
      );
    }
    
    // Fallback to general news
    promises.push(
      fetchTopHeadlinesByCategory("general", "", Math.ceil(pageSize/2), undefined, selectedSources)
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
      const extra = await fetchArticlesEverything([normalizedTopic, bias], pageSize - (articles?.length || 0), selectedSources);
      articles = [...articles, ...extra];
    }
  } else {
    articles = await fetchArticlesEverything(queryParts, pageSize, selectedSources);
  }

  // Final date filter: ensure all articles are within 48 hours
  const maxAgeMs = 48 * 60 * 60 * 1000;
  const now = Date.now();
  
  const normalized = articles
    .map((a) => {
      // Check if article is too old
      if (a.publishedAt) {
        const publishedAt = new Date(a.publishedAt).getTime();
        if (isNaN(publishedAt) || (now - publishedAt) > maxAgeMs) {
          return null; // Filter out old articles
        }
      }
      return {
        title: a.title || "",
        description: a.description || "",
        url: a.url || "",
        source: (a.source && a.source.name) || "",
        publishedAt: a.publishedAt || "",
        urlToImage: a.urlToImage || "",
      };
    })
    .filter(article => article !== null); // Remove filtered articles

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
    
    const prompt = `Create a ${upliftingPrefix}${topicsText} news summary in podcast style.

Articles:
${articleTexts}

Requirements:
- Cover key stories in conversational tone
- Connect related stories naturally
- Focus on most significant developments
- Target ${wordCount} words exactly
- For short summaries (≤200 words), be very concise and stick to the word limit
- End at a complete sentence, but prioritize staying within the word count`;

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
  
  // Format topics for the intro - use "and" before the last topic if multiple
  let topicsText;
  if (Array.isArray(topics) && topics.length > 0) {
    if (topics.length === 1) {
      topicsText = topics[0];
    } else if (topics.length === 2) {
      topicsText = `${topics[0]} and ${topics[1]}`;
    } else {
      // More than 2 topics: "Topic1, Topic2, and Topic3"
      const lastTopic = topics[topics.length - 1];
      const otherTopics = topics.slice(0, -1).join(", ");
      topicsText = `${otherTopics}, and ${lastTopic}`;
    }
  } else {
    topicsText = String(topics || "");
  }
  const upliftingPrefix = goodNewsOnly ? "uplifting " : "";
  
  // Add intro and outro
  const intro = `${timeGreeting}, here's your ${upliftingPrefix}${topicsText} news update. `;
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
          message: "You've reached your daily limit of 10 summaries. Upgrade to Premium for unlimited access.",
          dailyCount: usageCheck.dailyCount,
          limit: 1
        });
      }
    }
    
    const { topics = [], wordCount = 200, location = "", geo = null, goodNewsOnly = false } = req.body || {};
    if (!Array.isArray(topics)) {
      return res.status(400).json({ error: "topics must be an array" });
    }

    // Get user's selected news sources (if authenticated and premium)
    let selectedSources = [];
    if (req.user && req.user.isPremium) {
      const user = await User.findById(req.user.id);
      if (user) {
        const preferences = user.getPreferences();
        selectedSources = preferences.selectedNewsSources || [];
        
        console.log(`Premium user ${req.user.id} has ${selectedSources.length} sources selected:`, selectedSources);
        
        // If user has made selections but has less than 5 sources, return error
        if (selectedSources.length > 0 && selectedSources.length < 5) {
          return res.status(400).json({
            error: "Insufficient news sources",
            message: `Please select at least 5 news sources. You currently have ${selectedSources.length} selected.`,
            selectedCount: selectedSources.length,
            requiredCount: 5
          });
        }
      }
    } else {
      console.log(`Non-premium user, using all sources`);
    }
    
    // If no sources selected (or not premium), use all available sources (empty array means no filtering)

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
        
        const { articles } = await fetchArticlesForTopic(topic, geoData, perTopic, selectedSources);

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

        const summary = await summarizeArticles(topic, geoData, relevant, wordCount, goodNewsOnly, req.user);

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
    
    // Combine all topic summaries
    let combinedText = combinedPieces.join(" ").trim();
    
    // Add intro and outro to the final summary (once per summary, not per topic)
    combinedText = addIntroAndOutro(combinedText, topics, goodNewsOnly, req.user);

    // Increment user usage for successful request (if authenticated)
    if (req.user) {
      if (mongoose.connection.readyState === 1) {
        await req.user.incrementUsage();
      } else {
        await fallbackAuth.incrementUsage(req.user);
      }
    }

    // Generate a better title based on topics
    let title = "Summary";
    if (topics.length === 1) {
      title = `${topics[0].charAt(0).toUpperCase() + topics[0].slice(1)} Summary`;
    } else if (topics.length > 1) {
      title = getTimeBasedFetchName();
    }

    return res.json({
      items,
      combined: {
        id: `combined-${Date.now()}`,
        title: title,
        summary: combinedText,
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
          message: "You've reached your daily limit of 10 summaries. Upgrade to Premium for unlimited access.",
          dailyCount: usageCheck.dailyCount,
          limit: 1
        });
      }
    }
    
    const { batches = [] } = req.body || {};
    if (!Array.isArray(batches)) {
      return res.status(400).json({ error: "batches must be an array" });
    }

    // Get user's selected news sources (if authenticated and premium)
    let selectedSources = [];
    if (req.user && req.user.isPremium) {
      const user = await User.findById(req.user.id);
      if (user) {
        const preferences = user.getPreferences();
        selectedSources = preferences.selectedNewsSources || [];
        
        // If user has made selections but has less than 5 sources, return error
        if (selectedSources.length > 0 && selectedSources.length < 5) {
          return res.status(400).json({
            error: "Insufficient news sources",
            message: `Please select at least 5 news sources. You currently have ${selectedSources.length} selected.`,
            selectedCount: selectedSources.length,
            requiredCount: 5
          });
        }
      }
    }
    
    // If no sources selected (or not premium), use all available sources (empty array means no filtering)

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
            
            const { articles } = await fetchArticlesForTopic(topic, geoData, perTopic, selectedSources);

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

        // Combine all topic summaries
        let combinedText = combinedPieces.join(" ").trim();
        
        // Add intro and outro to the final summary (once per summary, not per topic)
        combinedText = addIntroAndOutro(combinedText, topics, goodNewsOnly, req.user);

        // Generate a better title based on topics
        let title = "Summary";
        if (topics.length === 1) {
          title = `${topics[0].charAt(0).toUpperCase() + topics[0].slice(1)} Summary`;
        } else if (topics.length > 1) {
          title = getTimeBasedFetchName();
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
    const maxLength = 4090; // Use most of the available limit
    const finalText = cleaned.length > maxLength ? cleaned.slice(0, maxLength - 3) + "..." : cleaned;
    
    // Log if text was truncated
    if (cleaned.length > maxLength) {
      console.log(`TTS text truncated from ${cleaned.length} to ${finalText.length} characters`);
    }

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

// --- Scheduled Fetch Checker ---
// Function to check for scheduled summaries
async function checkScheduledSummaries() {
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
    const usersToSave = []; // Batch user saves
    
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
        
        // Check if current time matches the scheduled time (within 1 minute window)
        // Since we check at :00, :10, :20, :30, :40, :50, we should catch scheduled times at those exact minutes
        const timeDifference = Math.abs(userTimeMinutes - scheduledTimeMinutes);
        const shouldExecute = timeDifference <= 1; // Allow 1 minute window for slight delays
        
        // Also check if summary hasn't already run today in user's timezone (prevent duplicate executions)
        const lastRun = summary.lastRun ? new Date(summary.lastRun) : null;
        let alreadyRanToday = false;
        if (lastRun) {
          // Reuse formatter for date comparison (same timezone)
          const dateFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: userTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
          
          const lastRunDateStr = dateFormatter.format(lastRun);
          const nowDateStr = dateFormatter.format(now);
          alreadyRanToday = lastRunDateStr === nowDateStr;
        }
        
        console.log(`[SCHEDULER] Summary "${summary.name}": enabled=${isEnabled}, time=${summary.time} (user time=${userTime}, server time=${currentTime}), user timezone=${userTimezone}, user day=${userDay}, timeDiff=${timeDifference}min, shouldExecute=${shouldExecute && !alreadyRanToday}`);
        
        if (shouldExecute && !alreadyRanToday) {
          console.log(`[SCHEDULER] Executing scheduled fetch "${summary.name}" for user ${user.email} on ${currentDay}`);
          
          try {
            // Import and call the execution function directly
            const { executeScheduledSummary } = require('./routes/scheduledSummaries');
            await executeScheduledSummary(user, summary);
            console.log(`[SCHEDULER] Successfully executed scheduled fetch "${summary.name}" for user ${user.email}`);
            
            // Update lastRun timestamp
            const summaryIndex = scheduledSummaries.findIndex(s => s.id === summary.id);
            if (summaryIndex !== -1) {
              scheduledSummaries[summaryIndex].lastRun = new Date().toISOString();
              user.scheduledSummaries = scheduledSummaries;
              needsSave = true;
              executedCount++;
            }
          } catch (error) {
            console.error(`[SCHEDULER] Failed to execute scheduled fetch "${summary.name}" for user ${user.email}:`, error);
          }
        }
      }
      
      // Batch save user if needed
      if (needsSave) {
        usersToSave.push(user);
      }
    }
    
    // Batch save all modified users
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
  }
}

// Schedule checks every 10 minutes starting at :00
let schedulerTimeout = null;
let isSchedulerRunning = false;
let schedulerStarted = false;

function scheduleNextCheck() {
  // Prevent duplicate scheduler instances
  if (schedulerTimeout) {
    console.log(`[SCHEDULER] Scheduler already scheduled, skipping duplicate call`);
    return;
  }
  
  // Prevent scheduling if a check is currently running
  if (isSchedulerRunning) {
    console.log(`[SCHEDULER] Check already running, will reschedule after completion`);
    return;
  }
  
  const now = new Date();
  const currentMinute = now.getMinutes();
  const currentSecond = now.getSeconds();
  const currentMillisecond = now.getMilliseconds();
  
  // Find next 10-minute mark (:00, :10, :20, :30, :40, :50)
  let nextMinute = Math.ceil((currentMinute + 1) / 10) * 10;
  
  // Wrap around at 60 minutes
  if (nextMinute >= 60) {
    nextMinute = 0;
  }
  
  // Calculate milliseconds until next check
  let msUntilNext;
  if (nextMinute === 0 && currentMinute >= 50) {
    // Next check is :00 of next hour
    const minutesRemaining = 60 - currentMinute;
    const secondsRemaining = minutesRemaining * 60 - currentSecond;
    msUntilNext = (secondsRemaining * 1000) - currentMillisecond;
  } else if (nextMinute > currentMinute) {
    // Next check is in same hour
    const minutesRemaining = nextMinute - currentMinute;
    const secondsRemaining = minutesRemaining * 60 - currentSecond;
    msUntilNext = (secondsRemaining * 1000) - currentMillisecond;
  } else {
    // Shouldn't happen, but fallback: exactly 10 minutes
    msUntilNext = 10 * 60 * 1000;
  }
  
  // Ensure we don't schedule for less than 30 seconds (safety check)
  if (msUntilNext < 30000) {
    msUntilNext = 10 * 60 * 1000;
  }
  
  const nextCheckTime = new Date(now.getTime() + msUntilNext);
  const nextCheckMinute = nextCheckTime.getMinutes();
  
  console.log(`[SCHEDULER] Next check scheduled in ${Math.floor(msUntilNext / 1000 / 60)} minutes ${Math.floor((msUntilNext / 1000) % 60)} seconds (at :${String(nextCheckMinute).padStart(2, '0')}, ${nextCheckTime.toISOString()})`);
  
  schedulerTimeout = setTimeout(() => {
    schedulerTimeout = null; // Clear timeout reference immediately
    isSchedulerRunning = true;
    checkScheduledSummaries().finally(() => {
      isSchedulerRunning = false;
      // Schedule next check - always exactly 10 minutes (600000 ms) after completion
      // This ensures consistent 10-minute intervals and naturally aligns to :00, :10, :20, etc.
      // Only schedule if no other timeout is already set (prevents duplicates)
      if (!schedulerTimeout) {
        schedulerTimeout = setTimeout(() => {
          schedulerTimeout = null; // Clear when it runs
          scheduleNextCheck();
        }, 10 * 60 * 1000); // Exactly 10 minutes
        
        const nextCheckTime = new Date(Date.now() + 10 * 60 * 1000);
        console.log(`[SCHEDULER] Next check will be in 10 minutes (at ${nextCheckTime.toISOString()})`);
      }
    });
  }, msUntilNext);
  
  schedulerStarted = true;
}

// Start the scheduling (only once on server startup)
if (!schedulerStarted) {
  scheduleNextCheck();
}

// --- Trending Topics Updater ---
// Update trending topics every hour
let trendingTopicsCache = [];
let trendingTopicsWithSources = {}; // Store topics with their source articles
let lastTrendingUpdate = null;

// File path for persistent trending topics cache
const TRENDING_CACHE_PATH = path.join(__dirname, './server_data/trending_cache.json');

// Load trending topics from file on startup
function loadTrendingTopicsFromFile() {
  try {
    if (fs.existsSync(TRENDING_CACHE_PATH)) {
      const raw = fs.readFileSync(TRENDING_CACHE_PATH, 'utf8');
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.topics) && data.topics.length > 0) {
        trendingTopicsCache = data.topics;
        trendingTopicsWithSources = data.topicsWithSources || {};
        if (data.lastUpdated) {
          lastTrendingUpdate = new Date(data.lastUpdated);
        }
        console.log(`[TRENDING] Loaded ${trendingTopicsCache.length} trending topics from cache`);
      }
    }
  } catch (error) {
    console.error('[TRENDING] Error loading trending topics cache:', error);
  }
}

// Save trending topics to file
function saveTrendingTopicsToFile() {
  try {
    // Ensure server_data directory exists
    const serverDataDir = path.join(__dirname, './server_data');
    if (!fs.existsSync(serverDataDir)) {
      fs.mkdirSync(serverDataDir, { recursive: true });
    }
    
    const data = {
      topics: trendingTopicsCache,
      topicsWithSources: trendingTopicsWithSources,
      lastUpdated: lastTrendingUpdate ? lastTrendingUpdate.toISOString() : null,
      savedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(TRENDING_CACHE_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log(`[TRENDING] Saved ${trendingTopicsCache.length} trending topics to cache`);
  } catch (error) {
    console.error('[TRENDING] Error saving trending topics cache:', error);
  }
}

// Extract trending topics using ChatGPT analysis of news articles
async function extractTrendingTopicsWithChatGPT(articles) {
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
    
    const prompt = `Analyze the following news articles from major sources and extract the 8 most important trending topics/keywords that would be relevant for a news summary app. Focus on:

1. Major political events, policy changes, or government actions
2. Significant business/economic developments
3. Important technology breakthroughs or tech company news
4. Major sports events or developments
5. Entertainment industry news or celebrity events
6. Health/medical breakthroughs or public health issues
7. International relations or global events
8. Environmental or climate-related news

IMPORTANT: Each topic should be a complete, coherent phrase (1-3 words) that makes sense on its own. Avoid generic terms like "news", "report", "update", "latest", or weather-related terms unless they're truly significant events.

Examples of good topics: "Federal Reserve", "Tesla Stock", "Olympic Games", "Climate Summit"
Examples of bad topics: "Meta", "Fights", "Million", "Penalty" (too fragmented)

Return ONLY a comma-separated list of 8 complete, coherent topics, in order of importance:

Articles:
${articlesText}`;

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
    
    // Parse the comma-separated response
    let topics = content.split(',').map(topic => topic.trim()).filter(topic => topic.length > 0);
    
    // Clean up fragmented topics by filtering out single words that are likely fragments
    const stopWords = ['meta', 'fights', 'million', 'penalty', 'over', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
    topics = topics.filter(topic => {
      const words = topic.toLowerCase().split(' ');
      // Keep topics that have 2+ words, or single words that aren't stop words
      return words.length >= 2 || !stopWords.includes(words[0]);
    });
    
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
}

async function updateTrendingTopics() {
  try {
    console.log('[TRENDING] Updating trending topics...');
    
    const MEDIASTACK_KEY = process.env.MEDIASTACK_KEY;
    if (!MEDIASTACK_KEY) {
      console.log('[TRENDING] Mediastack API key not configured, skipping update');
      return;
    }
    
    // Define high-quality news sources to pull from
    const newsSources = [
      'cnn', 'bbc-news', 'reuters', 'nbc-news', 'associated-press', 
      'bloomberg', 'the-new-york-times', 'usa-today', 'npr'
    ];
    
    console.log('[TRENDING] Fetching top articles from major news sources...');
    
    // Fetch top articles from each source
    const allArticles = [];
    for (const source of newsSources) {
      try {
        const url = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_KEY}&sources=${source}&languages=en&limit=3&sort=published_desc`;
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
    
    console.log(`[TRENDING] Total articles collected: ${allArticles.length}`);
    
    // Use ChatGPT to analyze articles and extract trending topics
    const result = await extractTrendingTopicsWithChatGPT(allArticles);
    
    if (result && result.topics && result.topics.length > 0) {
      trendingTopicsCache = result.topics;
      trendingTopicsWithSources = result.topicsWithSources;
      lastTrendingUpdate = new Date();
      console.log(`[TRENDING] Updated trending topics via ChatGPT analysis: ${result.topics.join(', ')}`);
      // Save to file for persistence
      saveTrendingTopicsToFile();
    } else {
      console.log('[TRENDING] ChatGPT analysis failed, using fallback approach');
      await updateTrendingTopicsFallback();
    }
    
  } catch (error) {
    console.error('[TRENDING] Error updating trending topics:', error);
    await updateTrendingTopicsFallback();
  }
}

// Fallback method using the old approach
async function updateTrendingTopicsFallback() {
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
    lastTrendingUpdate = new Date();
    
    console.log(`[TRENDING] Updated trending topics via fallback (${randomCategory}): ${trendingTopics.join(', ')}`);
    // Save to file for persistence
    saveTrendingTopicsToFile();
  } catch (error) {
    console.error('[TRENDING] Fallback method failed:', error);
  }
}

// AUTO-GENERATED TRENDING TOPICS DISABLED
// Only admin override from analytics page is used
// Auto-generated cache loading disabled - trending topics are managed via admin override only
// loadTrendingTopicsFromFile(); // DISABLED - only use admin override

// AUTO-UPDATE DISABLED: Trending topics will only update manually via /api/trending-topics/update endpoint
// Run immediately on startup
// updateTrendingTopics();

// Then run every 30 minutes for breaking news
// setInterval(updateTrendingTopics, 30 * 60 * 1000); // 30 minutes

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
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend server running on port ${PORT}`);
    const now = new Date();
    const firstCheckIn = new Date(now.getTime() + (10 * 60 * 1000));
    console.log(`[SCHEDULER] Scheduled summary checker enabled - checking every 10 minutes`);
    console.log(`[SCHEDULER] Running initial check now, then every 10 minutes thereafter`);
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
  filterRelevantArticles,
  isUpliftingNews
};

