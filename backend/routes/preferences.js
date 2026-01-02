const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');
const fallbackAuth = require('../utils/fallbackAuth');

const router = express.Router();

// Debug endpoint to check preferences persistence
router.get('/debug', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const isMongoConnected = mongoose.connection.readyState === 1;
    
    let dbUser = null;
    if (isMongoConnected) {
      const User = require('../models/User');
      dbUser = await User.findById(user._id);
    }
    
    res.json({
      isMongoConnected,
      middlewareUser: {
        email: user.email,
        selectedVoice: user.selectedVoice,
        _id: user._id
      },
      databaseUser: dbUser ? {
        email: dbUser.email,
        selectedVoice: dbUser.selectedVoice,
        _id: dbUser._id
      } : null,
      match: dbUser && dbUser.selectedVoice === user.selectedVoice
    });
  } catch (error) {
    console.error('Debug preferences error:', error);
    res.status(500).json({ error: 'Debug failed', message: error.message });
  }
});

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
    
    console.log(`[PREFERENCES] Updating preferences for user ${user.email}`);
    console.log(`[PREFERENCES] MongoDB readyState: ${mongoose.connection.readyState}`);
    console.log(`[PREFERENCES] selectedVoice received: ${preferences.selectedVoice}`);
    console.log(`[PREFERENCES] selectedTopics received: ${JSON.stringify(preferences.selectedTopics)}`);
    console.log(`[PREFERENCES] selectedTopics count: ${preferences.selectedTopics?.length || 0}`);
    
    let updatedPreferences;
    if (mongoose.connection.readyState === 1) {
      console.log(`[PREFERENCES] Using MongoDB for user ${user.email}`);
      updatedPreferences = await user.updatePreferences(preferences);
      console.log(`[PREFERENCES] After update - selectedTopics count: ${updatedPreferences.selectedTopics?.length || 0}`);
      console.log(`[PREFERENCES] After update - selectedVoice: ${updatedPreferences.selectedVoice}`);
    } else {
      console.log(`[PREFERENCES] Using fallback auth for user ${user.email}`);
      updatedPreferences = await fallbackAuth.updatePreferences(user, preferences);
      console.log(`[PREFERENCES] After fallback update - selectedVoice: ${updatedPreferences.selectedVoice}`);
    }
    
    res.json(updatedPreferences);
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

module.exports = router;
