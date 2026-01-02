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
