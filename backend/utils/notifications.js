const apn = require('apn');

// Initialize APNs provider
let apnProvider = null;

function initializeAPNs() {
  // Check if APNs is configured via environment variables
  const apnKeyId = process.env.APN_KEY_ID;
  const apnTeamId = process.env.APN_TEAM_ID;
  const apnBundleId = process.env.APN_BUNDLE_ID || 'com.fetchnews.app';
  const apnKeyPath = process.env.APN_KEY_PATH;
  const apnKeyContent = process.env.APN_KEY_CONTENT;
  const apnProduction = process.env.NODE_ENV === 'production';

  if (!apnKeyId || !apnTeamId) {
    console.log('[NOTIFICATIONS] APNs not configured - notifications will be disabled');
    console.log('[NOTIFICATIONS] Set APN_KEY_ID, APN_TEAM_ID, and APN_KEY_CONTENT env vars to enable');
    return null;
  }

  try {
    let keyContent = apnKeyContent;
    
    // If key path is provided, read from file
    if (!keyContent && apnKeyPath) {
      const fs = require('fs');
      keyContent = fs.readFileSync(apnKeyPath, 'utf8');
    }

    if (!keyContent) {
      console.log('[NOTIFICATIONS] APNs key content not found - notifications will be disabled');
      return null;
    }

    const options = {
      token: {
        key: keyContent,
        keyId: apnKeyId,
        teamId: apnTeamId
      },
      production: apnProduction
    };

    apnProvider = new apn.Provider(options);
    console.log(`[NOTIFICATIONS] APNs initialized (${apnProduction ? 'production' : 'development'})`);
    return apnProvider;
  } catch (error) {
    console.error('[NOTIFICATIONS] Failed to initialize APNs:', error);
    return null;
  }
}

// Initialize on module load
initializeAPNs();

/**
 * Send push notification to iOS device
 * @param {string} deviceToken - The device token (hex string)
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data payload
 * @returns {Promise<boolean>} - Success status
 */
async function sendPushNotification(deviceToken, title, body, data = {}) {
  if (!apnProvider) {
    console.log('[NOTIFICATIONS] APNs not configured, skipping notification');
    return false;
  }

  if (!deviceToken) {
    console.log('[NOTIFICATIONS] No device token provided');
    return false;
  }

  try {
    const notification = new apn.Notification();
    
    // Set notification properties
    notification.alert = {
      title: title,
      body: body
    };
    
    notification.sound = 'default';
    notification.badge = 1;
    notification.topic = process.env.APN_BUNDLE_ID || 'com.fetchnews.app';
    
    // Add custom data
    notification.payload = {
      ...data,
      notificationType: data.notificationType || 'general'
    };

    // Send notification
    const result = await apnProvider.send(notification, deviceToken);
    
    if (result.failed && result.failed.length > 0) {
      console.error('[NOTIFICATIONS] Failed to send notification:', result.failed);
      return false;
    }
    
    if (result.sent && result.sent.length > 0) {
      console.log(`[NOTIFICATIONS] Successfully sent notification to ${deviceToken.substring(0, 8)}...`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('[NOTIFICATIONS] Error sending push notification:', error);
    return false;
  }
}

/**
 * Send notification for scheduled summary ready
 * @param {string} deviceToken - The device token
 * @param {string} summaryTitle - Title of the summary
 * @param {string} summaryId - ID of the summary
 */
async function sendScheduledSummaryNotification(deviceToken, summaryTitle, summaryId) {
  return await sendPushNotification(
    deviceToken,
    'Your Fetch is Ready! 📰',
    `Your scheduled summary "${summaryTitle}" is ready to read.`,
    {
      notificationType: 'scheduledSummary',
      summaryId: summaryId,
      action: 'openSummary'
    }
  );
}

/**
 * Send engagement reminder notification
 * @param {string} deviceToken - The device token
 * @param {string} message - Custom message (optional)
 */
async function sendEngagementReminder(deviceToken, message = null) {
  const messages = [
    "Stay informed! Your personalized news summary is waiting.",
    "Don't miss out on today's top stories. Fetch your news now!",
    "Your daily briefing is ready. Tap to catch up on what matters.",
    "New stories are waiting for you. Time for your daily Fetch!"
  ];
  
  const selectedMessage = message || messages[Math.floor(Math.random() * messages.length)];
  
  return await sendPushNotification(
    deviceToken,
    'Time for Your Daily Fetch! 📰',
    selectedMessage,
    {
      notificationType: 'engagementReminder',
      action: 'openApp'
    }
  );
}

/**
 * Shutdown APNs provider (call on app shutdown)
 */
function shutdown() {
  if (apnProvider) {
    apnProvider.shutdown();
    console.log('[NOTIFICATIONS] APNs provider shut down');
  }
}

module.exports = {
  sendPushNotification,
  sendScheduledSummaryNotification,
  sendEngagementReminder,
  initializeAPNs,
  shutdown
};

