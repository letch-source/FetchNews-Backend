# Topic Intelligence System

## Problem Statement

Users face two major issues when selecting topics:

### 1. **Too Broad Topics** 
- **Example**: User adds "Politics" but actually wants U.S. politics
- **Result**: They get unwanted European, Asian, or world politics articles
- **User frustration**: "Why am I seeing Brexit news?"

### 2. **Too Specific Topics**
- **Example**: User adds "RNA research" 
- **Result**: Very few or no articles match this narrow keyword
- **User frustration**: "Why aren't I getting any news on my topics?"

## Solution: Multi-Layered Topic Intelligence

Our system addresses both problems through three intelligent layers:

### Layer 1: Smart Topic Analysis (When Adding Topics)
Analyzes topics in real-time and provides guidance to users.

### Layer 2: Semantic Query Expansion (When Fetching Articles)
Automatically expands or refines search terms based on topic specificity.

### Layer 3: Learning from Feedback (Over Time)
Uses user feedback to continuously refine topics.

---

## How It Works

### 1. **Topic Analysis API**

When a user types or adds a topic, call the analysis endpoint:

```bash
POST /api/topics/analyze
Authorization: Bearer <token>
Content-Type: application/json

{
  "topic": "Politics"
}
```

**Response:**

```json
{
  "success": true,
  "originalTopic": "Politics",
  "needsImprovement": true,
  "reason": "Single common word, likely too general",
  "suggestions": [
    "U.S. Politics",
    "U.S. Elections", 
    "Congress",
    "White House"
  ],
  "message": {
    "type": "warning",
    "title": "This topic might be too broad",
    "message": "You might get articles you're not interested in. Try one of these more specific topics:",
    "suggestions": ["U.S. Politics", "U.S. Elections", "Congress", "White House"]
  }
}
```

### 2. **Smart Article Fetching**

The backend automatically enhances article search:

#### For Broad Topics (e.g., "Politics"):
- Adds user's location context
- Searches for: `["politics", "us politics"]`
- Prioritizes location-relevant articles

#### For Specific Topics (e.g., "RNA research"):
- Expands with related terms
- Searches for: `["rna research", "genetics", "molecular biology", "biotech research"]`
- Finds more relevant articles

#### For Balanced Topics (e.g., "Artificial Intelligence"):
- Adds semantic variations
- Searches for: `["artificial intelligence", "AI", "machine learning"]`
- Improves match rate

### 3. **Learning from Feedback**

When a user has significant feedback (likes/dislikes) on a topic:

```bash
POST /api/topics/learn-from-feedback
Authorization: Bearer <token>
Content-Type: application/json

{
  "topic": "Politics"
}
```

**Response:**

```json
{
  "success": true,
  "refinedTopic": "U.S. Elections",
  "reasoning": "User consistently likes election-related articles and dislikes international politics",
  "confidence": 85,
  "suggestions": ["U.S. Elections", "Presidential Race", "Midterm Elections"],
  "excludeTerms": ["brexit", "european union"]
}
```

---

## Frontend Integration

### A. When User Adds a Topic

Show real-time suggestions as they type:

```typescript
// Swift (iOS)
func analyzeTopicAsUserTypes(topic: String) async {
    guard !topic.isEmpty else { return }
    
    let response = try await apiClient.post("/api/topics/analyze", body: [
        "topic": topic
    ])
    
    if response.needsImprovement {
        // Show inline warning/suggestion
        showTopicSuggestions(
            message: response.message.message,
            suggestions: response.suggestions
        )
    }
}
```

**UI Example:**

```
┌──────────────────────────────────────┐
│  Add Custom Topic                    │
├──────────────────────────────────────┤
│  [Politics____________]  [Add]       │
│                                      │
│  ⚠️  This topic might be too broad   │
│  You might get articles you're not   │
│  interested in.                      │
│                                      │
│  Try one of these instead:           │
│  • U.S. Politics       [Use This]   │
│  • U.S. Elections      [Use This]   │
│  • Congress            [Use This]   │
│  • White House         [Use This]   │
└──────────────────────────────────────┘
```

### B. Batch Analysis (Onboarding)

Analyze multiple topics at once:

