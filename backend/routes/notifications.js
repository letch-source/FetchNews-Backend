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

// Send notification for Fetch ready (called from iOS after Fetch completes)
router.post('/fetch-ready', authenticateToken, async (req, res) => {
  try {
    const { fetchTitle } = req.body;
    const user = req.user;

    if (!fetchTitle) {
      return res.status(400).json({ error: 'fetchTitle is required' });
    }

    let deviceToken = null;
    if (mongoose.connection.readyState === 1) {
      // Reload user to get latest device token
      const freshUser = await User.findById(user._id || user.id);
      deviceToken = freshUser?.deviceToken;
    } else {
      deviceToken = user.preferences?.deviceToken || null;
    }

    if (!deviceToken) {
      console.log(`[NOTIFICATIONS] No device token found for user ${user.email}, skipping notification`);
      return res.json({ 
        success: false, 
        message: 'No device token registered' 
      });
    }

    const { sendFetchReadyNotification } = require('../utils/notifications');
    const success = await sendFetchReadyNotification(deviceToken, fetchTitle);
    
    if (success) {
      console.log(`[NOTIFICATIONS] ✅ Sent Fetch-ready notification to user ${user.email}`);
      return res.json({ success: true, message: 'Notification sent' });
    } else {
      console.log(`[NOTIFICATIONS] ⚠️  Failed to send notification to user ${user.email}`);
      return res.json({ success: false, message: 'Failed to send notification' });
    }
  } catch (error) {
    console.error('Send Fetch-ready notification error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Diagnostic endpoint to check notification configuration status
router.get('/diagnostics', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Check APNs configuration
    const apnKeyId = process.env.APN_KEY_ID;
    const apnTeamId = process.env.APN_TEAM_ID;
    const apnBundleId = process.env.APN_BUNDLE_ID || 'com.finlaysmith.FetchNews';
    const apnKeyContent = process.env.APN_KEY_CONTENT;
    const apnKeyPath = process.env.APN_KEY_PATH;
    const nodeEnv = process.env.NODE_ENV || 'development';
    
    const apnsConfigured = !!(apnKeyId && apnTeamId && (apnKeyContent || apnKeyPath));
    
    // Check user's device token
    let deviceToken = null;
    if (mongoose.connection.readyState === 1) {
      deviceToken = user.deviceToken;
    } else {
      deviceToken = user.preferences?.deviceToken || null;
    }
    
    // Check notification preferences
    const notificationPrefs = user.notificationPreferences || {};
    const scheduledSummaryNotifications = notificationPrefs.scheduledSummaryNotifications !== false;
    const engagementReminders = notificationPrefs.engagementReminders !== false;
    const lastEngagementReminder = notificationPrefs.lastEngagementReminderSent || null;
    
    // Check last usage
    const lastUsageDate = user.lastUsageDate || null;
    const hoursSinceLastUsage = lastUsageDate 
      ? Math.floor((new Date().getTime() - new Date(lastUsageDate).getTime()) / (60 * 60 * 1000))
      : null;
    
    res.json({
      apns: {
        configured: apnsConfigured,
        keyId: apnKeyId ? `${apnKeyId.substring(0, 4)}...` : 'Not set',
        teamId: apnTeamId ? `${apnTeamId.substring(0, 4)}...` : 'Not set',
        bundleId: apnBundleId,
        keySource: apnKeyContent ? 'APN_KEY_CONTENT' : (apnKeyPath ? 'APN_KEY_PATH' : 'Not set'),
        environment: nodeEnv === 'production' ? 'production' : 'development (sandbox)'
      },
      user: {
        hasDeviceToken: !!deviceToken,
        deviceTokenPreview: deviceToken ? `${deviceToken.substring(0, 8)}...` : 'Not registered',
        scheduledSummaryNotifications: scheduledSummaryNotifications,
        engagementReminders: engagementReminders,
        lastEngagementReminderSent: lastEngagementReminder,
        lastUsageDate: lastUsageDate,
        hoursSinceLastUsage: hoursSinceLastUsage
      },
      status: {
        canReceiveNotifications: apnsConfigured && !!deviceToken,
        issues: [
          !apnsConfigured && 'APNs not configured (missing APN_KEY_ID, APN_TEAM_ID, or APN_KEY_CONTENT)',
          !deviceToken && 'No device token registered (user needs to grant notification permissions)',
          !scheduledSummaryNotifications && 'Scheduled summary notifications disabled',
          !engagementReminders && 'Engagement reminders disabled'
        ].filter(Boolean)
      }
    });
  } catch (error) {
    console.error('Notification diagnostics error:', error);
    res.status(500).json({ error: 'Failed to get notification diagnostics' });
  }
});

module.exports = router;

