# Google Sign-In Setup Guide

This guide explains how to complete the Google Sign-In integration for FetchNews.

## What Was Changed

### Backend Changes
1. **Updated `package.json`**: Added `google-auth-library` dependency
2. **Updated User Model**: Made password optional and added `googleId` field
3. **Replaced Auth Routes**: Removed email/password endpoints, added `/api/auth/google` endpoint

### iOS Changes
1. **Created Podfile**: Added Google Sign-In SDK dependency
2. **Updated ApiClient**: Replaced `register`/`login` with `authenticateWithGoogle`
3. **Updated AuthVM**: Replaced email/password methods with `signInWithGoogle()`
4. **Updated AuthView**: Shows only Google Sign-In button
5. **Updated WelcomeView**: Direct Google Sign-In button
6. **Updated Info.plist**: Added Google OAuth URL scheme placeholder

## Setup Steps

### 1. Backend Setup

#### Install Dependencies
```bash
cd /Library/FetchNews-Backend/backend
npm install
```

#### Configure Environment Variables
Add to your `.env` file:
```env
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### 2. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable **Google Sign-In API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure OAuth consent screen:
   - User Type: External (or Internal if using Google Workspace)
   - App name: FetchNews
   - Support email: your email
   - Scopes: `email`, `profile`, `openid`
6. Create OAuth 2.0 Client ID:
   - Application type: **iOS**
   - Bundle ID: `com.fetchnews.app` (or your actual bundle ID)
   - Save the **Client ID**
7. Create another OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Authorized redirect URIs: `https://fetchnews-backend.onrender.com/api/auth/google/callback`
   - Save the **Client ID** (this is what goes in `GOOGLE_CLIENT_ID`)

### 3. iOS Setup

#### Install CocoaPods (if not already installed)

**Option 1: Using Homebrew (recommended, no sudo required)**
```bash
brew install cocoapods
```

**Option 2: Using RubyGems (requires sudo)**
```bash
sudo gem install cocoapods
```

**Option 3: Use the setup script**
```bash
cd /Library/FetchNews
./setup_google_signin.sh
```

#### Install Pods
```bash
cd /Library/FetchNews
pod install
```

**Note**: After running `pod install`, you MUST open `FetchNews.xcworkspace` (not `.xcodeproj`) in Xcode.

#### Add GoogleService-Info.plist
1. Download `GoogleService-Info.plist` from Firebase Console (or create manually)
2. Add it to your Xcode project (make sure it's added to the target)
3. The file should contain:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
       <key>CLIENT_ID</key>
       <string>YOUR_IOS_CLIENT_ID.apps.googleusercontent.com</string>
       <key>REVERSED_CLIENT_ID</key>
       <string>com.googleusercontent.apps.YOUR_REVERSED_CLIENT_ID</string>
       <!-- Add other keys as needed -->
   </dict>
   </plist>
   ```

#### Update Info.plist
Replace `REVERSED_CLIENT_ID` in `Info.plist` with your actual reversed client ID from `GoogleService-Info.plist`.

#### Open Workspace (Not Project)
After running `pod install`, always open `FetchNews.xcworkspace` (not `.xcodeproj`)

### 4. Testing

1. **Backend**: Start your backend server
2. **iOS**: Build and run the app
3. **Test Flow**:
   - Tap "Sign in with Google"
   - Select Google account
   - Should authenticate and show main app

## Troubleshooting

### "Google Sign-In configuration not found"
- Make sure `GoogleService-Info.plist` is in your project and added to the target
- Check that `CLIENT_ID` key exists in the plist

### "Invalid Google token" (Backend)
- Verify `GOOGLE_CLIENT_ID` matches the **Web application** client ID (not iOS)
- Check that the client ID is correct in your `.env` file

### Pod Install Issues
- Make sure you're in the correct directory (`/Library/FetchNews`)
- Try `pod deintegrate` then `pod install` again
- Check that your `Podfile` is correct

### URL Scheme Issues
- Verify `REVERSED_CLIENT_ID` in `Info.plist` matches the one in `GoogleService-Info.plist`
- Make sure the URL scheme is properly formatted

## Migration Notes

### Existing Users
- Users with email/password accounts will need to sign in with Google
- Consider adding account linking if you want to preserve existing accounts
- The backend will auto-link accounts if email matches

### Removed Features
- Email/password registration
- Email/password login
- Password reset flow
- Email verification flow

These can be re-added later if needed, but Google Sign-In is now the primary authentication method.

## Next Steps

1. Complete Google Cloud Console setup
2. Install CocoaPods dependencies
3. Add `GoogleService-Info.plist` to project
4. Update `Info.plist` with reversed client ID
5. Test the authentication flow
6. Deploy backend with new environment variable

