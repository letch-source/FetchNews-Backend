# Fix: UI Not Updating After Archive

## Problem
After archiving and uploading a new version, the UI shows the old version instead of the updated one.

## Root Cause
The project uses Xcode's file system synchronization feature, which automatically includes all Swift files in the `FetchNews` folder. However, when archiving, Xcode may use cached build artifacts that don't include the latest UI changes.

## Solution Steps

### 1. Clean Build Folder and Derived Data
In Xcode:
- **Product → Clean Build Folder** (Shift + Cmd + K)
- Close Xcode
- Delete derived data:
  ```bash
  rm -rf ~/Library/Developer/Xcode/DerivedData/FetchNews-*
  ```

### 2. Verify UI Files Are Present
All UI files should be in `/Library/FetchNews/FetchNews/`:
- ✅ MainTabView.swift
- ✅ SummaryHistoryView.swift
- ✅ HomeView.swift
- ✅ PersonalizeView.swift
- ✅ FetchNewsApp.swift (with `useNewUI = true`)

### 3. Rebuild from Scratch
1. Open Xcode
2. **Product → Clean Build Folder** again
3. Build the project: **Product → Build** (Cmd + B)
4. Verify it builds successfully

### 4. Archive Properly
1. Select **Any iOS Device** (not a simulator) as the build destination
2. **Product → Archive**
3. Wait for the archive to complete
4. In the Organizer window, verify the archive was created successfully

### 5. Verify Archive Contents (Optional)
To verify the UI files are in the archive:
1. Right-click the archive in Organizer
2. Select **Show in Finder**
3. Right-click the `.xcarchive` file
4. Select **Show Package Contents**
5. Navigate to `Products/Applications/FetchNews.app`
6. Right-click and **Show Package Contents**
7. Verify the binary exists and is recent

### 6. Upload to App Store Connect
1. In Organizer, select your archive
2. Click **Distribute App**
3. Follow the distribution wizard
4. Make sure you're uploading the correct archive (check the date/time)

## Additional Checks

### Verify useNewUI Flag
In `FetchNewsApp.swift`, ensure:
```swift
private let useNewUI = true  // Should be true for new UI
```

### Check Build Configuration
When archiving, make sure:
- Configuration is set to **Release**
- Scheme is set to **FetchNews**
- Build destination is **Any iOS Device** (not simulator)

## If Problem Persists

1. **Check Xcode Version**: Ensure you're using a recent version of Xcode
2. **Restart Xcode**: Sometimes Xcode needs a restart to pick up file system changes
3. **Check File Timestamps**: Verify the UI files have recent modification dates
4. **Manual File Addition** (last resort): If file system sync isn't working, you may need to manually add files to the project:
   - Right-click the `FetchNews` folder in Xcode
   - Select "Add Files to FetchNews..."
   - Select the UI files
   - Make sure "Copy items if needed" is unchecked
   - Make sure "Create groups" is selected
   - Make sure the FetchNews target is checked

## Prevention
- Always clean build folder before archiving
- Verify builds work in Debug before archiving
- Check that `useNewUI` flag is set correctly
- Use version control to track changes

