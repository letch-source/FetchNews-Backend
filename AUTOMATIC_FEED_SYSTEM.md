# Automatic Feed System - No Manual Fetching

## Overview

The FetchNews app now operates as a fully automatic news feed system. Users no longer manually fetch news - instead, they select topics that interest them, and the app automatically populates their feed at 6am and 6pm daily.

## Key Changes from Previous Version

### What Was Removed
- ❌ Manual "Fetch News" button
- ❌ Concept of "fetching" as a user action
- ❌ Topic selection for individual fetches

### What Was Added
- ✅ Permanent topic subscriptions ("My Topics")
- ✅ Automatic 6am and 6pm feed updates
- ✅ Next update time indicator
- ✅ Automatic schedule setup on login

## How It Works

### User Experience

1. **Select Topics** (Topics Tab)
   - User browses and selects topics they're interested in
   - Topics are saved as permanent subscriptions
   - No need to re-select topics each time

2. **Automatic Updates**
   - Feed updates automatically at 6:00 AM (morning news)
   - Feed updates automatically at 6:00 PM (evening news)
   - User receives notification when new content is ready

3. **View Feed** (Home Tab)
   - Swipe through topics like TikTok
   - Each topic gets its own screen
   - Audio plays continuously, auto-scrolls between topics
   - Skip topics by swiping

### Topic Management

**Topics Tab (Tab 2):**
- Select from trending topics
- Browse and add custom topics
- Delete topics you're no longer interested in
- Topics stay selected permanently until you remove them

**Visual Indicators:**
- 🌅 Sunrise icon for 6am updates
- 🌆 Sunset icon for 6pm updates
- "Next update: Today at 6:00 PM" countdown

## Technical Implementation

### Automatic Schedule Setup

When a user logs in, the app automatically creates two scheduled summaries:

```swift
// In NewsVM.swift - ensureAutomaticFetchSchedule()

Morning Schedule:
- Time: 06:00 (6am)
- Days: All days (Monday-Sunday)
- Topics: User's selected topics
- Enabled: true

Evening Schedule:
- Time: 18:00 (6pm)
- Days: All days (Monday-Sunday)
- Topics: User's selected topics
- Enabled: true
```

### Topic Synchronization

```
User selects topics → Saved to NewsVM.selectedTopics
                   ↓
        Synced to backend immediately
                   ↓
        Used in 6am/6pm scheduled fetches
                   ↓
        Backend generates summaries automatically
                   ↓
        Feed populates with new content
                   ↓
        User receives notification
```

### Data Flow

```
6am/6pm Trigger (Backend Cron)
        ↓
Backend fetches articles for user's topics
        ↓
Backend generates summaries with topicSections
        ↓
Backend saves to user's history
        ↓
App checks for new summaries (periodic polling)
        ↓
TopicFeedView displays new content
        ↓
User swipes through topics
```

## UI Updates

### TopicsView (Tab 2)

**Before:**
```
- Select topics
- "Fetch Now" button
- "Topics will be included in your fetches"
```

**After:**
```
- Select topics (permanent subscriptions)
- No fetch button
- "Feed updates automatically at 6am and 6pm"
- Visual schedule indicator with sunrise/sunset icons
```

### TopicFeedView (Home Tab)

**Before:**
```
Empty state: "Your topics are ready. We'll fetch news 
automatically based on your schedule."
```

**After:**
```
Empty state: "Your feed will update automatically at 
6am and 6pm daily with news from your selected topics."

Next update: Today at 6:00 PM
```

## Backend Requirements

The backend must:

