// backend/server/db.js
const path = require("path");
const Database = require("better-sqlite3");

const DB_FILE = path.join(__dirname, "data.sqlite");
const db = new Database(DB_FILE);

db.pragma("journal_mode = WAL");

// --- schema
// users
// - email unique
// - password_hash
// - plan: 'free' | 'pro'
// - subscription_status: 'inactive' | 'active' | 'past_due' | 'canceled'
// - created_at
// custom_topics
// - per-user list of {key,label}
// presets
// - named combos of topic keys (comma-separated)

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  subscription_status TEXT NOT NULL DEFAULT 'inactive',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS custom_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  topic_key TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, topic_key),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  topic_keys TEXT NOT NULL,
  is_last_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

db.exec(MIGRATIONS);

module.exports = { db };