```typescript
// When user finishes topic selection
POST /api/topics/analyze-batch

{
  "topics": ["Politics", "Technology", "NBA", "RNA research"]
}

// Response includes analysis for each topic
// Show warnings/suggestions in review screen
```

### C. Periodic Topic Refinement

After users have accumulated feedback, suggest improvements:

```typescript
// Check if topic should be refined (e.g., after 20+ articles with feedback)
func checkTopicRefinement(topic: String) async {
    let response = try await apiClient.post("/api/topics/learn-from-feedback", body: [
        "topic": topic
    ])
    
    if response.confidence > 70 {
        // Show suggestion notification
        showNotification(
            "We noticed you prefer '\(response.refinedTopic)' over '\(topic)'. Would you like to update?"
        )
    }
}
```

---

## Backend Implementation Details

### Smart Search Enhancement

The system automatically enhances search in `fetchArticlesForTopic`:

1. **Analyzes topic specificity** using GPT-4o-mini (cost-effective)
2. **Expands or refines search terms** based on analysis
3. **Scores results** with primary terms weighted higher
4. **Returns best matches** even for difficult topics

### Cache-First Strategy

The intelligence layer works with the existing article cache:
- First checks categorized cache articles
- Then performs smart content search with expanded terms
- Finally falls back to NewsAPI (with expanded terms)

### Cost Optimization

- Uses GPT-4o-mini for analysis (very cheap)
- Caches analysis results (could be added)
- Fallback to heuristics if GPT unavailable
- Only analyzes when needed (on topic add, not every fetch)

---

## Examples

### Example 1: User Adds "Politics"

**Without Topic Intelligence:**
- Searches for: "politics"
- Returns: UK Parliament, EU politics, Indian elections, US Congress
- User gets frustrated with irrelevant news

**With Topic Intelligence:**
- Detects: Too broad
- Suggests: "U.S. Politics", "U.S. Elections", "Congress"
- User selects: "U.S. Politics"
- Searches for: ["u.s. politics", "american politics", "congress", "white house"]
- Returns: Relevant U.S. political news

### Example 2: User Adds "RNA research"

**Without Topic Intelligence:**
- Searches for: "RNA research"
- Returns: 0-2 articles (too specific)
- User thinks app is broken

**With Topic Intelligence:**
- Detects: Too specific
- Automatically expands: ["rna research", "genetics", "molecular biology", "biotech research", "gene therapy"]
- Returns: 15+ relevant articles about genetic research
- Shows tooltip: "We broadened your search to find more relevant articles"

### Example 3: User Adds "AI"

**Without Topic Intelligence:**
- Searches for: "AI"
- Returns: Articles about "AI", misses "Artificial Intelligence"

**With Topic Intelligence:**
- Detects: Just right (but needs variations)
- Expands: ["ai", "artificial intelligence", "machine learning", "ai technology"]
- Returns: Comprehensive AI news coverage

---

## API Endpoints Reference

### `POST /api/topics/analyze`
Analyze a single topic for specificity and get suggestions.

**Request:**
```json
{
  "topic": "string"
}
```

**Response:**
```json
{
  "success": true,
  "originalTopic": "string",
  "needsImprovement": boolean,
  "reason": "string",
  "suggestions": ["string"],
  "message": {
    "type": "warning" | "info" | "success",
    "title": "string",
    "message": "string",
    "suggestions": ["string"]
  }
}
```

### `POST /api/topics/analyze-batch`
Analyze multiple topics at once.

**Request:**
```json
{
  "topics": ["string"]
}
```

**Response:**
```json
{
  "success": true,
  "topics": [
    {
      "topic": "string",
      "analysis": {
        "specificity": "too_broad" | "too_specific" | "just_right",
        "suggestions": ["string"],
        "expandedTerms": ["string"]
      }
    }
  ]
}
```

### `POST /api/topics/learn-from-feedback`
Analyze user feedback to suggest topic refinements.

**Request:**
```json
{
  "topic": "string"
}
```

**Response:**
```json
{
  "success": true,
  "refinedTopic": "string",
  "reasoning": "string",
  "confidence": number,
  "suggestions": ["string"],
  "excludeTerms": ["string"]
}
```

### `GET /api/topics/suggestions/:topic`
Quick suggestions endpoint (lightweight).

