# Article Caching System

## Overview

The FetchNews backend now uses a **cache-first strategy** to dramatically reduce NewsAPI usage:

- **Before**: Hundreds of NewsAPI calls per day (hitting rate limits at ~100 requests/24hrs)
- **After**: Only **2 NewsAPI calls per day** (6am and 6pm automatic fetches)

## How It Works

### 1. Scheduled Article Fetching (2x Daily)
Every day at **6am and 6pm Eastern Time**, the system:
1. Fetches articles from **all US news sources** via NewsAPI (~50 sources)
2. Uses AI (GPT-4o-mini) to categorize each article into topics
3. Stores articles in MongoDB with a 7-day TTL (auto-deletion)

**Location**: `/backend/jobs/categorizeArticles.js`

### 2. AI Categorization
Articles are tagged with:
- **Core categories**: business, technology, sports, entertainment, health, science, general
- **User custom topics**: Any custom topics users have created (e.g., "Artificial Intelligence", "Electric Vehicles")

**Location**: `/backend/services/articleCategorizer.js`

### 3. Cache-First Fetching
When users request news summaries:
1. Query `ArticleCache` collection by topic/category
2. Return cached articles if available (any amount, no minimum)
3. Only fall back to NewsAPI if cache is empty (logs warning)

**Location**: `/backend/services/cachedArticleFetcher.js`

## Database Schema

```javascript
ArticleCache {
  title: String,           // Article headline
  description: String,     // Article summary
  url: String (unique),    // Article URL (prevents duplicates)
  publishedAt: Date,       // Publication date (indexed)
  source: {
    id: String,
    name: String
  },
  urlToImage: String,
  author: String,
  content: String,
  
  // AI-generated
  categories: [String],    // Topics this article belongs to (indexed)
  categorizedAt: Date,
  categorizationModel: String,  // "gpt-4o-mini"
  
  // Auto-cleanup
  expiresAt: Date,         // TTL index - auto-deletes after 7 days
  
  // Compound indexes for fast queries
  // - { categories: 1, publishedAt: -1 }
  // - { 'source.id': 1, publishedAt: -1 }
}
```

## API Endpoints

### Public Endpoints

#### `GET /api/health`
Check overall system health including cache status.

**Response**:
```json
{
  "status": "ok",
  "jwtConfigured": true,
  "newsConfigured": true,
  "ttsConfigured": true,
  "cache": {
    "healthy": true,
    "total": 1247,
    "newestArticleAge": "2.3 hours ago",
    "categories": 15,
    "sources": 49,
    "message": "Cache is healthy"
  }
}
```

### Admin Endpoints (Authenticated)

#### `GET /api/admin/cache/status`
Get cache and job status.

**Response**:
```json
{
  "cache": {
    "healthy": true,
    "total": 1247,
    "newestArticleAge": "2.3 hours ago",
    "categories": 15,
    "sources": 49,
    "message": "Cache is healthy"
  },
  "job": {
    "isRunning": false,
    "lastRunTime": "2024-12-22T06:00:15.234Z",
    "lastRunStats": {
      "articlesFetched": 1250,
      "articlesProcessed": 1240,
      "articlesSaved": 1180,
      "duration": 45230
    },
    "nextRun": "2024-12-22T18:00:00.000Z"
  }
}
```

#### `POST /api/admin/cache/refresh`
Manually trigger the categorization job (useful for testing or emergency refresh).

**Response**:
```json
{
  "message": "Categorization job started",
  "status": "running"
}
```

#### `GET /api/admin/cache/stats`
Get detailed cache statistics.

**Response**:
```json
{
  "total": 1247,
  "byCategory": [
    { "_id": "technology", "count": 342 },
    { "_id": "business", "count": 298 },
    { "_id": "politics", "count": 187 }
  ],
  "bySource": [
    { "_id": "cnn", "name": "CNN", "count": 45 },
    { "_id": "bbc-news", "name": "BBC News", "count": 38 }
  ],
  "oldestArticle": "2024-12-15T10:23:45.123Z",
  "newestArticle": "2024-12-22T14:32:11.456Z",
  "lastUpdated": "2024-12-22T12:00:05.789Z"
}
```

## Monitoring

### Cache Health Indicators

**Healthy**:
- ✅ Total articles > 0
- ✅ Newest article < 24 hours old
- ✅ Multiple categories available

