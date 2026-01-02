# Summary Length Persistence Fix

## Problem
The Summary Length setting was not persisting between app sessions, while other settings like Voice, Playback Rate, and Uplifting News Only were saving correctly.

## Root Cause
In the backend User model (`backend/models/User.js`), the Summary Length was stored inconsistently:
- **Other settings** (selectedVoice, playbackRate, upliftingNewsOnly) were stored as **direct fields** in the User schema
- **Summary Length** was stored in a nested `preferences` object: `preferences.length`

This inconsistency caused persistence issues because:
1. Direct schema fields have proper MongoDB change tracking
2. Nested objects in a generic `Object` type field don't always trigger proper change detection
3. This led to the summary length not being saved reliably between sessions

## Solution
Added `summaryLength` as a **direct field** in the User schema, matching how other settings are stored.

### Files Modified

#### 1. `/backend/models/User.js`
- **Added** direct schema field `summaryLength` (line 107-110):
  ```javascript
  summaryLength: {
    type: String,
    default: '200'
  }
  ```
- **Updated** `getPreferences()` method to return `this.summaryLength` instead of `this.preferences?.length`
- **Updated** `updatePreferences()` method to save to `this.summaryLength` field
- **Removed** code that updated the nested `preferences.length` object

#### 2. `/backend/utils/fallbackAuth.js`
- **Added** `summaryLength: '200'` to `createGoogleUser()` function
- **Updated** `getPreferences()` to return `user.summaryLength` instead of `user.preferences?.length`
- **Updated** `updatePreferences()` to save to `user.summaryLength` field
- **Added** migration logic in `deserializeUser()` to migrate existing users' `preferences.length` to `summaryLength`
- **Fixed** `excludedNewsSources` field to match the main User model (bonus fix)

## Benefits
1. ✅ Summary Length now persists correctly between app sessions
2. ✅ Consistent with how other user settings are stored
3. ✅ Better MongoDB change tracking
4. ✅ Backward compatible - existing users' preferences will be migrated automatically

## Migration

### Automatic Migration (Fallback Auth)
The fallback auth system includes automatic migration in the `deserializeUser()` function:
- When loading users from disk, if `summaryLength` is missing, it migrates from `preferences.length`
- No manual intervention needed for fallback auth users

### MongoDB Migration
For users stored in MongoDB, run the migration script after deploying the backend changes:

```bash
cd /Library/FetchNews
node backend/scripts/migrate-summary-length.js
```

This script will:
- Find all users with `preferences.length` but no `summaryLength`
- Copy their preferences.length value to the new summaryLength field
- Log the migration progress
- Safe to run multiple times (idempotent)

**Note:** You can also skip running the migration script - the code will still work, but users who had previously set a non-default summary length will see it reset to the default until they change it again.

## Testing Recommendations
1. Test that Summary Length persists after:
   - Closing and reopening the app
   - Logging out and back in
   - Switching between devices (if using same account)
2. Verify existing users' Summary Length preferences are preserved
3. Test with both MongoDB and fallback authentication

## Deployment Instructions

1. **Deploy Backend Changes**
   ```bash
   # If using git, commit the changes
   git add backend/models/User.js backend/utils/fallbackAuth.js
   git commit -m "Fix: Summary Length persistence issue"
   
   # Deploy to your backend server
   # (Method depends on your deployment setup - Render, Heroku, etc.)
   ```

2. **Run Migration (Optional but Recommended)**
   ```bash
   # SSH into your backend server or run locally if you have DB access
   node backend/scripts/migrate-summary-length.js
   ```

3. **Restart Backend**
   - The backend needs to restart to pick up the new User model schema
   - If using Render/Heroku, this happens automatically on deploy
   - If running locally: restart your Node.js server

4. **No iOS App Changes Needed**
   - The iOS app doesn't need any updates
   - The API contract remains the same
   - Users will see the fix immediately after backend deployment

## Notes
- The API contract remains unchanged - the frontend still sends/receives `length` in preferences
- The change is transparent to the iOS app
- All backend settings now use consistent direct schema fields
- The fix ensures proper MongoDB change tracking for the summary length setting
