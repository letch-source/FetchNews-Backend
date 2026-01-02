# 🌐 Web Search Setup Guide

The AI Assistant now has web search capabilities! This allows users to get real-time, current information beyond what's in their fetch.

## Setup Instructions

### 1. Get a Tavily API Key

1. **Sign up** at [https://tavily.com](https://tavily.com)
2. **Free tier includes:**
   - 1,000 searches per month
   - No credit card required
   - Perfect for getting started

3. **Copy your API key** from the dashboard

### 2. Add to Environment Variables

**Local Development:**
Add to `backend/.env`:
```bash
TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxx
```

**Render Deployment:**
1. Go to your Render dashboard
2. Select your FetchNews backend service
3. Go to **Environment** tab
4. Click **Add Environment Variable**
5. Name: `TAVILY_API_KEY`
6. Value: Your Tavily API key
7. Click **Save Changes**

The backend will automatically restart and enable web search!

### 3. Verify It's Working

Check your backend logs for:
```
[AI ASSISTANT] AI requested 1 web search(es)
[AI ASSISTANT] Searching web for: "latest Tesla news"
[AI ASSISTANT] Found 3 results
```

## How It Works

### AI Decision Making
The AI **autonomously decides** when to search the web using OpenAI's function calling:

- **User asks about fetch content** → Uses fetch data only
- **User asks for "latest" or "current"** → Searches the web
- **User asks about something not in fetch** → May search for more info

### Example Scenarios

**Scenario 1: Fetch Content**
- User: "What does article 3 say about climate change?"
- AI: *(No search)* Uses fetch content directly

**Scenario 2: Latest Updates**
- User: "What's the latest on the Tesla Cybertruck?"
- AI: *(Searches web)* "According to recent reports from today, Tesla just announced..."

**Scenario 3: Additional Context**
- User: "Who is Elon Musk?" *(mentioned in fetch)*
- AI: *(No search)* Answers from general knowledge

**Scenario 4: Breaking News**
- User: "Is there any breaking news about this?"
- AI: *(Searches web)* Provides latest developments

## Features

✅ **Smart Search Decisions** - AI only searches when beneficial  
✅ **Clear Labeling** - Distinguishes fetch vs. web content  
✅ **Fast Results** - Tavily optimized for AI applications  
✅ **Accurate Information** - High-quality, relevant sources  
✅ **Cost Effective** - Only pays when searches are performed  

## Cost Management

**Per Search:**
- OpenAI GPT-4o-mini: ~$0.0001
- Tavily search: ~$0.002
- **Total: ~$0.0021 per search**

**Monthly Estimates:**
- 10 users × 10 searches/day = 3,000 searches/month
- Cost: ~$6/month
- Free tier covers 1,000 searches

**Optimization:**
- AI only searches when needed (not every question)
- Average: 1-2 searches per 10 questions
- Actual cost: Much lower than max estimate

## Disabling Web Search

If you want to disable web search temporarily:

1. Remove `TAVILY_API_KEY` from environment variables
2. Restart the backend
3. AI assistant still works, just without web search

The feature gracefully degrades - no errors if key is missing.

## Troubleshooting

### "Search failed" in responses

**Cause:** Invalid or missing API key  
**Fix:** Check that `TAVILY_API_KEY` is set correctly

### No search results

**Cause:** Query too specific or API rate limit  
**Fix:** Check Tavily dashboard for usage limits

### Backend won't start

**Error:** `ReferenceError: tavily is not defined`  
**Fix:** Run `npm install` in backend directory

## Monitoring Usage

**Check Tavily Dashboard:**
- Login at [https://tavily.com](https://tavily.com)
- View search count
- Monitor API usage
- Upgrade if needed

**Backend Logs:**
```
[AI ASSISTANT] Searching web for: "query"
[AI ASSISTANT] Found X results
```

## Upgrading

**Tavily Pricing Tiers:**
- **Free:** 1,000 searches/month
- **Basic:** $29/month - 10,000 searches
- **Pro:** $99/month - 50,000 searches
- **Enterprise:** Custom pricing

Most apps will be fine with Free or Basic tier.

## Security Notes

- API keys are stored server-side only
- Never exposed to clients
- Searches are logged for debugging (can be disabled)
- No user data sent to Tavily except search queries

---

**Status:** ✅ Fully Implemented  
**Version:** 1.0.0  
**Last Updated:** January 2, 2026