**Unhealthy**:
- ❌ Total articles = 0 → Job may not be running
- ❌ Newest article > 24 hours old → Job may have failed
- ❌ Few categories → Categorization issues

### Logs to Watch

```bash
# Successful cache hit (good!)
✅ [CACHE HIT] Using 15 cached articles for topic: technology

# Cache miss (concerning - check job)
⚠️  [CACHE MISS] No cached articles for "technology"
    ⚠️  This will use a NewsAPI call! Ensure categorization job is running.

# Job running
🔄 STARTING ARTICLE CATEGORIZATION JOB
📡 Step 1: Fetching articles from NewsAPI...
✅ Fetched 1250 articles
🤖 Step 4: Categorizing 1240 articles with ChatGPT...
✅ CATEGORIZATION JOB COMPLETE
```

## Cost Analysis

### NewsAPI Costs
- **Free tier**: 100 requests/24hrs (hitting limits)
- **Developer tier**: $449/month for 250K requests
- **Our usage with cache**: ~2 requests/day = **$0/month** 🎉

### OpenAI Costs (Categorization)
- **Model**: GPT-4o-mini
- **Per article**: ~$0.0002 (100 articles per batch)
- **Per job**: ~$0.25 (1,250 articles)
- **Monthly**: ~$15 (2 jobs/day × 30 days)

**Total savings**: $449/month → $15/month = **97% cost reduction**

## Troubleshooting

### Problem: No cached articles available

**Symptoms**:
- `/api/health` shows `cache.total: 0`
- Many "CACHE MISS" warnings in logs
- Users getting NewsAPI rate limit errors

**Solutions**:
1. Check job status: `GET /api/admin/cache/status`
2. Check if job is scheduled (should see in server startup logs)
3. Manually trigger job: `POST /api/admin/cache/refresh`
4. Check MongoDB connection
5. Verify `OPENAI_API_KEY` and `NEWSAPI_KEY` environment variables

### Problem: Cache is stale (old articles)

**Symptoms**:
- `/api/health` shows `newestArticleAge: "48 hours ago"`
- Job shows as "not running" but last run was > 12 hours ago

**Solutions**:
1. Check server time zone (should be America/New_York for 6am/6pm ET)
2. Check cron schedule in `/backend/jobs/categorizeArticles.js`
3. Manually trigger: `POST /api/admin/cache/refresh`
4. Restart server to re-initialize schedule

### Problem: Job is running but articles aren't categorized

**Symptoms**:
- Articles fetched but `categories: []`
- "CACHE MISS" for core categories like "technology"

**Solutions**:
1. Check OpenAI API key is valid
2. Check categorization logs for errors
3. Verify custom topics aren't interfering with core categories
4. Check rate limits on OpenAI API

## Development

### Test the System

```bash
# 1. Check health
curl http://localhost:3000/api/health

# 2. Manually trigger categorization (with auth)
curl -X POST http://localhost:3000/api/admin/cache/refresh \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 3. Check cache stats
curl http://localhost:3000/api/admin/cache/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 4. Test a fetch (should use cache)
curl -X POST http://localhost:3000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{"topics":["technology","business"],"wordCount":200}'
```

### Run Job Manually

```javascript
// In Node.js console or script
const { runCategorizationJob } = require('./jobs/categorizeArticles');

await runCategorizationJob();
```

### Query Cache Directly

```javascript
// In MongoDB shell or Node.js
const ArticleCache = require('./models/ArticleCache');

// Get all tech articles
const techArticles = await ArticleCache.find({ 
  categories: 'technology' 
}).limit(10);

// Get stats
const stats = await ArticleCache.getStats();
console.log(stats);
```

## Migration Notes

### Before (Direct NewsAPI)
- Each user fetch = 3-6 NewsAPI calls (multiple strategies × multiple topics)
- 20 users/day × 3 fetches = 180-360 API calls/day
- Hit rate limit quickly

### After (Cache-First)
- Scheduled job = 2 API calls/day (6am and 6pm)
- User fetches = 0 API calls (all from cache)
- Stay well under 100 requests/day limit
- Can support unlimited users

## Future Improvements

1. **Real-time trending topics**: Fetch specific breaking news topics outside schedule
2. **Multi-country support**: Extend beyond US sources
3. **Source quality scoring**: Prioritize high-quality sources
4. **Personalized ranking**: Use user feedback to rank cached articles
5. **Hot cache warming**: Pre-fetch articles for popular topic combinations

