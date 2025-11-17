const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const mongoose = require('mongoose');
const fallbackAuth = require('../utils/fallbackAuth');
const { sendPushNotification, sendScheduledSummaryNotification, sendEngagementReminder } = require('../utils/notifications');

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
    res.json({ 
      message: 'Device token registered successfully',
      hasToken: true
    });
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
    res.json({ 
      message: 'Device token unregistered successfully',
      hasToken: false
    });
  } catch (error) {
    console.error('Unregister device token error:', error);
    res.status(500).json({ error: 'Failed to unregister device token' });
  }
});

// Get notification preferences
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    let deviceToken = null;
    if (mongoose.connection.readyState === 1) {
      deviceToken = user.deviceToken;
    } else {
      deviceToken = user.preferences?.deviceToken || null;
    }

    const preferences = {
      scheduledSummaryNotifications: user.notificationPreferences?.scheduledSummaryNotifications !== false,
      engagementReminders: user.notificationPreferences?.engagementReminders !== false,
      hasToken: !!deviceToken
    };

    res.json(preferences);
  } catch (error) {
    console.error('Get notification preferences error:', error);
    res.status(500).json({ error: 'Failed to get notification preferences' });
  }
});

// Update notification preferences
router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const { scheduledSummaryNotifications, engagementReminders } = req.body;
    const user = req.user;

    if (!user.notificationPreferences) {
      user.notificationPreferences = {};
    }

    if (scheduledSummaryNotifications !== undefined) {
      user.notificationPreferences.scheduledSummaryNotifications = scheduledSummaryNotifications;
    }

    if (engagementReminders !== undefined) {
      user.notificationPreferences.engagementReminders = engagementReminders;
    }

    if (mongoose.connection.readyState === 1) {
      user.markModified('notificationPreferences');
      await user.save();
    } else {
      if (!user.preferences) {
        user.preferences = {};
      }
      user.preferences.notificationPreferences = user.notificationPreferences;
      await fallbackAuth.updatePreferences(user, user.preferences);
    }

    console.log(`[NOTIFICATIONS] Updated preferences for user ${user.email}`);

    res.json({
      scheduledSummaryNotifications: user.notificationPreferences.scheduledSummaryNotifications,
      engagementReminders: user.notificationPreferences.engagementReminders
    });
  } catch (error) {
    console.error('Update notification preferences error:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

// Test notification (for admin/testing)
router.post('/test', authenticateToken, async (req, res) => {
  try {
    const { title, body } = req.body;
    const user = req.user;

    let deviceToken = null;
    if (mongoose.connection.readyState === 1) {
      deviceToken = user.deviceToken;
    } else {
      deviceToken = user.preferences?.deviceToken || null;
    }

    if (!deviceToken) {
      return res.status(400).json({ error: 'No device token registered' });
    }

    const success = await sendPushNotification(
      deviceToken,
      title || 'Test Notification',
      body || 'This is a test notification from Fetch News',
      {
        notificationType: 'test',
        action: 'openApp'
      }
    );

    if (success) {
      res.json({ message: 'Test notification sent successfully' });
    } else {
      res.status(500).json({ error: 'Failed to send test notification' });
    }
  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({ error: 'Failed to send test notification' });
  }
});

module.exports = router;
