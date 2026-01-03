# Example Test Run - Step by Step

This document shows exactly what to type and what you'll see.

---

## 🚀 Let's Run a Test!

### Step 1: Navigate to Backend Directory

```bash
cd /Library/FetchNews/backend
```

### Step 2: Start Backend (if not already running)

```bash
npm start
```

**Expected Output:**
```
> fetchnews-backend@1.0.0 start
> node index.js

MongoDB connected successfully!
Server running on port 8000
```

### Step 3: Check Cache Health

Open a new terminal tab/window and run:

```bash
cd /Library/FetchNews/backend
npm run test:cache
```

**Expected Output:**
```
🔌 Connecting to MongoDB...
✅ Connected to MongoDB

📊 CACHE HEALTH CHECK
============================================================

📈 Overall Stats:
  Total articles in cache: 1,234
  Oldest article: 2024-01-14T08:00:00.000Z
  Newest article: 2024-01-15T10:30:00.000Z

📚 Articles by Category:
  technology: 234
  sports: 189
  business: 156
  health: 98
  science: 87
  ...

⏰ Expired articles (should be cleaned): 0
📅 Articles fetched in last 24h: 456

📰 Sample Cached Articles (last 5):
  Title: AI Breakthrough in Natural Language Processing
  Categories: technology, artificial-intelligence, ai
  Source: TechCrunch
  Published: 2024-01-15T10:15:00.000Z
  ...

============================================================

🏥 HEALTH ASSESSMENT:
✅ HEALTHY: Cache is populated and recent!
   1,234 articles available for scheduled fetches.

✅ Done!
```

If you see **"CRITICAL: Cache is empty!"**, run:
```bash
node scripts/run-categorization-now.js
```

Wait 2-3 minutes, then check again.

### Step 4: Run Quick Test

```bash
npm run test:fetch
```

**Expected Output:**
```
╔════════════════════════════════════════╗
║  Manual Fetch Testing - Quick Mode    ║
╚════════════════════════════════════════╝

📊 Fetching cache statistics...

Cache Health:
  Status: ✅ Healthy
  Total Articles: 1234
  Newest Article: 2.5 hours ago
  Categories: 45
  Message: Cache is healthy

Available Categories (Top 20):
  1. technology (234 articles)
  2. sports (189 articles)
  3. business (156 articles)
  ...

Running quick test...

🚀 Initiating manual fetch test...
Configuration:
  Topics: technology, sports
  Word Count: 200
  Good News Only: false

================================================================================
🧪 MANUAL FETCH TEST INITIATED
================================================================================
📋 Test Configuration:
   Topics: technology, sports
   Word Count: 200
   Good News Only: false
   Excluded Sources: none

🏥 Checking cache health...
   Status: ✅ Healthy
   Total Articles: 1234
   Newest Article: 2.5 hours ago
   Message: Cache is healthy

🔍 Fetching articles from cache...

  📰 Topic: "technology"
     Fetched: 12 articles from cache
     Relevant: 6 articles after filtering
     🤖 Generating summary...
     ✅ Summary generated (487 chars)

  📰 Topic: "sports"
     Fetched: 8 articles from cache
     Relevant: 6 articles after filtering
     🤖 Generating summary...
     ✅ Summary generated (412 chars)

================================================================================
📊 RESULTS SUMMARY
================================================================================

✅ Successful: 2/2 topics
❌ Failed: 0/2 topics
📄 Total articles fetched: 18

🔗 Combining summaries...
✅ Combined summary generated (1,234 chars)

================================================================================
🎉 TEST COMPLETE
================================================================================

👋 Goodbye!
```

### Step 5: Run Interactive Test (Optional)

For more control, run the interactive version:

```bash
npm run test:fetch:interactive
```

**Expected Output:**
```
╔════════════════════════════════════════════╗
║  Manual Fetch Testing - Interactive Mode  ║
╚════════════════════════════════════════════╝

📊 Fetching cache statistics...
[Cache stats displayed...]

Test Options:
  1) Quick test with predefined topics
  2) Custom test (enter your own topics)
  3) View sample articles for a topic
  4) Exit

Select option (1-4): 
```

Type `2` and press Enter for custom test:

```
Enter topics (comma-separated): technology, health
Enter custom topics (comma-separated, or press Enter to skip): AI Ethics
Word count (default 200): 300
Good news only? (y/n, default n): n

🚀 Initiating manual fetch test...
[Test runs...]

Run another test? (y/n): n

👋 Goodbye!
```

---

## 📝 Example cURL Commands

### Check Cache Stats
```bash
curl http://localhost:8000/api/test-fetch/cache-stats | jq
```

**Response:**
```json
{
  "success": true,
  "health": {
    "healthy": true,
    "total": 1234,
    "newestArticleAge": "2.5 hours ago",
    "categories": 45,
    "sources": 67,
    "message": "Cache is healthy"
  },
  "stats": {
    "total": 1234,
    "categories": [
      {"category": "technology", "count": 234},
      {"category": "sports", "count": 189}
    ]
  }
}
```

### Get Sample Articles
```bash
curl "http://localhost:8000/api/test-fetch/sample-articles/technology?limit=3" | jq
```

**Response:**
```json
{
  "success": true,
  "topic": "technology",
  "count": 3,
  "articles": [
    {
      "title": "AI Breakthrough in NLP",
      "description": "Researchers announce...",
      "source": "TechCrunch",
      "url": "https://...",
      "publishedAt": "2024-01-15T10:15:00.000Z"
    }
  ]
}
```

