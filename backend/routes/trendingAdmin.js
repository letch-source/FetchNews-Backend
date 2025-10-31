const express = require('express');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Persistent file for admin-set trending topics override
const OVERRIDE_FILE = path.join(__dirname, '../server_data/trending_override.json');

function readOverride() {
  try {
    if (!fs.existsSync(OVERRIDE_FILE)) {
      console.log('[TRENDING ADMIN] No override file found');
      return null;
    }
    const raw = fs.readFileSync(OVERRIDE_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.topics)) {
      console.log('[TRENDING ADMIN] Override file exists but invalid format');
      return null;
    }
    console.log(`[TRENDING ADMIN] Loaded ${data.topics.length} trending topics from override file`);
    return data;
  } catch (error) {
    console.error('[TRENDING ADMIN] Error reading override file:', error);
    return null;
  }
}

function writeOverride(payload) {
  try {
    const dir = path.dirname(OVERRIDE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(OVERRIDE_FILE, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`[TRENDING ADMIN] Saved ${payload.topics.length} trending topics to override file`);
    return true;
  } catch (error) {
    console.error('[TRENDING ADMIN] Error writing override file:', error);
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
    res.json({ message: 'Trending topics override saved', override: payload });
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
    res.json({ message: 'Trending topics override cleared' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to clear override' });
  }
});

module.exports = router;


