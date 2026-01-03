# Topic-Level Feedback Implementation

## Overview
Implemented a proper topic-level feedback system that allows users to give thumbs up/down feedback at the end of each topic in their news summary. This provides accurate, granular feedback for training personalization algorithms.

## What Changed

### Backend Changes (`/Library/FetchNews-Backend/backend/index.js`)

1. **Structured Topic Data**: Modified `/api/summarize` and `/api/summarize/batch` endpoints to return structured topic sections
   - Each topic section includes: topic name, summary text, and associated articles
   - Maintains backward compatibility with existing summary text

2. **Response Structure**:
```javascript
{
  items: [...],  // All articles (flat list for backward compatibility)
  combined: {
    id: "combined-...",
    title: "Summary",
    summary: "...",  // Full concatenated text
    audioUrl: null,
    topicSections: [  // NEW: Structured data for feedback
      {
        topic: "technology",
        summary: "Tech news summary...",
        articles: [/* articles for this topic */],
        metadata: {...}
      },
      // ... more topics
    ]
  }
}
```

### iOS Changes

#### 1. Models (`/Library/FetchNews/App/Models.swift`)

Added `TopicSection` struct:
```swift
struct TopicSection: Codable, Identifiable {
    let id: String
    let topic: String
    let summary: String
    let articles: [Item]
}
```

Updated `Combined` struct to include `topicSections`:
```swift
struct Combined: Codable {
    let id: String
    let title: String
    let summary: String
    let audioUrl: String?
    let topicSections: [TopicSection]?  // NEW
}
```

#### 2. UI (`/Library/FetchNews/FetchNews/FetchScreen.swift`)

**TopicFeedbackView Component**:
- New dedicated view for topic-level feedback
- Displays all topics with thumbs up/down buttons
- Appears after the summary text, before articles
- Only visible when authenticated and topicSections are available

**Key Logic**:
```swift
// Topic feedback component in FetchScreen
if let topicSections = combined.topicSections, !topicSections.isEmpty, ApiClient.isAuthenticated {
    TopicFeedbackView(topicSections: topicSections)
}

// Submit feedback ONLY for articles in the selected topic
for article in topicSection.articles {
    try await ApiClient.submitArticleFeedback(
        articleId: article.id,
        url: article.url,
        title: article.title,
        source: article.source,
        feedback: feedback
    )
}
```

## Benefits

### 1. **Accurate Feedback**
- Each thumbs up/down targets only the articles in that specific topic
- No more submitting feedback for all articles when you only liked one topic

### 2. **Better UX**
- Clean, organized feedback section showing all topics
- Clear topic labels - no confusion about which content you're rating
- Simple, intuitive interface with prominent thumbs buttons

### 3. **Personalization Ready**
- Backend already stores liked/disliked articles in user profile
- Data can train algorithms to:
  - Prioritize preferred sources
  - Weight topics user engages with
  - Filter out disliked sources
  - Recommend similar content

### 4. **Backward Compatible**
- Old clients still work (topicSections is optional)
- Full summary text still provided
- Article list still flat for existing features

## How It Works

1. **Backend**: When generating summaries, tracks which articles contributed to each topic
2. **Response**: Sends both the concatenated summary AND structured topic data
3. **iOS App**: Parses topic sections and maps paragraphs to topics
4. **User Interaction**: Thumbs appear at end of each topic
5. **Feedback**: Only articles from that topic get the like/dislike rating
6. **Storage**: Backend stores in `user.likedArticles` / `user.dislikedArticles` arrays

## Testing

To test the implementation:

1. **Start Backend**:
```bash
cd /Library/FetchNews-Backend/backend
npm start
```

2. **Run iOS App** in Xcode

3. **Fetch News** with multiple topics (e.g., Technology + Sports)

4. **Verify**:
   - Thumbs appear at end of each topic section
   - Clicking thumbs sends feedback for only that topic's articles
   - Check backend logs for feedback submissions
   - Verify user's liked/disliked articles in database

## Future Enhancements

1. **Visual Topic Separators**: Add subtle dividers between topics
2. **Topic Labels**: Show topic name above each section
3. **Feedback Analytics**: Dashboard showing user preferences
4. **Smart Recommendations**: Use feedback to suggest new topics
5. **Source Weighting**: Automatically prioritize liked sources in future fetches

## API Endpoints

### Existing (unchanged)
- `POST /api/article-feedback` - Submit like/dislike for an article
- `GET /api/article-feedback` - Get user's feedback history

### Modified
- `POST /api/summarize` - Now returns `topicSections` in response
- `POST /api/summarize/batch` - Now returns `topicSections` in each batch result

## Data Flow

```
User clicks thumbs up on "Technology" topic
    ↓
iOS identifies articles in Technology topic section
    ↓
Submits feedback for each article in that topic
    ↓
Backend stores in user.likedArticles array
    ↓
Future fetches can prioritize these sources/topics
```

## Notes

- Feedback requires authentication (checked via `ApiClient.isAuthenticated`)
- Topic detection uses paragraph breaks and transition phrases
- Fallback: If no topic sections, treats entire summary as one topic
- Feedback is toggleable (click again to remove)
- Like/dislike are mutually exclusive per topic

