# Per-Topic Audio & Vertical Scrolling Update

## Overview

Major UX improvements to the TikTok-style feed:
- **Per-topic audio** - Each topic has its own audio that plays only when viewing that topic
- **Vertical scrolling** - Scroll within each topic instead of swiping between them
- **Sticky header** - Topic name appears at top when scrolling
- **Fade effect** - Summary text fades as it scrolls behind the header
- **Articles button** - Articles moved behind a button at bottom of each topic
- **Recommended topics** - Additional topics shown after "My Topics"

## Key Changes

### 1. Per-Topic Audio System

**Before:**
- One continuous audio for entire feed
- Audio played through all topics
- No way to skip audio for specific topics

**After:**
- Each topic has its own audio URL
- Audio switches when changing topics
- Audio only plays for current topic
- Smooth transitions between topics

**Implementation:**

```swift
// Models.swift - TopicSection
struct TopicSection {
    let audioUrl: String? // NEW: Per-topic audio
}

// NewsVM.swift - Audio management
@Published var currentTopicAudioUrl: String?

func switchToTopicAudio(for topicSection: TopicSection, autoPlay: Bool) {
    // Switches audio when user changes topics
    // Maintains playback state if audio was playing
}
```

### 2. Vertical Scrolling Within Topics

**Before:**
- Horizontal/vertical swipe to change topics
- No scrolling within a topic
- All content visible at once

**After:**
- Vertical scrolling within each topic
- Swipe left/right to change topics (TabView)
- Content can be longer and more detailed

**Benefits:**
- More space for summary text
- Better readability
- Natural scrolling behavior
- Sticky header for context

### 3. Sticky Header with Fade Effect

**Before:**
- Topic name always visible at top
- No scroll feedback

**After:**
- Large topic name at top (36pt bold)
- When scrolling down, sticky header appears
- Summary text fades as it scrolls behind header
- Smooth animations

**Visual Effect:**
```
[Scrolled to top]
┌─────────────────────┐
│                     │
│   TECHNOLOGY        │ ← Large title
│   (36pt bold)       │
│                     │
│   Summary text...   │
│   More text...      │
└─────────────────────┘

[Scrolling down]
┌─────────────────────┐
│ Technology          │ ← Sticky header (appears)
├─────────────────────┤
│   [Fading text]     │ ← Fade gradient
│   Summary text...   │
│   More text...      │
└─────────────────────┘
```

### 4. Articles Behind Button

**Before:**
- Articles displayed inline
- Took up lots of space
- Cluttered interface

**After:**
- "View X Articles" button at bottom
- Opens sheet with all articles
- Clean, focused interface
- Easy to dismiss

**Button Design:**
```
┌──────────────────────────────┐
│ 📄 View 5 Articles        ›  │
└──────────────────────────────┘
```

### 5. Recommended Topics

**Before:**
- Only "My Topics" shown
- Feed ends after user's topics

**After:**
- "My Topics" shown first
- "Recommended" topics shown after
- Badges distinguish between them
- Infinite scroll potential

**Visual Indicators:**
- ⭐ "My Topics" - Yellow star badge
- ✨ "Recommended" - Purple sparkles badge

## Technical Implementation

### Data Structure

```swift
// Combined response with topic sections
struct Combined {
    let topicSections: [TopicSection]?
}

struct TopicSection {
    let id: String
    let topic: String
    let summary: String
    let articles: [Item]
    let audioUrl: String? // NEW
}
```

### Audio Management

```swift
// NewsVM.swift
class NewsVM {
    @Published var currentTopicAudioUrl: String?
    
    // Switch audio when topic changes
    func switchToTopicAudio(for topicSection: TopicSection, autoPlay: Bool) {
        guard let audioUrl = topicSection.audioUrl else { return }
        
        if currentTopicAudioUrl != audioUrl {
            let wasPlaying = isPlaying
            stopTopicAudio()
            prepareAudio(urlString: audioUrl, title: topicSection.topic)
            currentTopicAudioUrl = audioUrl
            
            if wasPlaying || autoPlay {
                playPause()
            }
        }
    }
}
```

### Scroll Detection

```swift
// VerticalTopicPageView
@State private var scrollOffset: CGFloat = 0
@State private var showStickyHeader: Bool = false

ScrollView {
    // Content with background geometry reader
}
.onPreferenceChange(ScrollOffsetPreferenceKey.self) { value in
    scrollOffset = value
    withAnimation {
        showStickyHeader = value < -20 // Show after 20pt scroll
    }
}
```

### Fade Effect

```swift
// Gradient overlay when scrolling
if showStickyHeader {
    LinearGradient(
        gradient: Gradient(stops: [
            .init(color: Color.darkGreyBackground, location: 0.0),
            .init(color: Color.darkGreyBackground.opacity(0), location: 1.0)
        ]),
        startPoint: .top,
        endPoint: .bottom
    )
    .frame(height: 100)
}
```

## User Experience Flow

### Viewing a Topic

1. **Topic appears** → Audio loads automatically
2. **Scroll down** → Read summary text
3. **Sticky header appears** → Topic name stays visible
4. **Text fades** → Smooth visual transition
5. **Tap articles button** → View related articles
6. **Swipe to next topic** → Audio switches automatically

### Audio Behavior

```
User on Topic A (audio playing)
        ↓
Swipe to Topic B
        ↓
Topic A audio stops
        ↓
Topic B audio loads
        ↓
Topic B audio plays automatically
```

### Topic Types

