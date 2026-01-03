#!/bin/bash

# Quick fetch test script
# Usage: ./backend/scripts/quick-fetch-test.sh

BASE_URL="${BASE_URL:-http://localhost:8000}"

echo ""
echo "╔════════════════════════════════════════╗"
echo "║     Quick Manual Fetch Test           ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Check if server is running
echo "🔍 Checking if server is running..."
if ! curl -s "$BASE_URL/health" > /dev/null; then
    echo "❌ Server is not running at $BASE_URL"
    echo "💡 Start it with: cd backend && npm start"
    exit 1
fi
echo "✅ Server is running"
echo ""

# Check cache health
echo "🏥 Checking cache health..."
CACHE_RESPONSE=$(curl -s "$BASE_URL/api/test-fetch/cache-stats")
CACHE_HEALTHY=$(echo "$CACHE_RESPONSE" | grep -o '"healthy":[^,]*' | grep -o 'true\|false')
CACHE_TOTAL=$(echo "$CACHE_RESPONSE" | grep -o '"total":[0-9]*' | grep -o '[0-9]*')

if [ "$CACHE_HEALTHY" = "true" ]; then
    echo "✅ Cache is healthy ($CACHE_TOTAL articles)"
else
    echo "⚠️  Cache is not healthy"
    echo "💡 Run: node backend/scripts/run-categorization-now.js"
    echo ""
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
echo ""

# Run test
echo "🧪 Running manual fetch test..."
echo "   Topics: technology, sports"
echo "   Word Count: 200"
echo ""

TEST_RESPONSE=$(curl -s -X POST "$BASE_URL/api/test-fetch" \
  -H "Content-Type: application/json" \
  -d '{
    "topics": ["technology", "sports"],
    "wordCount": 200,
    "goodNewsOnly": false
  }')

# Parse results
SUCCESS=$(echo "$TEST_RESPONSE" | grep -o '"success":[^,]*' | grep -o 'true\|false')
TOTAL_TOPICS=$(echo "$TEST_RESPONSE" | grep -o '"totalTopics":[0-9]*' | grep -o '[0-9]*' | head -1)
SUCCESSFUL=$(echo "$TEST_RESPONSE" | grep -o '"successfulTopics":[0-9]*' | grep -o '[0-9]*' | head -1)
FAILED=$(echo "$TEST_RESPONSE" | grep -o '"failedTopics":[0-9]*' | grep -o '[0-9]*' | head -1)
TOTAL_ARTICLES=$(echo "$TEST_RESPONSE" | grep -o '"totalArticles":[0-9]*' | grep -o '[0-9]*' | head -1)

if [ "$SUCCESS" = "true" ]; then
    echo "✅ Test completed successfully!"
    echo ""
    echo "📊 Results:"
    echo "   Total Topics: $TOTAL_TOPICS"
    echo "   Successful: $SUCCESSFUL"
    echo "   Failed: $FAILED"
    echo "   Total Articles: $TOTAL_ARTICLES"
    echo ""
    
    # Save full response to temp file for inspection
    TEMP_FILE="/tmp/fetch-test-result-$(date +%s).json"
    echo "$TEST_RESPONSE" > "$TEMP_FILE"
    echo "💾 Full results saved to: $TEMP_FILE"
    echo ""
    echo "To view:"
    echo "   cat $TEMP_FILE | jq"
    echo ""
else
    echo "❌ Test failed"
    echo ""
    echo "Error response:"
    echo "$TEST_RESPONSE" | jq 2>/dev/null || echo "$TEST_RESPONSE"
    exit 1
fi

echo "🎉 Done!"
echo ""
