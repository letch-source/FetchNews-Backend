const apn = require('apn');

// Initialize APNs providers for both environments
let apnProviderProduction = null;
let apnProviderDevelopment = null;
let apnKeyContent = null;

function initializeAPNs() {
  // Check if APNs is configured via environment variables
  const apnKeyId = process.env.APN_KEY_ID;
  const apnTeamId = process.env.APN_TEAM_ID;
  const apnBundleId = process.env.APN_BUNDLE_ID || 'com.finlaysmith.FetchNews';
  const apnKeyPath = process.env.APN_KEY_PATH;
  const apnKeyContentEnv = process.env.APN_KEY_CONTENT;
  const apnProduction = process.env.NODE_ENV === 'production';

  if (!apnKeyId || !apnTeamId) {
    console.log('[NOTIFICATIONS] APNs not configured - notifications will be disabled');
    console.log('[NOTIFICATIONS] Set APN_KEY_ID, APN_TEAM_ID, and APN_KEY_CONTENT env vars to enable');
    return null;
  }

  try {
    let keyContent = apnKeyContentEnv;
    
    // If key path is provided, read from file
    if (!keyContent && apnKeyPath) {
      const fs = require('fs');
      keyContent = fs.readFileSync(apnKeyPath, 'utf8');
    }

    if (!keyContent) {
      console.log('[NOTIFICATIONS] APNs key content not found - notifications will be disabled');
      return null;
    }

    apnKeyContent = keyContent;

    // Create production provider
    const optionsProduction = {
      token: {
        key: keyContent,
        keyId: apnKeyId,
        teamId: apnTeamId
      },
      production: true
    };
    apnProviderProduction = new apn.Provider(optionsProduction);

    // Create development provider
    const optionsDevelopment = {
      token: {
        key: keyContent,
        keyId: apnKeyId,
        teamId: apnTeamId
      },
      production: false
    };
    apnProviderDevelopment = new apn.Provider(optionsDevelopment);

    console.log(`[NOTIFICATIONS] APNs initialized for both environments (production and development)`);
    console.log(`[NOTIFICATIONS] Primary environment: ${apnProduction ? 'production' : 'development'}`);
    return true;
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
async function sendPushNotification(deviceToken, title, body, data = {}, collapseId = null) {
  if (!apnProviderProduction && !apnProviderDevelopment) {
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
    notification.topic = process.env.APN_BUNDLE_ID || 'com.finlaysmith.FetchNews';

    // Notifications sharing a collapse ID replace each other on the device instead
    // of stacking, so a stale "ready" alert from a missed day doesn't linger once a
    // newer one for the same thing arrives.
    if (collapseId) {
      notification.collapseId = collapseId;
    }
    
    // Add custom data
    notification.payload = {
      ...data,
      notificationType: data.notificationType || 'general'
    };

    // Determine primary provider based on NODE_ENV
    const primaryProvider = process.env.NODE_ENV === 'production' ? apnProviderProduction : apnProviderDevelopment;
    const fallbackProvider = process.env.NODE_ENV === 'production' ? apnProviderDevelopment : apnProviderProduction;
    const primaryEnv = process.env.NODE_ENV === 'production' ? 'production' : 'development';
    const fallbackEnv = process.env.NODE_ENV === 'production' ? 'development' : 'production';

    // Ensure we have at least one provider
    if (!primaryProvider && !fallbackProvider) {
      console.log('[NOTIFICATIONS] No APNs providers available');
      return false;
    }

    // Try primary environment first (if available)
    let result;
    if (primaryProvider) {
      result = await primaryProvider.send(notification, deviceToken);
    } else {
      // If primary not available, use fallback
      result = await fallbackProvider.send(notification, deviceToken);
      if (result.sent && result.sent.length > 0) {
        console.log(`[NOTIFICATIONS] Successfully sent notification to ${deviceToken.substring(0, 8)}... (using ${fallbackEnv} environment)`);
        return true;
      }
      if (result.failed && result.failed.length > 0) {
        console.error(`[NOTIFICATIONS] Failed to send notification (${fallbackEnv}):`, result.failed);
        return false;
      }
      return false;
    }
    
    // Check for environment-mismatch and invalid-token errors
    if (result.failed && result.failed.length > 0) {
      const failedNotification = result.failed[0];
      const reason = failedNotification.response?.reason;

      // Reasons that genuinely mean the DEVICE TOKEN itself is dead (HTTP 400-class,
      // per Apple's docs) — a development-built app's token sent to the production
      // gateway commonly comes back as BadDeviceToken, so retry with the fallback
      // environment before concluding the token is actually dead.
      const invalidTokenReasons = [
        'BadDeviceToken',
        'Unregistered',
        'InvalidToken'
      ];

      // BadEnvironmentKeyInToken is an HTTP 403 provider-credential error (same class
      // as InvalidProviderToken/ExpiredProviderToken) — it means our .p8 key/JWT was
      // rejected for that specific environment, not that the device token is bad.
      // Treating it as a dead-token signal was clearing valid tokens on every send.
      const providerAuthReasons = ['BadEnvironmentKeyInToken'];

      if (reason && invalidTokenReasons.includes(reason) && fallbackProvider) {
        console.log(`[NOTIFICATIONS] ${reason} on ${primaryEnv} gateway (status ${failedNotification.status}) — retrying with ${fallbackEnv} in case the token belongs to that environment...`);

        // Retry with the other environment
        result = await fallbackProvider.send(notification, deviceToken);

        if (result.sent && result.sent.length > 0) {
          console.log(`[NOTIFICATIONS] Successfully sent notification to ${deviceToken.substring(0, 8)}... (using ${fallbackEnv} environment)`);
          return true;
        }

        if (result.failed && result.failed.length > 0) {
          const retryFailedNotification = result.failed[0];
          const retryReason = retryFailedNotification.response?.reason;

          if (retryReason && providerAuthReasons.includes(retryReason)) {
            console.error(`[NOTIFICATIONS] ${fallbackEnv} gateway rejected our provider credentials (${retryReason}, status ${retryFailedNotification.status}) — this is an APNs key/config issue, not a bad device token. Leaving token in place:`, retryFailedNotification);
            return false;
          }

          // Only now, after both environments rejected it as a device-token error, treat it as dead
          if (retryReason && invalidTokenReasons.includes(retryReason)) {
            console.error(`[NOTIFICATIONS] Invalid device token confirmed on both environments (${reason} then ${retryReason}): ${deviceToken.substring(0, 8)}...`);
            return 'BAD_TOKEN';
          }

          console.error(`[NOTIFICATIONS] Failed to send notification (${fallbackEnv}):`, result.failed);
          return false;
        }

        return false;
      } else if (reason && invalidTokenReasons.includes(reason)) {
        // No fallback provider available to retry against
        console.error(`[NOTIFICATIONS] Invalid device token detected (${reason}, status ${failedNotification.status}): ${deviceToken.substring(0, 8)}...`);
        return 'BAD_TOKEN';
      } else if (reason && providerAuthReasons.includes(reason)) {
        console.error(`[NOTIFICATIONS] ${primaryEnv} gateway rejected our provider credentials (${reason}, status ${failedNotification.status}) — this is an APNs key/config issue, not a bad device token. Leaving token in place:`, failedNotification);
        return false;
      } else {
        // Other error, log and return
        console.error(`[NOTIFICATIONS] Failed to send notification (${primaryEnv}, status ${failedNotification.status}):`, failedNotification);
        return false;
      }
    }
    
    if (result.sent && result.sent.length > 0) {
      console.log(`[NOTIFICATIONS] Successfully sent notification to ${deviceToken.substring(0, 8)}... (using ${primaryEnv} environment)`);
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
    'Daily Fetch Ready!',
    `Your ${summaryTitle} is ready to read.`,
    {
      notificationType: 'scheduledSummary',
      summaryId: summaryId,
      action: 'openSummary'
    },
    `scheduledSummary-${summaryId}`
  );
}

/**
 * Send notification for Fetch ready
 * @param {string} deviceToken - The device token
 * @param {string} fetchTitle - Title of the Fetch
 */
async function sendFetchReadyNotification(deviceToken, fetchTitle) {
  return await sendPushNotification(
    deviceToken,
    'Your Fetch is Ready! 📰',
    `${fetchTitle} is ready to read.`,
    {
      notificationType: 'fetchReady',
      action: 'openApp'
    },
    'fetchReady'
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
    },
    'engagementReminder'
  );
}

/**
 * Shutdown APNs providers (call on app shutdown)
 */
function shutdown() {
  if (apnProviderProduction) {
    apnProviderProduction.shutdown();
    console.log('[NOTIFICATIONS] APNs production provider shut down');
  }
  if (apnProviderDevelopment) {
    apnProviderDevelopment.shutdown();
    console.log('[NOTIFICATIONS] APNs development provider shut down');
  }
}

module.exports = {
  sendPushNotification,
  sendScheduledSummaryNotification,
  sendFetchReadyNotification,
  sendEngagementReminder,
  initializeAPNs,
  shutdown
};