```
My Topics (1-5)
├── Technology ⭐
├── Business ⭐
├── Sports ⭐
└── Science ⭐

Recommended (6+)
├── Entertainment ✨
├── Health ✨
└── World News ✨
```

## Backend Requirements

### Audio Generation

Backend must generate **per-topic audio** instead of one combined audio:

```json
{
  "combined": {
    "topicSections": [
      {
        "id": "tech-123",
        "topic": "technology",
        "summary": "Tech news summary...",
        "audioUrl": "/media/tech-123.mp3",  // ← Per-topic audio
        "articles": [...]
      },
      {
        "id": "biz-456",
        "topic": "business",
        "summary": "Business news summary...",
        "audioUrl": "/media/biz-456.mp3",  // ← Per-topic audio
        "articles": [...]
      }
    ]
  }
}
```

### Recommended Topics

Backend should provide recommended topics based on:
- User's reading history
- Similar topics to "My Topics"
- Trending topics user hasn't selected
- Personalization algorithm

```javascript
// Backend endpoint (future)
GET /api/recommended-topics
Response: {
  recommendedTopics: [
    {
      topic: "entertainment",
      reason: "Similar to your interest in technology",
      confidence: 0.85
    }
  ]
}
```

## UI Components

### VerticalTopicPageView
- Main content view for each topic
- Handles scrolling and sticky header
- Manages audio playback
- Shows articles button

### CompactTopicAudioPlayer
- Bottom audio player
- Shows current topic name
- Play/pause controls
- Progress bar with scrubbing

### ArticlesSheetView
- Modal sheet for articles
- Scrollable list of article cards
- "Done" button to dismiss
- Clean, focused design

### ArticleCard
- Reusable article display
- Source, title, summary
- "Read more" link
- Compact design

## Visual Design

### Typography
- **Large Title**: 36pt bold (topic name)
- **Sticky Header**: Headline bold
- **Body Text**: System body
- **Captions**: System caption

### Colors
- **My Topics Badge**: Yellow star
- **Recommended Badge**: Purple sparkles
- **Articles Button**: Blue background
- **Fade Gradient**: Dark grey to transparent

### Spacing
- **Top Padding**: 80pt (for sticky header)
- **Content Padding**: 20pt horizontal
- **Paragraph Spacing**: 12pt
- **Button Padding**: 32pt top

## Performance Considerations

### Audio Caching
- Audio players cached per topic
- Smooth transitions between topics
- Minimal loading time

### Scroll Performance
- GeometryReader for scroll detection
- Preference keys for offset tracking
- Optimized animations

### Memory Management
- Audio players released when not needed
- Lazy loading of recommended topics
- Efficient view updates

## Testing Checklist

### Audio
- [ ] Audio loads for each topic
- [ ] Audio switches when changing topics
- [ ] Audio maintains playback state
- [ ] No audio overlap between topics
- [ ] Smooth transitions

### Scrolling
- [ ] Vertical scrolling works smoothly
- [ ] Sticky header appears at right time
- [ ] Fade effect looks natural
- [ ] No performance issues

### Articles
- [ ] Button shows correct count
- [ ] Sheet opens with all articles
- [ ] Sheet dismisses properly
- [ ] Articles display correctly

### Recommended Topics
- [ ] Recommended topics appear after My Topics
- [ ] Badges display correctly
- [ ] Position indicator updates
- [ ] Audio works for recommended topics

## Migration Notes

### From Previous Version

**Old TopicFeedView:**
- Horizontal TabView with full-screen pages
- One audio for entire feed
- Articles inline

**New TopicFeedView:**
- Vertical scrolling within topics
- Per-topic audio
- Articles behind button
- Sticky headers
- Recommended topics

### Backward Compatibility

- If `audioUrl` is missing from topic, gracefully handles it
- Falls back to combined audio if per-topic audio unavailable
- Works with old backend responses (no recommended topics)

## Future Enhancements

1. **Smart Recommendations**
   - ML-based topic suggestions
   - User behavior analysis
   - A/B testing for recommendations

2. **Audio Enhancements**
   - Crossfade between topics
   - Speed controls per topic
   - Audio bookmarks

3. **Visual Improvements**
   - Parallax scrolling effects
   - Animated transitions
   - Custom gestures

4. **Content Features**
   - Save articles for later
   - Share individual topics
   - Topic-specific feedback

## Files Modified

1. **Models.swift**
   - Added `audioUrl` to `TopicSection`
   - Updated initializers and decoders

2. **NewsVM.swift**
   - Added `currentTopicAudioUrl` property
   - Added `switchToTopicAudio()` function
   - Added `stopTopicAudio()` function
   - Added `playTopicAudio()` function

3. **TopicFeedView.swift**
   - Complete rewrite for vertical scrolling
   - Added `VerticalTopicPageView`
   - Added `CompactTopicAudioPlayer`
   - Added `ArticlesSheetView`
   - Added sticky header logic
   - Added fade effects
   - Added recommended topics support

## Summary

✅ **Per-topic audio** - Each topic has its own audio  
✅ **Vertical scrolling** - Natural scrolling within topics  
✅ **Sticky header** - Context preserved while scrolling  
✅ **Fade effect** - Smooth visual transitions  
✅ **Articles button** - Clean, focused interface  
✅ **Recommended topics** - Infinite content discovery  

**Status:** 🎉 Implementation Complete  
**Last Updated:** January 2, 2026  
**Version:** Per-Topic Audio v1.0
