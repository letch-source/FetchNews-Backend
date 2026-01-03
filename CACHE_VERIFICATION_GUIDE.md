# Article Cache Verification Guide

## How the Cache System Works

Your FetchNews backend uses a **cache-first strategy** to minimize NewsAPI calls and speed up scheduled fetches:

### 📅 Cache Refresh Schedule
- **Runs twice daily**: 6am & 6pm Eastern Time
- **Job**: `backend/jobs/categorizeArticles.js`
- **What it does**:
  1. Fetches fresh articles from NewsAPI (~100-200 articles)
  2. Uses ChatGPT to categorize them (general, business, tech, sports, etc.)
  3. Stores in MongoDB `ArticleCache` collection
  4. Extracts trending topics automatically

### 🔍 How Scheduled Fetches Use Cache

When your Daily Fetch runs, it calls `fetchArticlesForTopic()` which:

```
1. Try cache (category match) 
   ✅ Found? → Return cached articles
   
2. Try cache (content search - title/description)
   ✅ Found? → Return cached articles
   
3. Fallback to NewsAPI
   ⚠️  Cache miss → Hit NewsAPI directly
```

### Expected Logs

**Cache Hit (Good!):**
```
✅ [CACHE HIT] Using 12 cached articles for topic: U.S. Politics
[SCHEDULER] Topic: U.S. Politics, Country: us
```

**Cache Miss (Bad - wastes NewsAPI calls):**
```
⚠️  [CACHE MISS] No cached articles for "U.S. Politics" (tried: category match + content search)
🌐 [NEWSAPI FALLBACK] Fetching from NewsAPI for topic: U.S. Politics
```

## How to Verify Cache is Working

### 1. Check Cache Health

Run this diagnostic script:

```bash
cd /Library/FetchNews/backend
node scripts/check-cache-health.js
```

**Expected output if healthy:**
```
📊 CACHE HEALTH CHECK
Total articles in cache: 150
Oldest article: 2026-01-02T10:00:00.000Z
Newest article: 2026-01-02T18:00:00.000Z

Articles by Category:
  general: 25
  business: 20
  technology: 18
  sports: 15
  health: 12
  ...

✅ HEALTHY: Cache is populated and recent!
```

**If cache is empty:**
```
❌ CRITICAL: Cache is empty! Categorization job may not have run yet.
   Run: node backend/scripts/run-categorization-now.js
```

### 2. Check Your Production Logs

Search for these patterns in your Render logs:

#### ✅ **Good Signs (Cache Working):**
```
✅ [CACHE HIT] Using X cached articles for topic: Y
🔄 STARTING ARTICLE CATEGORIZATION JOB
✅ CATEGORIZATION JOB COMPLETE
```

#### ❌ **Bad Signs (Cache Not Working):**
```
⚠️  [CACHE MISS] No cached articles for "..."
🌐 [NEWSAPI FALLBACK] Fetching from NewsAPI for topic: ...
```

If you see lots of cache misses, the categorization job might not be running or categories don't match your topics.

### 3. Manually Run the Cache Job

If cache is empty or stale:

```bash
cd /Library/FetchNews/backend
node scripts/run-categorization-now.js
```

This will:
- Fetch ~150 articles from NewsAPI
- Categorize them with ChatGPT
- Populate the cache
- Take ~2-3 minutes

### 4. Check Cron Job Status

The cache job should run automatically. Check if it's scheduled:

```bash
# On your server, check if cron is running
# Look for logs like:
⏰ Scheduled categorization job triggered
🔄 STARTING ARTICLE CATEGORIZATION JOB
```

## Common Issues & Solutions

### Issue 1: Cache is Empty
**Symptoms:**
- All scheduled fetches hit NewsAPI
- Logs show `[CACHE MISS]` for all topics

**Solution:**
```bash
# Manually run categorization job
node backend/scripts/run-categorization-now.js

# Check if it populates cache
node backend/scripts/check-cache-health.js
```

### Issue 2: Cache is Stale
**Symptoms:**
- Cache has articles but they're old (>24 hours)
- No recent categorization job logs

**Causes:**
- Cron job not running (server restart needed?)
- Job is failing silently
- Timezone issue (job runs at wrong time)

**Solution:**
```bash
# Check job status endpoint
curl https://your-backend.onrender.com/api/admin/categorization-status

# Manually trigger job
curl -X POST https://your-backend.onrender.com/api/admin/categorize-articles \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Issue 3: Categories Don't Match User Topics
**Symptoms:**
- Cache has articles but still get cache misses
- Custom topics never hit cache

**Explanation:**
- Cache uses categories: `general`, `business`, `technology`, `sports`, etc.
- Custom topics like "U.S. Politics" need content-based search
- Content search looks for keywords in title/description

**Solution:**
- Custom topics should work with content search
- Check logs to see if content search is being used
- If not finding articles, the topic keywords might not match

### Issue 4: NewsAPI Rate Limits
**Symptoms:**
- Getting 429 errors from NewsAPI
- Scheduled fetches failing

**Diagnosis:**
```bash
# Count NewsAPI calls in logs (should be ~2 per day from cache job)
grep "NEWSAPI FALLBACK" your-logs.txt | wc -l

# If > 10 per day, cache isn't working
```

**Solution:**
- Fix cache as described above
- Consider upgrading NewsAPI plan if needed

## Cache Job Schedule

The categorization job runs on a cron schedule:

```javascript
// Default: '0 6,18 * * *' (6am and 6pm Eastern)
cron.schedule('0 6,18 * * *', async () => {
  await runCategorizationJob();
}, {
  timezone: 'America/New_York'
});
```

### Verify Job Runs at Right Time

If your Daily Fetch is at 8am Pacific (11am Eastern), the cache should refresh at:
- ✅ **6am Eastern** (3am Pacific) - Fresh articles for morning fetch
- ✅ **6pm Eastern** (3pm Pacific) - Fresh articles for evening fetch

So your 8am Pacific fetch will use articles cached at 6am Eastern (3am Pacific).

## API Endpoints for Cache Management

### Get Cache Health (Admin)
```bash
GET /api/admin/cache-health
```

### Manually Trigger Categorization (Admin)
```bash
POST /api/admin/categorize-articles
```

### Get Job Status (Admin)
```bash
GET /api/admin/categorization-status
```

## Performance Expectations

With cache working properly:

| Metric | Without Cache | With Cache |
|--------|--------------|------------|
| NewsAPI calls/day | 100-500 | 2 |
| Scheduled fetch speed | 15-30s | 2-5s |
| API rate limit risk | High | None |
| Monthly NewsAPI usage | 3,000-15,000 | ~60 |

## Monitoring Checklist

Run this weekly:

- [ ] Check cache health: `node scripts/check-cache-health.js`
- [ ] Verify cache has >50 articles
- [ ] Verify articles are recent (last 24h)
- [ ] Check logs for cache hit ratio (should be >90%)
- [ ] Verify categorization job runs twice daily
- [ ] Check NewsAPI usage (should be ~60 calls/month)

## Next Steps

1. **Run the health check now**:
   ```bash
   node backend/scripts/check-cache-health.js
   ```

2. **Check your last scheduled fetch logs** for cache hits/misses

3. **If cache is empty**, run:
   ```bash
   node backend/scripts/run-categorization-now.js
   ```

4. **Monitor your next scheduled fetch** to confirm it uses cache

---

**Questions?**
- Check cache health first
- Look for cache hit/miss patterns in logs
- Verify categorization job runs at 6am/6pm Eastern

The cache should dramatically reduce your NewsAPI usage and speed up scheduled fetches! 🚀
