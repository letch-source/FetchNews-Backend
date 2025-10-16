// backend/server/auth.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db } = require("./db");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_DAYS = 30;

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${JWT_DAYS}d` });
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

function requireAuth(req, res, next) {
  const token = req.cookies?.token || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const decoded = token ? verifyToken(token) : null;
  if (!decoded) return res.status(401).json({ error: "auth_required" });
  req.user = decoded; // { id, email, plan }
  next();
}

function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("token", token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "lax" : "lax",
    maxAge: 1000 * 60 * 60 * 24 * JWT_DAYS,
    path: "/",
  });
}

async function createUser(email, password) {
  const hash = await bcrypt.hash(password, 10);
  const stmt = db.prepare(
    `INSERT INTO users (email, password_hash) VALUES (?, ?)`
  );
  const info = stmt.run(email.toLowerCase(), hash);
  return info.lastInsertRowid;
}

async function authenticate(email, password) {
  const row = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase());
  if (!row) return null;
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
  return { id: row.id, email: row.email, plan: row.plan, subscription_status: row.subscription_status };
}

module.exports = { signToken, verifyToken, requireAuth, setAuthCookie, createUser, authenticate };