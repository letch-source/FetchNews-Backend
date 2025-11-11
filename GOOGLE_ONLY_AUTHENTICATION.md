# Google-Only Authentication Migration

This document describes the changes made to enforce Google-only authentication and remove all non-Google accounts.

## Changes Made

### 1. User Model Updates (`backend/models/User.js`)
- **Made `googleId` required**: Changed from optional (`sparse: true`) to required field
- **Added validation**: Pre-save hook ensures `googleId` is always present before saving
- **Password field**: Kept as optional for backwards compatibility but no longer used

### 2. Authentication Middleware (`backend/middleware/auth.js`)
- **`authenticateToken`**: Now checks that users have `googleId` before allowing access
- **`optionalAuth`**: Only sets `req.user` if the user has `googleId`

### 3. Google Sign-In Endpoint (`backend/routes/auth.js`)
- **Removed account linking**: No longer attempts to link Google accounts to existing email/password accounts
- **Google-only creation**: New users are only created via Google Sign-In
- **Fallback auth**: Updated to only support Google-authenticated users

### 4. Fallback Authentication (`backend/utils/fallbackAuth.js`)
- **Google-only methods**: Added `findUserByGoogleId()` and `createGoogleUser()`
- **Deprecated password auth**: `createUser()` now throws an error
- **Filtered lookups**: `findUserByEmail()` and `findUserById()` only return Google-authenticated users

### 5. Legacy Endpoints (`backend/index.js`)
- **Disabled `/api/auth/signup`**: Returns 403 error directing users to Google Sign-In
- **Disabled `/api/auth/login`**: Returns 403 error directing users to Google Sign-In

### 6. Cleanup Script (`backend/scripts/remove-non-google-accounts.js`)
- **Database cleanup**: Script to remove all users without `googleId`
- **Safety features**: 5-second delay before deletion, shows accounts to be deleted
- **Verification**: Confirms all remaining users have Google accounts

## Migration Steps

### Before Deploying Code Changes

1. **Run the cleanup script** to remove existing non-Google accounts:
   ```bash
   cd /Library/FetchNews-Backend/backend
   node scripts/remove-non-google-accounts.js
   ```

2. **Review the output** to ensure only non-Google accounts are being deleted

3. **Verify** that all remaining users have `googleId` set

### After Running Cleanup Script

1. **Deploy the code changes** - the new code enforces Google-only authentication

2. **Test Google Sign-In** to ensure new users can be created

3. **Monitor logs** for any authentication errors

## Important Notes

- **User Settings & Topics**: All user settings, topics, preferences, and summary history are preserved for Google-authenticated users
- **No Data Loss**: Only accounts without `googleId` are removed - all Google accounts remain intact
- **Backwards Compatibility**: Password-related fields remain in the schema but are no longer used
- **Error Handling**: Users without `googleId` will receive a clear error message directing them to use Google Sign-In

## Verification

After migration, verify:
- ✅ All users in database have `googleId` set
- ✅ Google Sign-In works for new users
- ✅ Existing Google users can still access their accounts
- ✅ User settings and topics are preserved
- ✅ Old signup/login endpoints return appropriate errors

## Rollback Plan

If issues occur:
1. Revert code changes (remove `required: true` from `googleId` in User model)
2. Restore from database backup if needed
3. Re-enable account linking in Google sign-in endpoint

