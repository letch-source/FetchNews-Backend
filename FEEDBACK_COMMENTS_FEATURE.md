# Feedback Comments & Personalization Feature

## Overview
Enhanced the topic-level feedback system to include optional user comments that help personalize future news fetches based on user preferences.

## User Experience

### How It Works
1. User clicks thumbs up 👍 or thumbs down 👎 on a topic
2. Section **expands** to show an optional comment field
3. User can either:
   - **Skip** to submit feedback without comment
   - **Type a comment** and hit Submit
4. After submission, UI shows **"✓ Thanks for giving feedback!"**
5. **One feedback per topic** - cannot change after submission
6. If deselected before submission, section **collapses** back

### UI Flow
```
Topic: Technology    👍 👎
     ↓ (click thumbs up)
Technology           👍✓ 👎
┌─────────────────────────────┐
│ Tell us more (optional):    │
│ ┌─────────────────────────┐ │
│ │ [Text field for comment]│ │
│ └─────────────────────────┘ │
│   Skip          [Submit]    │
└─────────────────────────────┘
     ↓ (click Submit)
✓ Thanks for giving feedback!
```

## Backend Changes

### Article Feedback Storage
Updated schema to include:
- `topic`: Which topic the feedback relates to
- `comment`: Optional user comment explaining their feedback

```javascript
{
  articleId: String,
  url: String,
  title: String,
  source: String,
  topic: String,        // NEW
  comment: String,      // NEW
  timestamp: Date
}
```

### Topic Preferences Tracking
New `topicPreferences` field on User model:
```javascript
topicPreferences: Map {
  "technology": {
    likes: 5,
    dislikes: 2,
    comments: [
      {
        feedback: "like",
        comment: "Love AI coverage, want more depth",
        timestamp: Date
      }
    ]
  }
}
```

## Personalization Capabilities

### Current Implementation ✅ ACTIVE

The system now **automatically personalizes** your next fetch based on your feedback:

1. **Source Prioritization**: Articles from sources you liked are shown first
2. **Topic Weighting**: Topics you like get better article selection
3. **Disliked Filtering**: Articles from disliked sources are demoted (but 10% kept for diversity)
4. **Comment Analysis**: Your comments are logged and ready for deeper analysis

### Personalization Algorithm

Each article gets a **score** based on:
- **+100**: Exact article you liked before
- **-100**: Exact article you disliked before
- **+50**: Source you liked for THIS topic
- **-50**: Source you disliked for THIS topic
- **+25**: Source you liked in general
- **-25**: Source you disliked in general
- **+2 per like**: Topic overall preference score

Articles are then sorted by score and the lowest scored are filtered out (keeping 10% for discovery).

### Backend Logs

When you fetch news, you'll see:
```
🎯 [PERSONALIZATION] Prioritizing 50 articles for user you@email.com
   📊 Topic "technology" score: 3 (4 likes, 1 dislikes)
   💬 User has 2 comments on "technology"
      Latest: "Love AI coverage, want more depth..."
   ✅ Liked sources for this topic: 2
   ❌ Disliked sources for this topic: 1
   🔄 Result: 48 articles (45 kept, 3 diversity samples)
```

### How To Use For Even More Personalization

#### 1. Source Prioritization
```javascript
// Example: Boost sources user has liked
const likedSources = user.likedArticles
  .filter(a => a.topic === currentTopic)
  .map(a => a.source);

articles = prioritizeBySource(articles, likedSources);
```

#### 2. Topic Weighting
```javascript
// Example: Suggest topics user likes
const topicScores = {};
for (const [topic, prefs] of user.topicPreferences) {
  topicScores[topic] = prefs.likes - prefs.dislikes;
}
// Recommend high-scoring topics
```

#### 3. Content Analysis
```javascript
// Example: Analyze comment patterns
const techComments = user.topicPreferences.get('technology')?.comments || [];
const positiveKeywords = extractKeywords(
  techComments.filter(c => c.feedback === 'like')
);
// Use keywords to filter/rank articles
```

#### 4. Disliked Content Filtering
```javascript
// Example: Avoid sources user dislikes
const dislikedSources = user.dislikedArticles
  .map(a => a.source);

articles = articles.filter(a => 
  !dislikedSources.includes(a.source)
);
```

## API Endpoints

### Submit Feedback with Comment
```http
POST /api/article-feedback
Authorization: Bearer <token>
Content-Type: application/json

{
  "articleId": "tech-123",
  "url": "https://...",
  "title": "AI Breakthrough",
  "source": "TechCrunch",
  "topic": "technology",
  "feedback": "like",
  "comment": "Want more AI coverage like this"  // optional
}
```

### Get User Feedback
```http
GET /api/article-feedback
Authorization: Bearer <token>

Response:
{
  "likedArticles": [...],
  "dislikedArticles": [...]
}
```

## iOS Implementation

### TopicFeedbackView
- Expandable comment sections with smooth animations
- Skip or Submit options
- Loading states during submission
- Automatic collapse after submission

### ApiClient Methods
```swift
// With comment
try await ApiClient.submitArticleFeedbackWithComment(
    articleId: article.id,
    url: article.url,
    title: article.title,
    source: article.source,
    topic: "technology",
    feedback: "like",
    comment: "More AI articles please"
)

// Without comment (backward compatible)
try await ApiClient.submitArticleFeedback(
    articleId: article.id,
    url: article.url,
    title: article.title,
    source: article.source,
    feedback: "like"
)
```

## Future Enhancements

### Short Term
1. **Sentiment Analysis**: Analyze comment sentiment automatically
2. **Keyword Extraction**: Pull key themes from comments
3. **Source Recommendations**: "You liked X, try Y"
4. **Topic Discovery**: Suggest new topics based on feedback

### Medium Term
1. **ML Model**: Train on feedback data to predict preferences
2. **Smart Ranking**: Automatically boost preferred content
3. **Feedback Dashboard**: Show users their preference patterns
4. **A/B Testing**: Test personalization effectiveness

### Long Term
1. **Collaborative Filtering**: "Users like you also enjoyed..."
2. **Content Understanding**: Deep analysis of article content vs. preferences
3. **Real-time Adaptation**: Adjust recommendations within same session
4. **Explainable AI**: "Showing this because you liked..."

## Data Privacy

- Comments are only visible to the user and admins
- Used solely for personalization
- Can be deleted on user request
- No third-party sharing
- GDPR/CCPA compliant storage

## Analytics

### Backend Logs
```
💬 [FEEDBACK] User user@email.com - like on technology: "Great AI coverage"
✅ [FEEDBACK] Stored like for technology by user user@email.com
```

### Metrics To Track
- Comment rate (% of feedback with comments)
- Average comment length
- Topic sentiment scores
- Personalization impact on engagement
- User satisfaction over time

## Testing

1. Click thumbs up/down on a topic
2. Verify section expands with comment field
3. Type optional comment
4. Submit and verify backend receives it
5. Check backend logs for feedback storage
6. Deselect thumb to verify collapse
7. Test Skip vs Submit flows

## Notes

- Comments are optional - users can skip
- Max 20 comments stored per topic per user
- Feedback without comments still works (backward compatible)
- Topic preferences aggregated for easy analysis
- Ready for ML integration when needed

