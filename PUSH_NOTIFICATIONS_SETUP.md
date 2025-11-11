# Push Notifications Setup Guide

This guide explains how to set up push notifications for Fetch News, including both scheduled summary notifications and engagement reminders.

## Overview

The notification system supports:
1. **Scheduled Summary Notifications**: Sent when a scheduled fetch completes
2. **Engagement Reminders**: Sent to users who haven't used the app in 24+ hours (max once per 48 hours)

## Backend Setup

### 1. Install Dependencies

The `apn` package is already included in `package.json`. Install it:

```bash
cd backend
npm install
```

### 2. Configure APNs (Apple Push Notification service)

You need to set up APNs credentials from Apple Developer Portal:

1. **Create APNs Key**:
   - Go to [Apple Developer Portal](https://developer.apple.com/account/resources/authkeys/list)
   - Click "+" to create a new key
   - Enable "Apple Push Notifications service (APNs)"
   - Download the `.p8` key file (you can only download it once!)

2. **Get Required Information**:
   - **Key ID**: Found in the key name (e.g., `ABC123DEFG`)
   - **Team ID**: Found in your Apple Developer account membership section
   - **Bundle ID**: Your app's bundle identifier (e.g., `com.fetchnews.app`)

3. **Set Environment Variables**:

Add these to your `.env` file:

```env
# APNs Configuration (required for push notifications)
APN_KEY_ID=your-key-id-here
APN_TEAM_ID=your-team-id-here
APN_BUNDLE_ID=com.fetchnews.app
APN_KEY_CONTENT=-----BEGIN PRIVATE KEY-----
...your key content here...
-----END PRIVATE KEY-----

# Or use a file path instead:
# APN_KEY_PATH=/path/to/AuthKey_ABC123DEFG.p8

# Set to production when deploying to App Store
NODE_ENV=production
```

**Important**: 
- For development/testing, use `NODE_ENV=development` (uses sandbox APNs)
- For production, use `NODE_ENV=production` (uses production APNs)
- The `APN_KEY_CONTENT` should be the entire contents of your `.p8` file, including the BEGIN/END lines

### 3. Verify Setup

The notification service will log initialization status:
- ✅ `[NOTIFICATIONS] APNs initialized (production/development)` - Success
- ⚠️ `[NOTIFICATIONS] APNs not configured - notifications will be disabled` - Missing config

## iOS App Setup

### 1. Enable Push Notifications Capability

1. Open your project in Xcode
2. Select your app target
3. Go to "Signing & Capabilities"
4. Click "+ Capability"
5. Add "Push Notifications"

### 2. Configure Background Modes

The `Info.plist` already includes `remote-notification` in `UIBackgroundModes`. Verify it's present.

### 3. Request Permissions

The app automatically requests notification permissions on first launch. Users can:
- Allow notifications (recommended)
- Deny notifications (they won't receive push notifications)

### 4. Test Notifications

1. **Register Device Token**: The app automatically registers the device token when:
   - User grants notification permissions
   - User signs in
   - App becomes active

2. **Test via API**: You can send a test notification:

```bash
curl -X POST https://fetchnews-backend.onrender.com/api/notifications/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "body": "This is a test notification"}'
```

## API Endpoints

### Register Push Token
```
POST /api/notifications/register-token
Authorization: Bearer <token>
Body: { "deviceToken": "hex-token-string" }
```

### Unregister Push Token
```
POST /api/notifications/unregister-token
Authorization: Bearer <token>
```

### Get Notification Preferences
```
GET /api/notifications/preferences
Authorization: Bearer <token>
```

### Update Notification Preferences
```
PUT /api/notifications/preferences
Authorization: Bearer <token>
Body: {
  "scheduledSummaryNotifications": true,
  "engagementReminders": true
}
```

### Send Test Notification
```
POST /api/notifications/test
Authorization: Bearer <token>
Body: {
  "title": "Test Title",
  "body": "Test Body"
}
```

## How It Works

### Scheduled Summary Notifications

1. When a scheduled summary executes (via the scheduler in `index.js`)
2. After the summary is generated and saved
3. If user has:
   - Push notification token registered
   - `scheduledSummaryNotifications` enabled (default: true)
4. A notification is sent with:
   - Title: "Your Fetch is Ready! 📰"
   - Body: Summary title
   - Payload: `{ notificationType: "scheduledSummary", summaryId: "...", action: "openSummary" }`

### Engagement Reminders

1. Runs every hour (as part of the 10-minute scheduler check)
2. Finds users who:
   - Have push token registered
   - Have `engagementReminders` enabled (default: true)
   - Haven't used app in 24+ hours
   - Haven't received reminder in 48+ hours
3. Sends a friendly reminder notification

## Troubleshooting

### Notifications Not Sending

1. **Check APNs Configuration**:
   - Verify all environment variables are set correctly
   - Check that key content includes BEGIN/END lines
   - Ensure `NODE_ENV` matches your environment (dev/prod)

2. **Check Device Token**:
   - Verify token is registered: `GET /api/notifications/preferences`
   - Check that `hasToken: true` in response

3. **Check User Preferences**:
   - Verify notification preferences are enabled
   - Check user's `notificationPreferences` in database

4. **Check Logs**:
   - Backend logs show notification send attempts
   - Look for `[NOTIFICATIONS]` and `[SCHEDULER]` log entries

### Common Issues

**"APNs not configured"**:
- Missing environment variables
- Key content not properly formatted

**"No device token registered"**:
- User hasn't granted notification permissions
- Token registration failed (check network/auth)

**"Notifications not received"**:
- Device is in Do Not Disturb mode
- User disabled notifications in iOS Settings
- Wrong APNs environment (dev vs prod)

## Security Notes

- Device tokens are stored encrypted in the database
- Tokens are automatically unregistered on logout
- Only authenticated users can register tokens
- APNs keys should be kept secure (use environment variables, not code)

## Next Steps

1. Set up APNs credentials in Apple Developer Portal
2. Configure backend environment variables
3. Test with a development device
4. Deploy to production with production APNs credentials
5. Monitor notification delivery rates

