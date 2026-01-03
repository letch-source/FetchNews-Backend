# Backend Notification Setup - Quick Guide

## Current Status
✅ Bundle ID found: `com.finlaysmith.FetchNews`  
❌ APNs not configured yet

## Step-by-Step Setup

### Step 1: Get Your Apple Team ID

1. Go to: https://developer.apple.com/account/
2. Sign in with your Apple Developer account
3. Look at the **top right corner** - you'll see your Team ID
   - Format: `ABC123DEFG` (10 characters)
   - **Copy this** - you'll need it

### Step 2: Create APNs Key

1. Go to: https://developer.apple.com/account/resources/authkeys/list
2. Click the **"+"** button (top left)
3. Enter a name: `FetchNews APNs Key`
4. ✅ Check **"Apple Push Notifications service (APNs)"**
5. Click **"Continue"** → **"Register"**
6. **IMPORTANT**: Click **"Download"** immediately - you can only download once!
7. **Save the Key ID** shown on the page (e.g., `ABC123DEFG`)

### Step 3: Prepare the Key File

1. Find the downloaded file: `AuthKey_XXXXXXXXXX.p8`
2. Open it in a text editor (TextEdit, VS Code, etc.)
3. Copy the **ENTIRE contents** including:
   ```
   -----BEGIN PRIVATE KEY-----
   MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
   (lots of characters)
   ...
   -----END PRIVATE KEY-----
   ```

### Step 4: Create .env File

Create a file at: `/Library/FetchNews/backend/.env`

```env
# APNs Configuration for Push Notifications
APN_KEY_ID=YOUR_KEY_ID_HERE
APN_TEAM_ID=YOUR_TEAM_ID_HERE
APN_BUNDLE_ID=com.finlaysmith.FetchNews
APN_KEY_CONTENT=-----BEGIN PRIVATE KEY-----
PASTE_YOUR_ENTIRE_KEY_CONTENT_HERE
-----END PRIVATE KEY-----

# Use 'development' for testing, 'production' for App Store
NODE_ENV=development
```

**Replace:**
- `YOUR_KEY_ID_HERE` → Your Key ID from Step 2
- `YOUR_TEAM_ID_HERE` → Your Team ID from Step 1
- `PASTE_YOUR_ENTIRE_KEY_CONTENT_HERE` → The entire key content from Step 3

### Step 5: Verify Setup

1. Restart your backend server
2. Check the logs - you should see:
   ```
   [NOTIFICATIONS] APNs initialized (development)
   ```
3. If you see `APNs not configured`, check:
   - All variables are set
   - Key content includes BEGIN/END lines
   - No extra quotes or spaces

### Step 6: Test It

Use the diagnostic endpoint:
```bash
GET /api/notifications/diagnostics
```

Should show:
```json
{
  "apns": {
    "configured": true,
    ...
  }
}
```

## Common Issues

**"APNs not configured"**
- Missing environment variables
- Key content not properly formatted
- .env file in wrong location

**"Failed to initialize APNs"**
- Wrong Key ID or Team ID
- Key content missing BEGIN/END lines
- Bundle ID mismatch

## Need Help?

See `BACKEND_NOTIFICATION_SETUP_STEPS.md` for detailed instructions.



