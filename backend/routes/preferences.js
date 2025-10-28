const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');
const fallbackAuth = require('../utils/fallbackAuth');

const router = express.Router();

// Get user preferences
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    let preferences;
    
    if (mongoose.connection.readyState === 1) {
      preferences = user.getPreferences();
    } else {
      preferences = fallbackAuth.getPreferences(user);
    }
    
    res.json(preferences);
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// Update user preferences
router.put('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const preferences = req.body;
    
    let updatedPreferences;
    if (mongoose.connection.readyState === 1) {
      updatedPreferences = await user.updatePreferences(preferences);
    } else {
      updatedPreferences = await fallbackAuth.updatePreferences(user, preferences);
    }
    
    res.json(updatedPreferences);
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

module.exports = router;
