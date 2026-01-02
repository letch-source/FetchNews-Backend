# Dynamic Fetch Titles Feature

## Overview
The app now generates dynamic, catchy titles for fetches using ChatGPT instead of the generic "Mixed Summary" label.

## What Changed

### Backend Changes (`backend/index.js`)

#### 1. New Function: `generateCatchyTitle(topics)`
Added a new helper function that:
- Returns simple titles for single topics: `"Technology Summary"`
- Uses ChatGPT (gpt-4o-mini) to generate engaging titles for multiple topics
- Creates titles like: `"Zohran becomes mayor, Fatal New Years fire, and more"`
- Falls back to "Mixed Summary" if ChatGPT fails or API key is missing

#### 2. Updated Endpoints
Modified three locations to use dynamic titles:
- `/api/summarize` - Manual fetch endpoint
- `/api/summarize/batch` - Batch fetch endpoint
- Push notification generation in batch endpoint

#### 3. Exported Function
Added `generateCatchyTitle` to module exports for potential use in other parts of the backend.

## How It Works

### Title Generation Process
1. User selects multiple topics (e.g., "Zohran Mamdani", "New Years Fire")
2. Backend calls `generateCatchyTitle(topics)`
3. ChatGPT generates a concise, newsworthy title following these guidelines:
   - 5-7 words maximum
   - Specific and mentions key topics
   - Present tense for ongoing stories
   - Ends with "and more" for 3+ diverse topics
   - Engaging and newsworthy

### Example Titles
**Before:** "Mixed Summary" (for all multi-topic fetches)

**After:** 
- "Zohran becomes mayor, Fatal New Years fire, and more"
- "Trump trial, Market rally, Tech layoffs"
- "Election results, Climate summit updates"
- "AI breakthroughs, Space launch success"

## iOS Integration
Updated three Swift files to prioritize backend-generated titles:
- `FetchScreen.swift` - Audio player bar now uses `vm.nowPlayingTitle` (from backend) first
- `ContentView.swift` - Summary card uses backend title with fallback
- `HomeView.swift` - Uses backend title with fallback
- `MainTabView.swift` - Already correctly uses `vm.nowPlayingTitle` from backend

These changes ensure the dynamic ChatGPT-generated titles are displayed throughout the app.

## Testing

### Manual Testing
1. Start the backend server: `cd backend && npm start`
2. Open the iOS app in simulator/device
3. Select 2-3 topics (e.g., "Technology", "Business", "Sports")
4. Tap "Fetch News"
5. Check the audio bar title - should show a dynamic, engaging title instead of "Mixed Summary"

### Example Test Cases
- **Single topic:** "Technology" → "Technology Summary"
- **Two topics:** "AI", "Climate" → e.g., "AI regulations, Climate summit talks"
- **Three+ topics:** "Politics", "Sports", "Tech" → e.g., "Election updates, Super Bowl preview, and more"

### Backend Logs
Look for these log messages to verify title generation:
```
[TITLE GENERATION] Generated title: "..." for topics: ...
```

## Performance Impact
- Adds ~100-300ms for ChatGPT title generation
- Uses gpt-4o-mini (fast and cost-effective)
- Max 30 tokens per title (very small API cost)
- Falls back gracefully if API fails

## Fallback Behavior
If ChatGPT is unavailable or fails:
- Falls back to "Mixed Summary" for multiple topics
- Single topics still get descriptive titles: `"[Topic] Summary"`
- No errors shown to user

## Future Enhancements
Consider:
- Cache generated titles for common topic combinations
- Allow users to edit/customize titles
- Add title generation for scheduled fetches (currently uses time-based names like "Morning Fetch")
- Generate titles in user's preferred language

## Configuration
No configuration needed! The feature works automatically when:
- `OPENAI_API_KEY` is set in environment variables
- User creates a fetch with multiple topics

If `OPENAI_API_KEY` is not configured, the system falls back to "Mixed Summary" behavior.