**Response:**
```json
{
  "success": true,
  "topic": "string",
  "specificity": "too_broad" | "too_specific" | "just_right",
  "suggestions": ["string"],
  "needsImprovement": boolean,
  "reasoning": "string"
}
```

---

## Configuration

### Environment Variables

```bash
# Required for topic intelligence
OPENAI_API_KEY=sk-...

# Optional: Disable if you want to test without GPT
# (Will use heuristic fallback)
# DISABLE_TOPIC_INTELLIGENCE=false
```

### Heuristic Fallback

If OpenAI is unavailable, the system uses smart heuristics:

- **Broad topics**: Single common words (politics, sports, business)
- **Specific topics**: 5+ words OR technical keywords
- **Balanced topics**: Everything else

---

## Testing

### Manual Testing

```bash
# Test broad topic
curl -X POST http://localhost:8000/api/topics/analyze \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topic": "Politics"}'

# Test specific topic
curl -X POST http://localhost:8000/api/topics/analyze \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topic": "RNA polymerase research"}'

# Test balanced topic
curl -X POST http://localhost:8000/api/topics/analyze \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topic": "Artificial Intelligence"}'
```

### Expected Behaviors

| Topic | Specificity | Action |
|-------|-------------|--------|
| Politics | Too Broad | Suggest: U.S. Politics, Congress, Elections |
| Sports | Too Broad | Suggest: NFL, NBA, MLB (for US users) |
| RNA research | Too Specific | Expand: genetics, molecular biology |
| Quantum entanglement | Too Specific | Expand: quantum physics, quantum computing |
| Artificial Intelligence | Just Right | Add variations: AI, machine learning |
| Climate Change | Just Right | Add variations: global warming, climate crisis |

---

## Performance Considerations

### Response Times

- Topic analysis: ~500-1000ms (GPT call)
- Batch analysis: ~1000-2000ms for 5 topics
- Fallback heuristics: <10ms

### Cost

- GPT-4o-mini: $0.00015 per analysis (~$0.15 per 1000 analyses)
- Very affordable for real-time suggestions

### Optimization Tips

1. **Debounce user input** (wait 500ms after typing stops)
2. **Cache analysis results** for common topics
3. **Use batch endpoint** for onboarding (more efficient)
4. **Only analyze custom topics** (core categories don't need analysis)

---

## Future Enhancements

### Potential Improvements

1. **Local Topic Cache**: Cache analysis results for common topics
2. **User Location Integration**: Auto-refine based on GPS location
3. **Trending Topic Suggestions**: Suggest popular refined topics
4. **A/B Testing**: Test different suggestion strategies
5. **Multi-language Support**: Analyze topics in different languages
6. **Topic Hierarchies**: Create parent-child topic relationships

### Metrics to Track

- Topic specificity distribution (too broad vs. too specific)
- Suggestion acceptance rate
- Articles found before vs. after intelligence
- User satisfaction with topic results

---

## Troubleshooting

### No Suggestions Returned

**Cause**: OpenAI API key not configured or GPT unavailable

**Solution**: 
1. Check `OPENAI_API_KEY` environment variable
2. System will use heuristic fallback automatically
3. Check logs for `[TOPIC_INTELLIGENCE]` messages

### Too Many "Too Broad" Warnings

**Cause**: Aggressive heuristics or GPT being too cautious

**Solution**:
1. Adjust thresholds in `fallbackAnalysis()` function
2. Fine-tune GPT prompt to be less strict
3. Add exceptions for known good topics

### Poor Article Matches Despite Expansion

**Cause**: Expanded terms not in cache

**Solution**:
1. Ensure article categorization job is running
2. Check that expanded terms are being used in search
3. Review GPT-generated expanded terms for quality

---

## Summary

The Topic Intelligence System solves the "too broad" and "too specific" problems through:

✅ **Real-time topic analysis** - Warn users before they add bad topics  
✅ **Smart search expansion** - Find articles even for difficult topics  
✅ **Location-aware refinement** - Auto-contextualize broad topics  
✅ **Learning from feedback** - Improve topics over time  
✅ **Graceful fallback** - Works without GPT using heuristics  

This creates a better user experience and helps users get the news they actually want to read.
