const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');
const fallbackAuth = require('../utils/fallbackAuth');

const router = express.Router();

// Register device token for push notifications
router.post('/register-token', authenticateToken, async (req, res) => {
  try {
    const { deviceToken } = req.body;
    const user = req.user;

    if (!deviceToken) {
      return res.status(400).json({ error: 'Device token is required' });
    }

    // Update user's device token
    if (mongoose.connection.readyState === 1) {
      user.deviceToken = deviceToken;
      await user.save();
    } else {
      // Fallback mode - store in preferences
      if (!user.preferences) {
        user.preferences = {};
      }
      user.preferences.deviceToken = deviceToken;
      await fallbackAuth.updatePreferences(user, user.preferences);
    }

    console.log(`[NOTIFICATIONS] Registered device token for user ${user.email}`);
    res.json({ message: 'Device token registered successfully' });
  } catch (error) {
    console.error('Register device token error:', error);
    res.status(500).json({ error: 'Failed to register device token' });
  }
});

// Unregister device token
router.post('/unregister-token', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // Clear user's device token
    if (mongoose.connection.readyState === 1) {
      user.deviceToken = null;
      await user.save();
    } else {
      // Fallback mode - remove from preferences
      if (user.preferences) {
        user.preferences.deviceToken = null;
        await fallbackAuth.updatePreferences(user, user.preferences);
      }
    }

    console.log(`[NOTIFICATIONS] Unregistered device token for user ${user.email}`);
    res.json({ message: 'Device token unregistered successfully' });
  } catch (error) {
    console.error('Unregister device token error:', error);
    res.status(500).json({ error: 'Failed to unregister device token' });
  }
});

module.exports = router;

