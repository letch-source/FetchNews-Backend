# Scheduled Fetch Version Conflict Fix

## Problem
Your Daily Fetch was failing with a `VersionError` due to concurrent database operations causing Mongoose optimistic locking conflicts. The error showed:

```
VersionError: No matching document found for id "68f16990295159dddc5c537c" version 3657
modifiedPaths: preferences, scheduledSummaries, resetPasswordToken, resetPasswordExpires, 
emailVerificationToken, emailVerificationExpires
```

### Root Cause
Multiple concurrent operations were trying to update your user document at the same time:
1. The iOS app updating scheduled summary settings (topics, time, timezone)
2. The scheduler trying to update `lastRun` timestamp
3. Potentially auth operations modifying password/email verification tokens

The retry logic was:
- Only attempting 3 retries
- No delay between retries
- Trying to preserve ALL modified fields (including auth fields that shouldn't be touched by scheduled summary operations)

## Solution Implemented

### 1. **Increased Retry Count**
- Changed from 3 to 5 retries in both `scheduledSummaries.js` and `index.js`
- More attempts = higher success rate for transient conflicts

### 2. **Added Exponential Backoff with Jitter**
- Base delay increases exponentially: 100ms → 200ms → 400ms → 800ms → 1600ms
- Random jitter (0-50% of base delay) prevents "thundering herd" problem
- Gives time for concurrent operations to complete

### 3. **Field Filtering**
- **Before**: Tried to preserve ALL modified fields including auth-related ones
- **After**: Only preserves scheduler-related fields:
  - `scheduledSummaries`
  - `summaryHistory`
  - `dailyUsageCount`
  - `lastUsageDate`
  - `preferences` (only for timezone)
  - `selectedVoice`, `playbackRate`, etc.
  
- **Explicitly excludes**:
  - `resetPasswordToken`
  - `resetPasswordExpires`
  - `emailVerificationToken`
  - `emailVerificationExpires`

This prevents conflicts when auth operations run concurrently with scheduled fetch operations.

### 4. **Enhanced Logging**
Added logging to show:
- Which fields are being preserved during retry
- Which fields are being skipped as non-relevant
- Retry count and delay timing

## Files Modified

1. **`/Library/FetchNews/backend/routes/scheduledSummaries.js`**
   - Updated `saveUserWithRetry()` function
   - Added field filtering logic
   - Enhanced logging

2. **`/Library/FetchNews/backend/index.js`**
   - Updated `saveUserWithRetryForScheduler()` function
   - Added exponential backoff
   - Added field filtering for scheduler operations

## Expected Behavior

Your Daily Fetch should now:
✅ Execute successfully even with concurrent app usage
✅ Handle version conflicts gracefully with smart retries
✅ Complete within 1-2 seconds (including retries)
✅ Log clear information about any conflicts and resolutions

## Monitoring

Watch for these log patterns to confirm the fix is working:

**Success with retries:**
```
[SCHEDULED_SUMMARY] Version conflict, retrying in XXXms... (N retries left)
[SCHEDULED_SUMMARY] Preserving M field(s): scheduledSummaries, ...
[SCHEDULED_SUMMARY] Updated scheduled fetch for user@example.com - topics: X, isEnabled: true
```

**Successful execution:**
```
[SCHEDULER] Executing scheduled fetch "Daily Fetch" for user@example.com
[SCHEDULER] Successfully executed scheduled fetch "Daily Fetch"
```

## Additional Recommendations

### Client-Side (iOS App)
Consider adding debouncing to the scheduled summary settings update to prevent multiple rapid API calls:
- Debounce time: 500-1000ms
- Only send the final state after user stops making changes

### Database
If version conflicts persist even with these improvements:
- Consider using MongoDB transactions for atomic multi-field updates
- Implement a queue system for scheduled fetch executions
- Add rate limiting to the scheduled summary update endpoint

## Testing

To verify the fix:
1. Update your scheduled fetch settings from the iOS app
2. Wait for the scheduled time
3. Check logs for successful execution
4. Verify notification was sent
5. Check summary history for the new fetch

The next scheduled fetch should execute successfully! 🎉
