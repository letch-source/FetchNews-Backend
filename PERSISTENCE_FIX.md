# Voice Selection & Daily Fetch Persistence Fix

## Problem
Voice selection and Daily Fetch on/off settings were not persisting between backend restarts.

## Root Cause
The scheduled summaries routes (`/api/scheduled-summaries`) did not properly support fallback authentication. They always attempted to use MongoDB's `User.findById()` and `user.save()` methods without checking if MongoDB was connected.

When the backend was running without MongoDB (using fallback file-based authentication), the scheduled summaries changes would appear to work during the session but wouldn't persist to disk.

## Solution
Updated all scheduled summaries routes to check MongoDB connection status and use fallback authentication when needed:

### Routes Fixed
1. **GET `/api/scheduled-summaries`** - Now checks `mongoose.connection.readyState` and uses `fallbackAuth` when MongoDB is not connected
2. **POST `/api/scheduled-summaries`** - Added fallback auth support
3. **PUT `/api/scheduled-summaries/:id`** - Added fallback auth support (main route for toggling Daily Fetch on/off)
4. **DELETE `/api/scheduled-summaries/:id`** - Added fallback auth support

### Code Pattern
```javascript
if (mongoose.connection.readyState === 1) {
  // Use MongoDB
  user = await User.findById(req.user._id);
  // ... update user ...
  await saveUserWithRetry(user);
} else {
  // Use fallback authentication
  user = req.user;
  // ... update user ...
  await fallbackAuth.updatePreferences(user, { scheduledSummaries: user.scheduledSummaries });
}
```

## What's Fixed
- ✅ **Voice selection** - Already had fallback auth support in `/api/preferences`, but now verified
- ✅ **Daily Fetch on/off** - Now properly saves with fallback auth support in scheduled summaries routes
- ✅ **Scheduled summary settings** - Topics, time, days, word count all persist correctly
- ✅ **All changes persist between backend restarts** - Whether using MongoDB or fallback file-based auth

## Files Modified
- `/Library/FetchNews/backend/routes/scheduledSummaries.js`
  - Added MongoDB connection checks to GET, POST, PUT, and DELETE routes
  - Added fallback authentication handling
  - Added logging for `isEnabled` state changes

## Testing
To test the fix:
1. Change voice selection in the app
2. Toggle Daily Fetch on/off
3. Restart the backend server
4. Verify settings persist after restart

## Technical Details
- Fallback auth saves user data to `/Library/FetchNews/backend/server_data/fallback_users.json`
- MongoDB saves user data to the configured MongoDB database
- The `authenticateToken` middleware automatically loads users from the appropriate source
- Routes now properly handle both data sources when saving changes
