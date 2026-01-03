# Backend Notification Setup - Step by Step Guide

## Overview
To enable push notifications, you need to configure Apple Push Notification service (APNs) on your backend. This requires credentials from Apple Developer Portal.

## Step 1: Get Your Apple Team ID

1. Go to https://developer.apple.com/account/
2. Sign in with your Apple Developer account
3. Look at the top right corner - you'll see your **Team ID** (e.g., `ABC123DEFG`)
4. **Write it down** - you'll need it for `APN_TEAM_ID`

## Step 2: Create an APNs Key

1. Go to https://developer.apple.com/account/resources/authkeys/list
2. Click the **"+"** button (top left) to create a new key
3. Enter a name for your key (e.g., "FetchNews APNs Key")
4. Check the box for **"Apple Push Notifications service (APNs)"**
5. Click **"Continue"** then **"Register"**
6. **IMPORTANT**: Download the `.p8` key file immediately - you can only download it once!
7. **Save the Key ID** - it's shown on the page (e.g., `ABC123DEFG`)

## Step 3: Get Your Bundle ID

Your app's bundle identifier. Check your Xcode project:
- Open `FetchNews.xcodeproj` in Xcode
- Select your app target
- Go to "General" tab
- Look for "Bundle Identifier" (e.g., `com.finlaysmith.FetchNews`)

## Step 4: Prepare Your .p8 Key File

1. Open the downloaded `.p8` file in a text editor
2. Copy the **entire contents** including:
   - `-----BEGIN PRIVATE KEY-----`
   - All the key content
   - `-----END PRIVATE KEY-----`

## Step 5: Configure Environment Variables

### Option A: For Render (Production) - Recommended

Set these in your Render dashboard under **Environment**:

1. Go to your Render service → **Environment** tab
2. Click **"Add Environment Variable"** for each:
   - `APN_KEY_ID` = your-key-id
   - `APN_TEAM_ID` = your-team-id  
   - `APN_BUNDLE_ID` = com.finlaysmith.FetchNews
   - `APN_KEY_CONTENT` = (paste entire key content - see formatting below)
   - `NODE_ENV` = production

**Important for Render:**
- For `APN_KEY_CONTENT`, paste the entire key including BEGIN/END lines
- Render supports multi-line values - paste exactly as shown in your .p8 file
- Use `NODE_ENV=production` for App Store builds
- After adding variables, redeploy your service

### Option B: For Local Development

Create a `.env` file in `/Library/FetchNews/backend/` directory with:

```env
# APNs Configuration
APN_KEY_ID=your-key-id-here
APN_TEAM_ID=your-team-id-here
APN_BUNDLE_ID=com.finlaysmith.FetchNews
APN_KEY_CONTENT=-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
(paste your entire key content here)
...
-----END PRIVATE KEY-----

# Environment (use 'development' for testing, 'production' for App Store)
NODE_ENV=development
```

**Important Notes:**
- Replace `your-key-id-here` with your actual Key ID from Step 2
- Replace `your-team-id-here` with your Team ID from Step 1
- Replace the bundle ID if yours is different
- Paste the ENTIRE key content (including BEGIN/END lines) for `APN_KEY_CONTENT`
- Use `NODE_ENV=development` for local testing (sandbox APNs)
- Use `NODE_ENV=production` for App Store builds (production APNs)

**Note:** If you're deploying to Render, you don't need a `.env` file - set variables in Render dashboard instead (Option A above).

## Step 6: Verify Configuration

After setting up your `.env` file, restart your backend server and check the logs. You should see:

```
[NOTIFICATIONS] APNs initialized (development)
```

If you see:
```
[NOTIFICATIONS] APNs not configured - notifications will be disabled
```

Then check:
- All environment variables are set correctly
- Key content includes BEGIN/END lines
- No extra quotes or formatting issues

## Step 7: Test Notifications

1. Make sure your iOS app has registered a device token (should happen automatically)
2. Use the diagnostic endpoint to check status:
   ```
   GET /api/notifications/diagnostics
   ```
3. Send a test notification:
   ```
   POST /api/notifications/test
   Body: { "title": "Test", "body": "This is a test" }
   ```

## Troubleshooting

### "APNs not configured"
- Check all environment variables are set
- Verify key content is complete (including BEGIN/END)
- Make sure `.env` file is in the `backend/` directory

### "Failed to initialize APNs"
- Check key content formatting
- Verify Key ID and Team ID are correct
- Ensure bundle ID matches your app

### "Notifications not received"
- Check `NODE_ENV` matches your build type:
  - Development builds → `NODE_ENV=development`
  - App Store builds → `NODE_ENV=production`
- Verify device token is registered
- Check iOS Settings > Notifications > FetchNews

## Next Steps

Once configured:
1. Restart your backend server
2. Check logs for `[NOTIFICATIONS] APNs initialized`
3. Test with the diagnostic endpoint
4. Send a test notification from your app

