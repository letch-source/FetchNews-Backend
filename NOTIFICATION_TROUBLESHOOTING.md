# Notification Troubleshooting Guide

## What Was Fixed

I've added the missing engagement reminder scheduler and a diagnostic endpoint to help troubleshoot notification issues.

### Changes Made:

1. **Added Engagement Reminder Scheduler** (`backend/index.js`)
   - Checks every hour for users who haven't used the app in 24+ hours
   - Sends engagement reminders (max once per 48 hours per user)
   - Respects user notification preferences

2. **Added Diagnostic Endpoint** (`backend/routes/notifications.js`)
   - `GET /api/notifications/diagnostics` - Shows complete notification configuration status
   - Helps identify configuration issues quickly

## How to Check Notification Status

### 1. Use the Diagnostic Endpoint

Make an authenticated request to:
```
GET /api/notifications/diagnostics
```

This will show:
- APNs configuration status
- Device token registration status
- User notification preferences
- Last usage and reminder times
- List of any issues preventing notifications

### 2. Check Server Logs

Look for these log messages when the server starts:
- `[NOTIFICATIONS] APNs initialized (production/development)` - ✅ Good
- `[NOTIFICATIONS] APNs not configured - notifications will be disabled` - ❌ Problem

When notifications are sent:
- `[NOTIFICATIONS] Successfully sent notification to ...` - ✅ Sent
- `[NOTIFICATIONS] APNs not configured, skipping notification` - ❌ APNs not set up
- `[NOTIFICATIONS] No device token provided` - ❌ User hasn't registered token

## Common Issues and Solutions

### Issue 1: "APNs not configured"

**Symptoms:**
- Logs show: `[NOTIFICATIONS] APNs not configured - notifications will be disabled`
- Diagnostic endpoint shows `apns.configured: false`

**Solution:**
1. Get APNs credentials from Apple Developer Portal:
   - Go to https://developer.apple.com/account/resources/authkeys/list
   - Create a new key with "Apple Push Notifications service (APNs)" enabled
   - Download the `.p8` key file (you can only download once!)
   - Note the Key ID (e.g., `ABC123DEFG`)
   - Note your Team ID (found in membership section)

2. Set environment variables in your `.env` file:
   ```env
   APN_KEY_ID=your-key-id-here
   APN_TEAM_ID=your-team-id-here
   APN_BUNDLE_ID=com.finlaysmith.FetchNews
   APN_KEY_CONTENT=-----BEGIN PRIVATE KEY-----
   ...paste entire key content here...
   -----END PRIVATE KEY-----
   ```

3. Set `NODE_ENV`:
   - `NODE_ENV=development` for testing (uses sandbox APNs)
   - `NODE_ENV=production` for App Store (uses production APNs)

4. Restart your server

### Issue 2: "No device token registered"

**Symptoms:**
- Diagnostic endpoint shows `user.hasDeviceToken: false`
- Logs show: `[NOTIFICATIONS] No device token provided`

**Solution:**
1. User needs to grant notification permissions in the iOS app
2. The app should call `POST /api/notifications/register-token` with the device token
3. Check iOS app logs to see if token registration is successful
4. Verify the user is authenticated when registering the token

### Issue 3: "Notifications not received on device"

**Symptoms:**
- Backend logs show notification was sent successfully
- But user doesn't receive notification on device

**Possible Causes:**
1. **Wrong APNs Environment:**
   - Development builds need `NODE_ENV=development` (sandbox)
   - App Store builds need `NODE_ENV=production`
   - Mismatch will cause notifications to fail silently

2. **Device Settings:**
   - Check iOS Settings > Notifications > FetchNews
   - Ensure notifications are enabled
   - Check Do Not Disturb mode

3. **Bundle ID Mismatch:**
   - Ensure `APN_BUNDLE_ID` matches your app's bundle identifier exactly
   - Default is `com.finlaysmith.FetchNews`

4. **Expired/Invalid Device Token:**
   - Device tokens can expire or become invalid
   - User may need to re-register their token

### Issue 4: "Engagement reminders not working"

**Symptoms:**
- Scheduled summary notifications work, but engagement reminders don't

**Solution:**
1. Check that engagement reminder scheduler is running:
   - Look for: `[ENGAGEMENT] Engagement reminder scheduler ENABLED`
   - Check logs every hour for: `[ENGAGEMENT] Checking for users needing engagement reminders`

2. Verify user preferences:
   - Check diagnostic endpoint: `user.engagementReminders` should be `true`
   - User can enable/disable via `PUT /api/notifications/preferences`

3. Check timing:
   - Reminders only sent if user hasn't used app in 24+ hours
   - Max once per 48 hours per user
   - Check `user.hoursSinceLastUsage` in diagnostics

## Testing Notifications

### Test Scheduled Summary Notification

1. Create a scheduled summary in the app
2. Wait for it to execute (or manually trigger if testing)
3. Check logs for: `[SCHEDULER] ✅ Sent push notification for scheduled summary`

### Test Engagement Reminder

1. Use diagnostic endpoint to check user status
2. Ensure user hasn't used app in 24+ hours
3. Ensure no reminder sent in last 48 hours
4. Wait for next hourly check (or manually trigger)
5. Check logs for: `[ENGAGEMENT] ✅ Sent engagement reminder`

### Manual Test Notification

Send a test notification:
```
POST /api/notifications/test
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Test Notification",
  "body": "This is a test"
}
```

## Verification Checklist

- [ ] APNs environment variables set (`APN_KEY_ID`, `APN_TEAM_ID`, `APN_KEY_CONTENT`)
- [ ] `NODE_ENV` matches your build type (development/production)
- [ ] Server logs show: `[NOTIFICATIONS] APNs initialized`
- [ ] User has device token registered (`GET /api/notifications/preferences` shows `hasToken: true`)
- [ ] Notification preferences enabled (`scheduledSummaryNotifications: true`, `engagementReminders: true`)
- [ ] Engagement reminder scheduler running (check logs)
- [ ] Bundle ID matches app (`APN_BUNDLE_ID`)

## Next Steps

1. **Check your current status:**
   ```bash
   # Make authenticated request to diagnostic endpoint
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        http://localhost:10000/api/notifications/diagnostics
   ```

2. **If APNs not configured:**
   - Follow "Issue 1" solution above
   - Restart server after setting environment variables

3. **If device token missing:**
   - Check iOS app is requesting notification permissions
   - Verify token registration endpoint is being called
   - Check iOS app logs for errors

4. **Monitor logs:**
   - Watch for `[NOTIFICATIONS]` and `[ENGAGEMENT]` log entries
   - Check for any error messages

## Additional Resources

- See `PUSH_NOTIFICATIONS_SETUP.md` for detailed setup instructions
- Apple Push Notification documentation: https://developer.apple.com/documentation/usernotifications