### Run Manual Fetch Test
```bash
curl -X POST http://localhost:8000/api/test-fetch \
  -H "Content-Type: application/json" \
  -d '{
    "topics": ["technology", "sports"],
    "wordCount": 200
  }' | jq
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "totalTopics": 2,
    "successfulTopics": 2,
    "failedTopics": 0,
    "totalArticles": 18,
    "cacheHealth": {
      "healthy": true,
      "total": 1234
    }
  },
  "combinedSummary": "Welcome to your news summary...",
  "topicResults": [
    {
      "topic": "technology",
      "status": "success",
      "articlesFound": 12,
      "relevantArticles": 6,
      "summaryLength": 487,
      "summary": "In technology news...",
      "articles": [...]
    }
  ]
}
```

---

## 🎯 Real-World Testing Scenarios

### Scenario 1: Testing a New Feature

You're implementing a new summarization style and want to test it:

```bash
# Test with multiple topics to see how it handles variety
curl -X POST http://localhost:8000/api/test-fetch \
  -H "Content-Type: application/json" \
  -d '{
    "topics": ["technology", "sports", "health"],
    "wordCount": 500
  }' | jq '.topicResults[] | {topic, summaryLength, status}'
```

### Scenario 2: Validating Topic Coverage

Check if a new topic has enough articles:

```bash
# First, see what topics are available
curl http://localhost:8000/api/test-fetch/cache-stats | jq '.stats.categories[] | select(.count > 10) | .category'

# Then test with that topic
curl -X POST http://localhost:8000/api/test-fetch \
  -H "Content-Type: application/json" \
  -d '{"topics": ["quantum-computing"], "wordCount": 200}' | jq '.topicResults[0].articlesFound'
```

### Scenario 3: Testing Filter Logic

Test your good news filter:

```bash
# Without filter
curl -X POST http://localhost:8000/api/test-fetch \
  -H "Content-Type: application/json" \
  -d '{"topics": ["health"], "goodNewsOnly": false}' | jq '.summary.totalArticles'

# With filter (should have fewer articles)
curl -X POST http://localhost:8000/api/test-fetch \
  -H "Content-Type: application/json" \
  -d '{"topics": ["health"], "goodNewsOnly": true}' | jq '.summary.totalArticles'
```

### Scenario 4: Source Exclusion Testing

Test excluding specific sources:

```bash
curl -X POST http://localhost:8000/api/test-fetch \
  -H "Content-Type: application/json" \
  -d '{
    "topics": ["technology"],
    "excludedSources": ["techcrunch", "wired"]
  }' | jq '.topicResults[0].articles[] | .source'
```

---

## 🐛 Troubleshooting Examples

### Problem: "Cache is not healthy"

**Check cache:**
```bash
npm run test:cache
```

**If empty, populate it:**
```bash
node scripts/run-categorization-now.js
```

**Wait and check progress:**
```bash
# Wait 30 seconds, then check again
sleep 30 && npm run test:cache
```

### Problem: "No cached articles found for topic"

**See what's available:**
```bash
curl http://localhost:8000/api/test-fetch/cache-stats | jq '.stats.categories[].category' | head -20
```

**Use one of those topics:**
```bash
# If you see "artificial-intelligence" in the list:
curl -X POST http://localhost:8000/api/test-fetch \
  -H "Content-Type: application/json" \
  -d '{"topics": ["artificial-intelligence"]}'
```

### Problem: OpenAI API Error

**Check your API key:**
```bash
grep OPENAI_API_KEY .env
```

**If not set:**
```bash
echo "OPENAI_API_KEY=sk-your-key-here" >> .env
```

**Restart backend:**
```bash
# Stop current backend (Ctrl+C)
# Then restart:
npm start
```

---

## 📊 Performance Benchmarking

Time how long tests take:

```bash
# Quick test timing
time npm run test:fetch

# Custom test timing
time curl -X POST http://localhost:8000/api/test-fetch \
  -H "Content-Type: application/json" \
  -d '{"topics": ["technology", "sports", "business"], "wordCount": 1000}' > /dev/null
```

**Expected Times:**
- Quick test: ~5-10 seconds
- 3 topics, 200 words: ~8-15 seconds  
- 5 topics, 1000 words: ~20-30 seconds

---

## ✅ Verification Checklist

After running tests, verify:

- [ ] Cache health shows "Healthy"
- [ ] Articles are fetched successfully
- [ ] Summaries are generated
- [ ] No error messages in output
- [ ] Response time is reasonable (<30s)
- [ ] Topics match what you requested
- [ ] Article counts make sense
- [ ] Sources are not excluded incorrectly

---

## 🎓 What You Learned

You now know how to:
- ✅ Check cache health
- ✅ Run quick tests
- ✅ Run interactive tests
- ✅ Test via cURL/API directly
- ✅ View available topics
- ✅ Sample articles for a topic
- ✅ Test different configurations
- ✅ Debug issues when they arise

---

## 🚀 Next Steps

1. **Integrate into workflow**: Add to your pre-commit hooks
2. **Automate testing**: Create test suites for different scenarios
3. **Monitor performance**: Track how long tests take over time
4. **Expand coverage**: Test edge cases and error conditions

---

**You're all set!** 🎉

Happy testing! If you have questions, refer to:
- [QUICK_TEST_GUIDE.md](../QUICK_TEST_GUIDE.md) - Quick reference
- [MANUAL_FETCH_TESTING.md](../MANUAL_FETCH_TESTING.md) - Full documentation
- [TEST_FETCH_SUMMARY.md](../TEST_FETCH_SUMMARY.md) - Overview
