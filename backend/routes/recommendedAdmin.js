const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Persistent file for admin-set recommended topics override
const OVERRIDE_FILE = path.join(__dirname, '../server_data/recommended_override.json');

function readOverride() {
  try {
    if (!fs.existsSync(OVERRIDE_FILE)) return null;
    const raw = fs.readFileSync(OVERRIDE_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.topics)) return null;
    return data;
  } catch {
    return null;
  }
}

function writeOverride(payload) {
  try {
    const dir = path.dirname(OVERRIDE_FILE);
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    }
    fs.writeFileSync(OVERRIDE_FILE, JSON.stringify(payload, null, 2));
    return true;
  } catch {
    return false;
  }
}

// Get current override (if any)
router.get('/', authenticateToken, async (req, res) => {
  const override = readOverride();
  res.json({ override: override || null });
});

// Set/replace override
router.put('/', authenticateToken, async (req, res) => {
  try {
    const { topics } = req.body || {};
    if (!Array.isArray(topics)) {
      return res.status(400).json({ error: 'topics must be an array of strings' });
    }
    const cleaned = topics
      .map(t => (typeof t === 'string' ? t.trim() : ''))
      .filter(t => t.length > 0)
      .slice(0, 8);
    if (cleaned.length === 0) {
      return res.status(400).json({ error: 'At least one topic is required' });
    }
    // Basic length validation
    for (const t of cleaned) {
      if (t.length > 50) {
        return res.status(400).json({ error: 'Each topic must be 50 characters or less' });
      }
    }
    const payload = {
      topics: cleaned,
      setBy: req.user?.email || 'admin',
      lastUpdated: new Date().toISOString(),
    };
    const ok = writeOverride(payload);
    if (!ok) return res.status(500).json({ error: 'Failed to persist override' });
    res.json({ message: 'Recommended topics override saved', override: payload });
  } catch (e) {
    res.status(500).json({ error: 'Failed to set override' });
  }
});

// Clear override
router.delete('/', authenticateToken, async (req, res) => {
  try {
    if (fs.existsSync(OVERRIDE_FILE)) {
      try { fs.unlinkSync(OVERRIDE_FILE); } catch {}
    }
    res.json({ message: 'Recommended topics override cleared' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to clear override' });
  }
});

module.exports = router;



