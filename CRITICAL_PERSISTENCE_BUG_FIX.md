# Critical Persistence Bug Fix

## Issue Found
Voice selection and Daily Fetch settings were not persisting on Render **even with MongoDB connected**.

## Root Cause
**Critical Bug in `User.updatePreferences()` method:**

The retry counter in the save loop was **never being decremented**, causing the retry logic to fail:

```javascript
// BEFORE (BROKEN):
let retries = 3;
while (retries > 0) {
  try {
    await this.save();
    return this.getPreferences();
  } catch (error) {
    if (error.name === 'VersionError' && retries > 1) {
      // retries NEVER decremented! ❌
      // Would retry forever or fail incorrectly
    }
  }
}
```

```javascript
// AFTER (FIXED):
let retries = 3;
while (retries > 0) {
  try {
    await this.save();
    return this.getPreferences();
  } catch (error) {
    retries--; // ✅ NOW DECREMENTED
    if (error.name === 'VersionError' && retries > 0) {
      // Properly retries 3 times
    }
  }
}
```

## What This Caused

1. **Version Conflicts**: When concurrent saves occurred, the retry logic wouldn't properly handle them
2. **Silent Failures**: Saves might fail without proper error reporting
3. **Data Loss**: Preferences would appear to save but not persist to database

## Changes Made

### 1. Fixed Retry Logic (`backend/models/User.js`)
- ✅ Properly decrement `retries` counter
- ✅ Added logging for successful saves
- ✅ Added logging for retry attempts
- ✅ Better error messages

### 2. Enhanced Logging (`backend/routes/preferences.js`)
- ✅ Log MongoDB connection status
- ✅ Log selectedVoice values being saved
- ✅ Log whether MongoDB or fallback is used

### 3. Added Debug Endpoint
New endpoint: `GET /api/preferences/debug`

Returns:
```json
{
  "isMongoConnected": true,
  "middlewareUser": {
    "email": "user@example.com",
    "selectedVoice": "echo",
    "_id": "..."
  },
  "databaseUser": {
    "email": "user@example.com", 
    "selectedVoice": "echo",
    "_id": "..."
  },
  "match": true
}
```

## How to Verify Fix

### Step 1: Wait for Render Deploy
After pushing, Render will automatically deploy (2-3 minutes)

### Step 2: Test Voice Persistence

1. **Open your iOS app**
2. **Change voice** from "Alloy" to "Echo"
3. **Check Render logs** - you should see:
   ```
   [PREFERENCES] Updating preferences for user <email>
   [PREFERENCES] MongoDB readyState: 1
   [PREFERENCES] selectedVoice received: Echo
   [PREFERENCES] Using MongoDB for user <email>
   [USER] Successfully saved preferences for <email> - selectedVoice: echo
   [PREFERENCES] After update - selectedVoice: Echo
   ```

4. **Trigger Render restart**:
   - Render Dashboard → Your Service → Manual Deploy → Deploy latest commit

5. **Open app again** - Voice should still be "Echo" ✅

### Step 3: Test Daily Fetch Persistence

1. **Toggle Daily Fetch on**
2. **Check Render logs** for:
   ```
   [SCHEDULED_SUMMARY] Setting isEnabled to true for <email>
   ```

3. **Restart Render**
4. **Open app** - Daily Fetch should still be enabled ✅

### Step 4: Use Debug Endpoint (Optional)

```bash
# Get your auth token from the app (check localStorage or keychain)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://fetchnews-backend.onrender.com/api/preferences/debug
```

Should return `"match": true` indicating database and middleware user are in sync.

## Expected Logs

### Successful Save:
```
[PREFERENCES] Updating preferences for user finlaysmith@gmail.com
[PREFERENCES] MongoDB readyState: 1
[PREFERENCES] selectedVoice received: Echo
[PREFERENCES] Using MongoDB for user finlaysmith@gmail.com
[USER] Successfully saved preferences for finlaysmith@gmail.com - selectedVoice: echo
[PREFERENCES] After update - selectedVoice: Echo
```

### Version Conflict (Retry):
```
[USER] Version conflict, retrying... (2 retries left)
[USER] Successfully saved preferences on retry for finlaysmith@gmail.com - selectedVoice: echo
```

### Failure:
```
[USER] Failed to save preferences for finlaysmith@gmail.com: <error message>
```

## Why This Wasn't Noticed Before

- Retry logic failure was **silent** in many cases
- Local testing might not trigger version conflicts
- Render's concurrent request handling exposed the bug
- No logging made it hard to diagnose

## Additional Improvements

1. **Better error handling** in retry loop
2. **Nested try-catch** for retry saves
3. **Detailed logging** at each step
4. **Debug endpoint** for live troubleshooting

## If Issue Persists

If settings still don't persist after this fix:

1. **Check Render logs** for the new log messages
2. **Verify MongoDB is connected**: Look for `MongoDB connected successfully`
3. **Check for errors**: Look for `[USER] Failed to save preferences`
4. **Use debug endpoint**: Compare middleware vs database user
5. **Verify MONGODB_URI**: Render Dashboard → Environment → Check variable exists

## Related Files

- `/backend/models/User.js` - Fixed retry logic
- `/backend/routes/preferences.js` - Enhanced logging + debug endpoint
- `/backend/routes/scheduledSummaries.js` - Previously fixed for fallback auth

## Status

✅ **FIXED** - Deployed to main branch  
⏳ **PENDING** - Awaiting Render auto-deploy  
🧪 **NEEDS TESTING** - User verification required
