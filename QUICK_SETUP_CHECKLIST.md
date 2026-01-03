# Google Sign-In Quick Setup Checklist

## ✅ Completed Steps

- [x] Backend dependencies installed (`npm install` in backend folder)
- [x] Backend code updated with Google OAuth
- [x] iOS code updated with Google Sign-In
- [x] Podfile created
- [x] env.example updated with GOOGLE_CLIENT_ID

## 🔲 Remaining Steps

### 1. Install CocoaPods (if not installed)
```bash
# Option 1: Homebrew (recommended)
brew install cocoapods

# Option 2: RubyGems
sudo gem install cocoapods

# Option 3: Use setup script
cd /Library/FetchNews
./setup_google_signin.sh
```

### 2. Install iOS Dependencies
```bash
cd /Library/FetchNews
pod install
```

### 3. Google Cloud Console Setup
- [ ] Go to https://console.cloud.google.com/
- [ ] Create/select project
- [ ] Enable Google Sign-In API
- [ ] Configure OAuth consent screen
- [ ] Create iOS OAuth Client ID (save Client ID)
- [ ] Create Web OAuth Client ID (save Client ID - this goes in backend .env)

### 4. Add GoogleService-Info.plist
- [ ] Copy `GoogleService-Info.plist.template` to `GoogleService-Info.plist`
- [ ] Fill in iOS Client ID
- [ ] Fill in Reversed Client ID (format: `com.googleusercontent.apps.REVERSED_PART`)
- [ ] Add file to Xcode project (make sure it's in the target)

### 5. Update Info.plist
- [ ] Open `FetchNews/Info.plist`
- [ ] Replace `REVERSED_CLIENT_ID` with actual reversed client ID from step 4

### 6. Configure Backend Environment
- [ ] Add `GOOGLE_CLIENT_ID=your-web-client-id` to backend `.env` file
- [ ] Use the **Web application** Client ID (not iOS)

### 7. Test
- [ ] Open `FetchNews.xcworkspace` (NOT .xcodeproj)
- [ ] Build and run app
- [ ] Tap "Sign in with Google"
- [ ] Verify authentication works

## 📝 Important Notes

1. **Always use `.xcworkspace`** after installing pods, never `.xcodeproj`
2. **Backend uses Web Client ID**, iOS uses iOS Client ID
3. **Reversed Client ID** = `com.googleusercontent.apps.` + reversed part of iOS Client ID
   - Example: If iOS Client ID is `123456789-abc.apps.googleusercontent.com`
   - Reversed Client ID is `com.googleusercontent.apps.123456789-abc`

## 🆘 Need Help?

See `GOOGLE_SIGNIN_SETUP.md` for detailed instructions.



