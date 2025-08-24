// app.js (backend server)

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// --- Config & helpers ---
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret"; // fallback to avoid "secretOrPrivateKey must have a value"

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

// --- Summarization routes (stub implementations) ---
// These stubs return predictable shapes so your frontend stops 404-ing.
// Replace with real logic (e.g., NewsAPI + LLM) when ready.

// Single summarize: expects { topics: string[], wordCount?: number, location?: string }
app.post("/api/summarize", async (req, res) => {
  try {
    const { topics = [], wordCount = 200, location = "" } = req.body || {};
    if (!Array.isArray(topics)) {
      return res.status(400).json({ error: "topics must be an array" });
    }

    // Build fake summaries so the UI has something to render
    const items = topics.map((topic) => ({
      topic,
      summary: `(${wordCount}w) Quick summary for "${topic}"${
        location ? ` near ${location}` : ""
      }. Replace this stub with real summarization.`,
      articles: [], // populate with real article data later
    }));

    const combinedText = items
      .map((i) => `${i.topic}: ${i.summary}`)
      .join("\n\n");

    // Keep the payload keys stable for your App.js
    return res.json({
      items,
      combined: {
        text: combinedText,
        audioUrl: null, // set when TTS is wired up
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

        const items = topics.map((topic) => ({
          topic,
          summary: `(${wordCount}w) Quick summary for "${topic}"${
            location ? ` near ${location}` : ""
          }. Replace this stub with real summarization.`,
          articles: [],
        }));

        const combinedText = items
          .map((i) => `${i.topic}: ${i.summary}`)
          .join("\n\n");

        return {
          items,
          combined: {
            text: combinedText,
            audioUrl: null,
          },
        };
      })
    );

    // Some frontends expect { results: [...] }, others just the array.
    res.json({ results, batches: results });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "batch summarize failed" });
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
