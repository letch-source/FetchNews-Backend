# TikTok-Style Topic Feed Implementation

## Overview

The FetchNews app has been transformed from a manual fetch system to a TikTok-style vertical scrolling feed where each screen represents a different news topic. This creates a more engaging, modern experience similar to short-form video apps.

## Key Changes

### 1. New TopicFeedView (Home Tab)

**Location:** `/Library/FetchNews/FetchNews/TopicFeedView.swift`

- **Vertical Paging:** Users can swipe up/down to scroll through topics like TikTok
- **Full-Screen Pages:** Each topic gets its own dedicated screen
- **Auto-Scroll:** When audio for one topic finishes, the view automatically scrolls to the next topic
- **Manual Scroll:** Users can skip topics they're not interested in by swiping
- **Page Indicators:** Dots at the bottom show current position in the feed

**Features:**
- Loading state with animated dog icon
- Empty state when no fetch is available
- Compact audio player at bottom
- Smooth transitions between topics

### 2. TopicPageView Component

**Location:** Included in `TopicFeedView.swift`

Each page displays:
- Topic position indicator (e.g., "1 of 5")
- Topic name as heading
- Summary text broken into paragraphs
- Related articles in expandable cards
- Proper spacing for audio player

### 3. New TopicsView (Tab 2)

**Location:** `/Library/FetchNews/FetchNews/TopicsView.swift`

Replaces the old manual fetch interface with a topic management screen:

- **Selected Topics:** Shows all currently selected topics
- **Trending Topics:** Displays trending news topics
- **Custom Topics:** User's custom topic list with browser access
- **Fetch Now Button:** Manual fetch for testing (can be removed later)
- **Info Box:** Explains how the system works

**Key Features:**
- Grid layout for all topic sections
- "Show all" / "Show less" toggles
- Delete selected custom topics
- Browse topics button
- Visual feedback for selected topics

### 4. Navigation Updates

**Location:** `/Library/FetchNews/FetchNews/MainTabView.swift`

New 5-tab structure:
1. **Home (house icon):** TopicFeedView - Vertical scrollable news feed
2. **Topics (tag icon):** TopicsView - Manage subscribed topics
3. **Customize (sliders icon):** PersonalizeView - Settings & preferences
4. **History (clock icon):** SummaryHistoryView - Past fetches
5. **Account (person icon):** AccountView - User account settings

### 5. NewsVM Enhancements

**Location:** `/Library/FetchNews/App/NewsVM.swift`

Added audio-scroll coordination:

```swift
@Published var currentTopicIndex: Int = 0
@Published var shouldAutoScroll: Bool = false
```

**Auto-Scroll Logic:**
- When audio finishes, `shouldAutoScroll` is set to `true`
- TopicFeedView observes this and scrolls to next topic
- Index is reset when new fetch completes

## User Experience Flow

### Old Flow
1. User opens app → HomeView with topic selection
2. Select topics manually
3. Tap "Fetch News" button
4. Wait for fetch to complete
5. Read all topics in one long text block

### New Flow
1. User opens app → TopicFeedView (TikTok-style feed)
2. If no fetch available, empty state shown
3. Swipe through topics like TikTok videos
4. Audio plays continuously, auto-scrolls between topics
5. Can manually skip topics by swiping
6. Manage topics in Topics tab (Tab 2)
7. Fetches happen automatically via scheduled summaries or manual trigger

## Architecture

```
┌─────────────────────────────────────┐
│       TopicFeedView (Home)          │
│   ┌─────────────────────────────┐   │
│   │   TopicPageView (Topic 1)   │   │
│   │   - Topic name               │   │
│   │   - Summary paragraphs       │   │
│   │   - Related articles         │   │
│   └─────────────────────────────┘   │
│   ┌─────────────────────────────┐   │
│   │   TopicPageView (Topic 2)   │   │
│   └─────────────────────────────┘   │
│   ┌─────────────────────────────┐   │
│   │   TopicPageView (Topic 3)   │   │
│   └─────────────────────────────┘   │
│                                     │
│   [Compact Audio Player]            │
│   [Page Indicators: ● ○ ○]          │
└─────────────────────────────────────┘
```

## Audio & Scrolling Synchronization

1. **Audio Playback:** Continuous across all topics in a fetch
2. **End of Audio:** Triggers auto-scroll to next topic
3. **Manual Scroll:** User can skip ahead/back anytime
4. **Audio State:** Preserved during manual scrolling

## Data Flow

```
User selects topics → Topics stored in NewsVM.selectedTopics
                   ↓
        Scheduled/Manual fetch triggered
                   ↓
        Backend returns Combined with topicSections[]
                   ↓
        TopicFeedView displays each topic as a page
                   ↓
        Audio plays, auto-scrolls between topics
```

## Components Used

- **TabView:** For vertical paging with `.page` style
- **ScrollView:** For content within each topic page
- **GeometryReader:** For responsive layout
- **@Published Properties:** For state management
- **onChange Modifiers:** For scroll coordination

## Future Enhancements

1. **Per-Topic Audio:** Split audio by topic with timing data
2. **Topic-Specific Controls:** Skip to next topic button
3. **Gesture Improvements:** Double-tap to play/pause
4. **Animations:** Smooth transitions and parallax effects
5. **Analytics:** Track which topics users engage with most
6. **Remove Manual Fetch:** Once scheduled fetches are stable

## Testing Checklist

- [x] Vertical scrolling works smoothly
- [x] Pages display correctly
- [x] Audio player visible at bottom
- [x] No linter errors
- [ ] Audio auto-scroll triggers correctly
- [ ] Manual scroll doesn't break audio
- [ ] Empty state displays properly
- [ ] Loading state shows during fetch
- [ ] Topic selection saves correctly
- [ ] Scheduled fetches populate feed

## Migration Notes

- **HomeView.swift:** Still exists but not used in main navigation
- **Old fetch button:** Moved to TopicsView for testing
- **Topic selection:** Now in dedicated TopicsView tab
- **Navigation:** Expanded from 4 to 5 tabs

## Files Modified

1. `/Library/FetchNews/FetchNews/TopicFeedView.swift` - NEW
2. `/Library/FetchNews/FetchNews/TopicsView.swift` - NEW
3. `/Library/FetchNews/FetchNews/MainTabView.swift` - MODIFIED
4. `/Library/FetchNews/App/NewsVM.swift` - MODIFIED

## Files Unchanged (but referenced)

- `/Library/FetchNews/FetchNews/HomeView.swift` - Still exists, not used
- `/Library/FetchNews/FetchNews/FetchScreen.swift` - Unchanged
- `/Library/FetchNews/FetchNews/PersonalizeView.swift` - Still used for settings
- `/Library/FetchNews/App/Models.swift` - No changes needed

---

**Status:** ✅ Implementation complete, ready for testing
**Last Updated:** January 2, 2026
