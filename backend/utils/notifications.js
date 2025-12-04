const apn = require('apn');

// Initialize APNs providers for both environments
let apnProviderProduction = null;
let apnProviderDevelopment = null;

function initializeAPNs() {
  // Check if APNs is configured via environment variables
  const apnKeyId = process.env.APN_KEY_ID;
  const apnTeamId = process.env.APN_TEAM_ID;
  const apnBundleId = process.env.APN_BUNDLE_ID || 'com.finlaysmith.FetchNews';
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
async function sendPushNotification(deviceToken, title, body, data = {}) {
  console.log(`[NOTIFICATIONS] Attempting to send notification:`);
  console.log(`[NOTIFICATIONS]   - Title: "${title}"`);
  console.log(`[NOTIFICATIONS]   - Body: "${body}"`);
  console.log(`[NOTIFICATIONS]   - Device token: ${deviceToken ? `${deviceToken.substring(0, 8)}...` : 'MISSING'}`);
  console.log(`[NOTIFICATIONS]   - APNs providers: production=${!!apnProviderProduction}, development=${!!apnProviderDevelopment}`);
  
  if (!apnProviderProduction && !apnProviderDevelopment) {
    console.log('[NOTIFICATIONS] ❌ APNs not configured, skipping notification');
    console.log('[NOTIFICATIONS]   Check APN_KEY_ID, APN_TEAM_ID, and APN_KEY_CONTENT environment variables');
    return false;
  }

  if (!deviceToken) {
    console.log('[NOTIFICATIONS] ❌ No device token provided');
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
      console.log('[NOTIFICATIONS] ❌ No APNs providers available');
      return false;
    }

    // Try primary environment first (if available)
    let result;
    if (primaryProvider) {
      console.log(`[NOTIFICATIONS] Sending notification via APNs (${primaryEnv})...`);
      result = await primaryProvider.send(notification, deviceToken);
    } else {
      // If primary not available, use fallback
      console.log(`[NOTIFICATIONS] Primary provider not available, using ${fallbackEnv}...`);
      result = await fallbackProvider.send(notification, deviceToken);
      if (result.sent && result.sent.length > 0) {
        console.log(`[NOTIFICATIONS] ✅ Successfully sent notification to ${deviceToken.substring(0, 8)}... (using ${fallbackEnv} environment)`);
        return true;
      }
      if (result.failed && result.failed.length > 0) {
        console.error(`[NOTIFICATIONS] ❌ Failed to send notification (${fallbackEnv}):`, JSON.stringify(result.failed, null, 2));
        return false;
      }
      return false;
    }
    
    // Check for BadEnvironmentKeyInToken error
    if (result.failed && result.failed.length > 0) {
      const badEnvError = result.failed.find(f => 
        f.response && f.response.reason === 'BadEnvironmentKeyInToken'
      );
      
      if (badEnvError && fallbackProvider) {
        console.log(`[NOTIFICATIONS] Environment mismatch detected (token is ${fallbackEnv}, server using ${primaryEnv}), retrying with ${fallbackEnv}...`);
        
        // Retry with the other environment
        result = await fallbackProvider.send(notification, deviceToken);
        
        if (result.failed && result.failed.length > 0) {
          // Check for BadDeviceToken in fallback attempt
          const badTokenError = result.failed.find(f => 
            f.response && f.response.reason === 'BadDeviceToken'
          );
          if (badTokenError) {
            console.error(`[NOTIFICATIONS] ❌ Invalid device token detected (${fallbackEnv}), token should be unregistered`);
            // Return a special value to indicate token should be cleared
            return 'BAD_TOKEN';
          }
          console.error(`[NOTIFICATIONS] ❌ Failed to send notification (${fallbackEnv}):`, JSON.stringify(result.failed, null, 2));
          return false;
        }
        
        if (result.sent && result.sent.length > 0) {
          console.log(`[NOTIFICATIONS] ✅ Successfully sent notification to ${deviceToken.substring(0, 8)}... (using ${fallbackEnv} environment)`);
          return true;
        }
      } else {
        // Check for BadDeviceToken in primary attempt
        const badTokenError = result.failed.find(f => 
          f.response && f.response.reason === 'BadDeviceToken'
        );
        if (badTokenError) {
          console.error(`[NOTIFICATIONS] ❌ Invalid device token detected (${primaryEnv}), token should be unregistered`);
          // Return a special value to indicate token should be cleared
          return 'BAD_TOKEN';
        }
        // Other error, log and return
        console.error(`[NOTIFICATIONS] ❌ Failed to send notification (${primaryEnv}):`, JSON.stringify(result.failed, null, 2));
        return false;
      }
    }
    
    if (result.sent && result.sent.length > 0) {
      console.log(`[NOTIFICATIONS] ✅ Successfully sent notification to ${deviceToken.substring(0, 8)}... (using ${primaryEnv} environment)`);
      return true;
    }
    
    console.log(`[NOTIFICATIONS] ⚠️  No notification sent (no sent or failed results)`);
    return false;
  } catch (error) {
    console.error('[NOTIFICATIONS] ❌ Error sending push notification:', error);
    console.error('[NOTIFICATIONS] ❌ Error stack:', error.stack);
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
 * Send notification when a Fetch is ready and user is not in app
 * @param {string} deviceToken - The device token
 * @param {string} fetchTitle - Title of the Fetch
 */
async function sendFetchReadyNotification(deviceToken, fetchTitle) {
  return await sendPushNotification(
    deviceToken,
    'Your Fetch is Ready! 🐕📰',
    `${fetchTitle} is ready to view.`,
    {
      notificationType: 'fetchReady',
      action: 'openFetch'
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
  sendFetchReadyNotification,
  initializeAPNs,
  shutdown
};

