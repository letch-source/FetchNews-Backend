const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const { sendPushNotification, sendScheduledSummaryNotification, sendEngagementReminder } = require('../utils/notifications');

const router = express.Router();

// Register push notification token
router.post('/register-token', authenticateToken, async (req, res) => {
  try {
    const { deviceToken } = req.body;
    const user = req.user;

    if (!deviceToken) {
      return res.status(400).json({ error: 'Device token is required' });
    }

    // Update user's push notification token
    user.pushNotificationToken = deviceToken;
    await user.save();

    console.log(`[NOTIFICATIONS] Registered push token for user ${user.email}`);
    
    res.json({ 
      message: 'Push notification token registered successfully',
      hasToken: true
    });
  } catch (error) {
    console.error('Register push token error:', error);
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

// Unregister push notification token
router.post('/unregister-token', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // Remove push notification token
    user.pushNotificationToken = null;
    await user.save();

    console.log(`[NOTIFICATIONS] Unregistered push token for user ${user.email}`);
    
    res.json({ 
      message: 'Push notification token unregistered successfully',
      hasToken: false
    });
  } catch (error) {
    console.error('Unregister push token error:', error);
    res.status(500).json({ error: 'Failed to unregister push token' });
  }
});

// Get notification preferences
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    const preferences = {
      scheduledSummaryNotifications: user.notificationPreferences?.scheduledSummaryNotifications !== false,
      engagementReminders: user.notificationPreferences?.engagementReminders !== false,
      hasToken: !!user.pushNotificationToken
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

    user.markModified('notificationPreferences');
    await user.save();

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

    if (!user.pushNotificationToken) {
      return res.status(400).json({ error: 'No push notification token registered' });
    }

    const success = await sendPushNotification(
      user.pushNotificationToken,
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