1. **Run Cron Jobs** at 6am and 6pm (in user's timezone)
2. **Fetch Articles** for each user's selected topics
3. **Generate Summaries** with topicSections structure
4. **Save to History** so app can retrieve them
5. **Send Notifications** when new content is ready

### Scheduled Summary Structure

```json
{
  "id": "uuid",
  "name": "Morning News" or "Evening News",
  "time": "06:00" or "18:00",
  "topics": ["technology", "business", "sports"],
  "customTopics": [],
  "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  "isEnabled": true,
  "createdAt": "2026-01-02T12:00:00Z",
  "lastRun": "2026-01-02T06:00:00Z"
}
```

## User Journey

### First Time User

1. **Sign Up** → Account created
2. **Topic Onboarding** → Select 6+ topics
3. **Automatic Setup** → 6am/6pm schedules created
4. **Wait** → Next scheduled update (6am or 6pm)
5. **Notification** → "Your morning news is ready!"
6. **Open App** → Feed populated with topics
7. **Swipe** → Browse through topics

### Returning User

1. **Open App** → See latest feed (from 6am or 6pm)
2. **Swipe** → Browse topics
3. **Manage Topics** → Add/remove topics in Topics tab
4. **Wait** → Next update happens automatically

### Changing Topics

1. **Open Topics Tab**
2. **Add/Remove Topics** → Changes saved immediately
3. **Next Update** → New topics included in 6am/6pm fetch
4. **Feed Updates** → Reflects new topic selection

## Files Modified

### New/Updated Files

1. **TopicsView.swift**
   - Removed manual fetch button
   - Updated description text
   - Added visual schedule indicator
   - Improved info box with sunrise/sunset icons

2. **TopicFeedView.swift**
   - Updated empty state message
   - Added next update time calculator
   - Shows countdown to next 6am/6pm update

3. **NewsVM.swift**
   - Added `ensureAutomaticFetchSchedule()` function
   - Automatically creates 6am/6pm schedules on login
   - Syncs selected topics to schedules

4. **AUTOMATIC_FEED_SYSTEM.md** (this file)
   - Complete documentation of automatic system

## Configuration

### Update Times

Currently hardcoded to:
- **Morning:** 6:00 AM (local time)
- **Evening:** 6:00 PM (local time)

To change these times, modify:
- `TopicFeedView.swift` - `nextUpdateTime()` function
- `NewsVM.swift` - `ensureAutomaticFetchSchedule()` function
- Backend cron job schedules

### Timezone Handling

- App uses user's local timezone
- Backend receives timezone identifier
- Schedules are created in user's timezone
- Backend cron jobs respect timezone settings

## Testing Checklist

- [ ] New user gets automatic 6am/6pm schedules on signup
- [ ] Existing users get schedules added on next login
- [ ] Topics tab shows correct messaging (no fetch button)
- [ ] Empty state shows next update time correctly
- [ ] Next update time calculates correctly for:
  - [ ] Before 6am (shows "Today at 6:00 AM")
  - [ ] Between 6am-6pm (shows "Today at 6:00 PM")
  - [ ] After 6pm (shows "Tomorrow at 6:00 AM")
- [ ] Backend cron jobs run at 6am/6pm
- [ ] Feed populates after scheduled fetch
- [ ] Notifications sent when content ready
- [ ] Topic changes sync to scheduled fetches

## Troubleshooting

### Feed Not Updating

1. Check backend cron jobs are running
2. Verify scheduled summaries exist (2 per user)
3. Check user has selected topics
4. Verify backend can fetch articles for topics
5. Check notification permissions

### Wrong Update Time

1. Verify user's timezone is correct
2. Check scheduled summary times (should be 06:00 and 18:00)
3. Ensure backend respects timezone
4. Check `nextUpdateTime()` calculation

### Topics Not Syncing

1. Verify `selectedTopics` saves to backend
2. Check scheduled summaries have correct topics
3. Ensure `ensureAutomaticFetchSchedule()` runs on login
4. Check backend updates scheduled summaries

## Future Enhancements

1. **Customizable Times** - Let users choose update times
2. **Weekend Mode** - Different schedule for weekends
3. **Breaking News** - Push updates for major stories
4. **Smart Scheduling** - Learn user's reading patterns
5. **Timezone Travel** - Auto-adjust when traveling
6. **Offline Mode** - Cache content for offline reading

## Migration Notes

### For Existing Users

- Old manual fetch functionality still works (backend)
- New automatic schedules created on next login
- Old scheduled summaries remain unchanged
- Users can delete old schedules if desired

### For Developers

- `vm.fetch()` function still exists but not exposed in UI
- Can be used for testing or admin features
- Scheduled summary system handles all user-facing fetches
- Manual fetch can be re-enabled if needed

---

**Status:** ✅ Implementation Complete
**Last Updated:** January 2, 2026
**System:** Fully Automatic Feed with 6am/6pm Updates
