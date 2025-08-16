require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(cookieParser());

// --- In-memory data store fallback (replace with SQLite later) ---
let users = []; // [{ email, passwordHash, topics: [], location: "" }]

// --- Load from disk so it survives restarts ---
const USERS_FILE = path.join(__dirname, "users.json");
if (fs.existsSync(USERS_FILE)) {
  users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}
function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// --- CORS setup ---
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  FRONTEND_ORIGIN,
].filter(Boolean));

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"), false);
  },
  credentials: true,
}));

// --- JWT helper ---
function createToken(user) {
  return jwt.sign({ email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
}
function authMiddleware(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = users.find(u => u.email === decoded.email);
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

// --- Routes ---

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Signup
app.post("/api/auth/signup", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  if (users.find(u => u.email === email)) {
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
  res.json({ message: "Signup successful", user: { email, topics: [], location: "" } });
});

// Login
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
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
  res.json({ message: "Login successful", user: { email, topics: user.topics, location: user.location } });
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
  res.json({ email: req.user.email, topics: req.user.topics, location: req.user.location });
});

// Add custom topic
app.post("/api/topics", authMiddleware, (req, res) => {
  const { topic } = req.body;
  if (!topic) return res.status(400).json({ error: "Topic required" });
  if (!req.user.topics.includes(topic)) {
    req.user.topics.push(topic);
    saveUsers();
  }
  res.json({ topics: req.user.topics });
});

// Remove custom topic
app.delete("/api/topics", authMiddleware, (req, res) => {
  const { topic } = req.body;
  req.user.topics = req.user.topics.filter(t => t !== topic);
  saveUsers();
  res.json({ topics: req.user.topics });
});

// Update location
app.post("/api/location", authMiddleware, (req, res) => {
  const { location } = req.body;
  req.user.location = location;
  saveUsers();
  res.json({ location });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
