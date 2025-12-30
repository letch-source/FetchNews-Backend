# NewsAPI Emergency Kill Switch

## Problem

You're hitting NewsAPI rate limits every day because:

1. **Cache is empty** → No cached articles in MongoDB
2. **User requests fall back to NewsAPI** → Hits rate limit (100 requests/24hrs)
3. **Rate limit exhausted** → Can't populate cache
4. **Next day: Repeat** → Vicious cycle continues

## Solution: Emergency Kill Switch

I've added an environment variable `DISABLE_NEWSAPI_FALLBACK` that **completely blocks all NewsAPI calls** when set to `true`.

### What It Does

When `DISABLE_NEWSAPI_FALLBACK=true`:
- ✅ **Blocks all NewsAPI fallback calls** from user requests
- ✅ **Blocks categorization job** from running (prevents wasting quota)
- ✅ **Returns empty results** instead of hitting rate limit
- ✅ **Allows rate limit to reset** without interference

### How to Use It

#### Step 1: Enable Kill Switch (Already Done ✅)

The kill switch is now **ACTIVE** in your `.env` file:

```bash
DISABLE_NEWSAPI_FALLBACK=true
```

#### Step 2: Restart Backend

```bash
cd /Library/FetchNews-Backend/backend
# If running locally:
npm start

# If on Render.com:
# Go to Dashboard → Your Service → Manual Deploy → Deploy Latest Commit
# Or set the environment variable in Render.com dashboard
```

#### Step 3: Wait for Rate Limit Reset

Your NewsAPI quota resets:
- **50 requests** available every **12 hours**
- **100 requests** total every **24 hours**

Check when you last made successful requests to estimate reset time.

#### Step 4: Populate Cache (When Quota Resets)

Once your rate limit resets:

```bash
cd /Library/FetchNews-Backend/backend

# Temporarily disable kill switch
export DISABLE_NEWSAPI_FALLBACK=false

# Run categorization to populate cache
node scripts/test-categorization.js
```

This will:
- Use **1-2 NewsAPI calls** (well within quota)
- Fetch ~1000-1500 articles
- Categorize them with GPT-4o-mini
- Store in MongoDB for 7 days

#### Step 5: Re-enable Kill Switch (Optional)

After cache is populated, you can:

**Option A: Keep kill switch ON** (Safest)
```bash
# In .env file:
DISABLE_NEWSAPI_FALLBACK=true
```
- Prevents any accidental NewsAPI calls
- Relies 100% on cache
- Cron job at 6am/6pm won't run (you'll need to manually refresh cache weekly)

**Option B: Turn kill switch OFF** (Normal operation)
```bash
# In .env file:
DISABLE_NEWSAPI_FALLBACK=false
# Or remove the line entirely
```
- Allows 6am/6pm cron job to auto-refresh cache
- Falls back to NewsAPI if cache is empty (use with caution)
- Normal operation mode

## Monitoring

### Check Cache Status

```bash
cd /Library/FetchNews-Backend/backend
node scripts/resurrect-expired-cache.js
```

This will show:
- Total articles in cache
- Articles by category
- Cache expiration dates

### Check Backend Logs

When kill switch is active, you'll see:
```
🚫 [NEWSAPI DISABLED] Blocked fetchArticlesEverything call. Set DISABLE_NEWSAPI_FALLBACK=false to re-enable.
🚫 [NEWSAPI DISABLED] Returning empty results.
```

## Technical Details

### Modified Files

1. **`backend/index.js`**
   - Added `DISABLE_NEWSAPI_FALLBACK` environment variable check
   - Modified `fetchArticlesForTopic()` to return empty results when disabled
   - Modified `fetchArticlesEverything()` to throw error when disabled
   - Modified `fetchArticlesWithVariety()` to return empty array when disabled
   - Modified `fetchTopHeadlinesByCategory()` to throw error when disabled

2. **`backend/services/articleFetcher.js`**
   - Modified `fetchAllArticles()` to block categorization job when disabled

3. **`backend/.env`**
   - Added `DISABLE_NEWSAPI_FALLBACK=true`

4. **`env.example`**
   - Documented the new environment variable

### How It Works

```javascript
const DISABLE_NEWSAPI_FALLBACK = process.env.DISABLE_NEWSAPI_FALLBACK === 'true';

async function fetchArticlesEverything(...) {
  // 🚨 EMERGENCY KILL SWITCH
  if (DISABLE_NEWSAPI_FALLBACK) {
    console.error('🚫 [NEWSAPI DISABLED] Blocked call.');
    throw new Error("NewsAPI fallback is disabled.");
  }
  
  // ... normal NewsAPI code ...
}
```

## Deployment on Render.com

If your backend is deployed on Render.com:

1. Go to **Dashboard** → Your Service
2. Click **Environment** tab
3. Add environment variable:
   - **Key**: `DISABLE_NEWSAPI_FALLBACK`
   - **Value**: `true`
4. Click **Save Changes**
5. Service will auto-restart with kill switch enabled

To populate cache on Render.com:
1. Use the admin endpoint: `POST /api/admin/cache/refresh`
2. Or run script via Render Shell (Dashboard → Shell tab)

## Troubleshooting

### "No articles found" in app
- **Expected behavior** when kill switch is ON and cache is empty
- Wait for rate limit reset, then populate cache (Step 4 above)

### Categorization job not running
- **Expected behavior** when kill switch is ON
- This is intentional to prevent wasting quota
- Manually run categorization after rate limit resets

### Rate limit still being hit
- Check if kill switch is actually enabled in environment
- Restart backend after changing `.env`
- Check logs for `🚫 [NEWSAPI DISABLED]` messages

## Long-Term Solution

Once cache is populated and working:

1. **Keep kill switch OFF** for normal operation
2. **Let 6am/6pm cron job** auto-refresh cache
3. **Monitor usage** to ensure you stay under 100 requests/day
4. **Consider upgrading** to NewsAPI paid tier if needed

The cron job should only use **2 API calls per day** (one at 6am, one at 6pm), well within the free tier limit.

