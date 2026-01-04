# Welcome Screen Feature - Testing Guide

## Quick Test Guide

Follow these steps to test the new welcome screen feature.

---

## Step 1: Start Backend Server

```bash
cd /Library/FetchNews/backend
npm start
```

**Expected output:**
```
Server listening on http://localhost:8000
MongoDB connected
✅ Server ready
```

---

## Step 2: Test Welcome Endpoint (Optional)

Open a new terminal and test the endpoint directly:

```bash
# Get your auth token from the app or login
TOKEN="your_auth_token_here"

curl -X POST http://localhost:8000/api/generate-welcome \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

**Expected response:**
```json
{
  "id": "welcome-1736006400000",
  "topic": "Welcome",
  "summary": "Hello [YourName], here's your morning news for Sunday, January 4.",
  "articles": [],
  "audioUrl": "https://..."
}
```

**Verify:**
- ✅ Message includes your name (or "there" if no name set)
- ✅ Time of day is correct (morning/afternoon/evening)
- ✅ Date format is correct
- ✅ audioUrl is present and valid

---

## Step 3: Test in iOS App

### 3a. Build and Run
1. Open `FetchNews.xcworkspace` in Xcode
2. Select iOS Simulator (iPhone 15 Pro recommended)
3. Press `⌘ + R` to build and run

### 3b. Navigate to Feed
1. Login with your account
2. Make sure you have selected topics
3. Fetch news (if you haven't already)
4. Navigate to the Feed tab

### 3c. Verify Welcome Screen

**You should see:**
- 🎨 Gradient background (blue → purple → dark)
- 🔉 Waveform icon with gradient
- 📝 Welcome message: "Hello [Name], here's your [time] news for [date]"
- ⬆️ "Swipe up to start" hint at bottom
- 🎵 Audio player at bottom

**Test interactions:**
- ✅ Audio auto-plays when screen appears
- ✅ Can tap play/pause button
- ✅ Can scrub through audio
- ✅ Swipe up advances to first topic
- ✅ When audio finishes, automatically advances to first topic

### 3d. Verify Auto-Advance

**Test scenario:**
1. Let welcome audio play completely
2. Do not swipe or interact
3. Watch the screen

**Expected behavior:**
- ⏱️ After audio finishes (~5-10 seconds)
- 🎬 Screen animates upward
- 📰 First selected topic appears
- 🎵 First topic's audio starts playing

---

## Step 4: Test Edge Cases

### Test A: No Name Set
1. Go to Settings/Profile
2. Clear your name
3. Go back to Feed
4. Pull to refresh

**Expected:**
```
Hello there, here's your morning news for [date]
```

### Test B: Different Times of Day
Use Xcode's date/time override or test at different times:

- **Morning (9 AM)**: "...morning news..."
- **Afternoon (2 PM)**: "...afternoon news..."
- **Evening (7 PM)**: "...evening news..."

### Test C: No Topics Selected
1. Go to Topics
2. Deselect all topics
3. Go to Feed

**Expected:**
- ⚠️ No welcome screen shown
- 💡 Empty state or topic discovery shown instead

### Test D: Network Error
1. Disable WiFi on simulator
2. Pull to refresh on Feed

**Expected:**
- ⚠️ Welcome fetch fails silently
- 📰 Topics show normally (if already fetched)
- 💡 No crash or error alert

### Test E: Welcome Then Topics
1. Start on welcome screen
2. Let audio finish (auto-advance)
3. Let first topic audio finish
4. Verify advances to second topic
5. Swipe down to go back to first topic
6. Swipe down again to go back to welcome

**Expected:**
- ✅ Smooth animations between all screens
- ✅ Audio switches correctly
- ✅ Can navigate back to welcome screen
- ✅ Welcome audio doesn't restart (continues from position)

---

## Step 5: Test Manual Swipe

### Test Scenario:
1. Open feed (welcome shows)
2. Don't wait for audio - immediately swipe up
3. Verify first topic appears
4. Verify audio switches to first topic's audio

**Expected:**
- ✅ Swipe gesture works immediately
- ✅ No need to wait for audio
- ✅ Audio switches smoothly
- ✅ No audio overlap or glitches

---

## Step 6: Verify Audio Quality

### Check Audio:
- ✅ Clear voice (no distortion)
- ✅ Natural pacing
- ✅ Correct voice (matches user's selected voice in settings)
- ✅ Correct speed (matches user's playback rate)
- ✅ No cuts or gaps
- ✅ Volume consistent with topic audio

---

## Step 7: Performance Testing

### Check Performance:
1. Note time from feed tap to welcome screen appearing
2. Should be < 2 seconds total

**Breakdown:**
- Welcome fetch: ~500-800ms
- Audio prepare: ~200-300ms
- UI render: ~100ms
- Total: ~1000ms typical, 2000ms max

**If slower:**
- Check network speed
- Check backend logs for TTS generation time
- Verify OpenAI API is responding quickly

---

## Debugging Common Issues

### Issue: Welcome screen doesn't appear

**Possible causes:**
1. No topics selected → Check Topics tab
2. Network error → Check backend logs
3. Auth token expired → Re-login
4. Backend endpoint not deployed → Check backend/index.js

**Debug:**
```swift
// Look for this in Xcode console:
📱 Loading welcome message...
✅ Welcome message loaded: "Hello..."
```

### Issue: Audio doesn't play

**Possible causes:**
1. TTS generation failed → Check backend logs
2. Audio URL invalid → Check response JSON
3. OpenAI API key missing → Check .env file
4. Network timeout → Check network connection

**Debug:**
```javascript
// Backend console should show:
🎤 [TTS] Generating audio for 1 chunk(s)...
✅ Audio generated successfully
```

### Issue: Auto-advance doesn't work

**Possible causes:**
1. Audio not finishing → Check audio duration
2. Observer not firing → Check NotificationCenter setup
3. Navigation blocked → Check currentPageIndex updates

**Debug:**
```swift
// Xcode console should show:
📄 Audio finished, auto-advancing to next topic...
✅ Advanced to topic 2/5
```

### Issue: Wrong greeting time

**Cause:** Server timezone vs. client timezone mismatch

**Fix:** Backend uses server time (UTC). Consider:
- Passing client timezone to backend
- Using client-side time for greeting

### Issue: Name shows as "there" when name is set

**Debug:**
1. Check user profile in app
2. Verify name is saved on backend
3. Check API response includes name field
4. Verify backend reads `req.user.name`

---

## Testing Checklist

Before considering complete:

**Backend:**
- [ ] Server starts without errors
- [ ] Welcome endpoint responds correctly
- [ ] TTS generates audio successfully
- [ ] Audio URL is valid and accessible
- [ ] Correct time of day for current hour
- [ ] Date format displays correctly
- [ ] User name included if set
- [ ] Defaults to "there" when no name

**iOS:**
- [ ] App builds without errors
- [ ] Welcome screen appears in feed
- [ ] Gradient background displays correctly
- [ ] Icon and text properly styled
- [ ] Audio player appears at bottom
- [ ] Audio auto-plays on load
- [ ] Can pause/play audio
- [ ] Can scrub audio
- [ ] Swipe up gesture works
- [ ] Auto-advance works when audio finishes
- [ ] Smooth animation to first topic
- [ ] Topic audio switches correctly
- [ ] Can swipe back to welcome
- [ ] Welcome doesn't show with no topics
- [ ] Handles network errors gracefully

**User Experience:**
- [ ] Feels welcoming and personal
- [ ] Text is easily readable
- [ ] Audio quality is good
- [ ] Transitions are smooth
- [ ] No lag or stuttering
- [ ] Intuitive to use
- [ ] Swipe hint is clear

---

## Success Criteria

The feature is working correctly if:

1. ✅ Welcome screen shows before topics
2. ✅ Message is personalized with name and time
3. ✅ Audio plays automatically
4. ✅ Auto-advances to first topic when audio finishes
5. ✅ Can manually swipe to skip ahead
6. ✅ No errors or crashes
7. ✅ Performance is good (< 2s load)
8. ✅ Handles edge cases gracefully

---

## Next Steps After Testing

1. **If tests pass:**
   - ✅ Feature is ready for production
   - Consider testing on real device (not just simulator)
   - Deploy backend updates
   - Submit iOS app update

2. **If issues found:**
   - 📝 Document issues in detail
   - 🐛 Debug using guides above
   - 🔧 Fix issues
   - ♻️ Re-test

3. **Optional enhancements:**
   - Cache welcome audio by date (same greeting all day)
   - Add settings toggle to enable/disable welcome
   - Add analytics to track usage
   - Experiment with different greeting styles

---

## Monitoring After Launch

Track these metrics:
- Welcome screen view rate
- Auto-advance completion rate
- Manual skip rate
- Average audio listen time
- Error rate (failed fetches)
- TTS generation time
- User feedback/reviews mentioning welcome

---

**Happy Testing!** 🎉

If you encounter any issues, check the logs in:
- **Backend**: `backend/logs/` directory
- **iOS**: Xcode console output
- **Network**: Charles/Proxyman for HTTP debugging
