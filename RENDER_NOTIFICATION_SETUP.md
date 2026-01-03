# Setting Up Notifications on Render

## Quick Answer
**No, you don't need a `.env` file for Render!** Set environment variables directly in Render's dashboard.

## Step-by-Step for Render

### 1. Get Your APNs Credentials
Follow steps 1-3 from `BACKEND_NOTIFICATION_SETUP_STEPS.md` to get:
- Team ID
- Key ID  
- .p8 key file content

### 2. Set Environment Variables in Render

1. Go to your Render dashboard
2. Select your backend service
3. Click on **"Environment"** tab
4. Click **"Add Environment Variable"** for each:

#### Required Variables:

**APN_KEY_ID**
- Key: `APN_KEY_ID`
- Value: Your Key ID (e.g., `ABC123DEFG`)

**APN_TEAM_ID**
- Key: `APN_TEAM_ID`
- Value: Your Team ID (e.g., `XYZ789ABCD`)

**APN_BUNDLE_ID**
- Key: `APN_BUNDLE_ID`
- Value: `com.finlaysmith.FetchNews`

**APN_KEY_CONTENT**
- Key: `APN_KEY_CONTENT`
- Value: Paste the **ENTIRE** contents of your `.p8` file:
  ```
  -----BEGIN PRIVATE KEY-----
  MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
  (all the key content)
  ...
  -----END PRIVATE KEY-----
  ```

**NODE_ENV**
- Key: `NODE_ENV`
- Value: `production` (for App Store builds)

### 3. Formatting APN_KEY_CONTENT in Render

Render supports multi-line environment variables. When pasting:

1. Click the text area for `APN_KEY_CONTENT`
2. Paste the entire key content exactly as it appears in your `.p8` file
3. Include the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines
4. Don't add quotes or extra formatting

Example:
```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
(lots of characters)
...
-----END PRIVATE KEY-----
```

### 4. Redeploy

After adding all variables:
1. Click **"Save Changes"**
2. Render will automatically redeploy your service
3. Check the deployment logs for:
   ```
   [NOTIFICATIONS] APNs initialized (production)
   ```

### 5. Verify Setup

Once deployed, test with:
```bash
GET https://your-render-url.onrender.com/api/notifications/diagnostics
```

Should return:
```json
{
  "apns": {
    "configured": true,
    "environment": "production",
    ...
  }
}
```

## Troubleshooting

**"APNs not configured" in logs:**
- Check all variables are set in Render dashboard
- Verify `APN_KEY_CONTENT` includes BEGIN/END lines
- Make sure you saved and redeployed

**"Failed to initialize APNs":**
- Check Key ID and Team ID are correct
- Verify key content is complete
- Ensure no extra quotes or formatting

**Notifications not working:**
- Verify `NODE_ENV=production` for App Store builds
- Check device token is registered
- Verify bundle ID matches your app

## Local Development (Optional)

If you want to test locally, you can:
1. Create a `.env` file in `backend/` directory
2. Use `NODE_ENV=development` for local testing
3. This is optional - only needed if testing notifications locally

## Summary

✅ **Render**: Set environment variables in dashboard (no `.env` file needed)  
✅ **Local**: Optional `.env` file for local testing  
✅ **Both**: Same variable names, just different ways to set them



