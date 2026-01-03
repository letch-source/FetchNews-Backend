# 🧪 Testing Your Development Backend

## ✅ Setup Complete!

I've already configured your iOS app to use the dev backend automatically:
- ✅ `ApiClient.swift` - Uses `localhost:3001` in DEBUG mode
- ✅ `Info.plist` - Allows localhost connections
- ✅ Dev server running on port 3001

## 🎯 Testing Methods

### Method 1: iOS App (Best for Full Testing)

**Your iOS app is already configured!** Just run it:

1. **Build & Run in Xcode** (⌘R)
   - In DEBUG mode → Uses `http://localhost:3001`
   - In RELEASE mode → Uses production

2. **Make backend changes**
   - Edit any file in `/Library/FetchNews/backend/`
   - Server auto-reloads immediately
   - Test the change in your app

3. **Watch real-time logs**
```bash
tail -f /Users/finlaysmith/.cursor/projects/Library-FetchNews-App-FetchNews-code-workspace/terminals/5.txt
```

**Workflow:**
```
Edit Backend Code → Save → Server Auto-Reloads → Test in iOS App
```

---

### Method 2: curl (Quick Endpoint Testing)

Test individual endpoints from terminal:

#### Health Check
```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{
  "status": "ok",
  "jwtConfigured": true,
  "newsConfigured": true,
  "ttsConfigured": true
}
```

#### Get Trending Topics
```bash
curl http://localhost:3001/api/trending-topics
```

#### Get Recommended Topics
```bash
curl http://localhost:3001/api/recommended-topics
```

#### Get News Sources
```bash
curl http://localhost:3001/api/news-sources
```

#### Summarize (with auth)
```bash
# First, get a token by logging in via the iOS app
# Then use it here:
curl -X POST http://localhost:3001/api/summarize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "topics": ["Technology"],
    "wordCount": 200
  }'
```

#### Test with Pretty Output
```bash
# Install jq if you don't have it
brew install jq

# Then use it for nice formatting
curl -s http://localhost:3001/api/health | jq .
```

---

### Method 3: Postman / Insomnia (API Testing)

**Setup:**

1. **Download Postman** (https://postman.com) or **Insomnia**
2. **Create a new collection**: "FetchNews Dev"
3. **Base URL**: `http://localhost:3001`

**Useful Requests:**

```
GET  /api/health
GET  /api/trending-topics
GET  /api/recommended-topics
GET  /api/news-sources
POST /api/summarize
POST /api/tts
GET  /api/custom-topics (requires auth)
POST /api/custom-topics (requires auth)
```

**Add Auth Token:**
- Get token from iOS app after login
- Add header: `Authorization: Bearer YOUR_TOKEN`

---

### Method 4: Watch Server Logs

See everything happening in real-time:

```bash
# Live logs
tail -f /Users/finlaysmith/.cursor/projects/Library-FetchNews-App-FetchNews-code-workspace/terminals/5.txt

# Last 50 lines
tail -50 /Users/finlaysmith/.cursor/projects/Library-FetchNews-App-FetchNews-code-workspace/terminals/5.txt

# Search for errors
grep -i error /Users/finlaysmith/.cursor/projects/Library-FetchNews-App-FetchNews-code-workspace/terminals/5.txt
```

You'll see:
- 📥 All incoming requests
- 📤 All responses
- ❌ Errors and stack traces
- 💾 Database queries
- 🔍 Debug info

---

### Method 5: MongoDB Database Inspection

Check your test data:

```bash
# Connect to dev database
mongosh mongodb://localhost:27017/fetchnews_dev

# View all collections
show collections

# View users
db.users.find().pretty()

# Count users
db.users.countDocuments()

# Find specific user
db.users.findOne({email: "test@example.com"})

# View custom topics
db.users.findOne({email: "your-email"}).customTopics

# View summary history
db.users.findOne({email: "your-email"}).summaryHistory

# Clear all data (safe - it's just dev!)
db.dropDatabase()

# Exit
exit
```

---

## 🔄 Development Workflow

### Typical Testing Flow:

```bash
# 1. Make a change to your backend
cd /Library/FetchNews/backend
nano routes/customTopics.js  # or any file

# 2. Save the file
# Server automatically reloads!

# 3. Check logs for errors
tail -20 /Users/finlaysmith/.cursor/projects/Library-FetchNews-App-FetchNews-code-workspace/terminals/5.txt

# 4. Test with curl (quick check)
curl http://localhost:3001/api/health

# 5. Test with iOS app (full test)
# Run app in Xcode (⌘R)

# 6. Check MongoDB if needed
mongosh fetchnews_dev --eval "db.users.find()"
```

---

## 🧪 Testing Specific Features

### Testing News Summarization

```bash
curl -X POST http://localhost:3001/api/summarize \
  -H "Content-Type: application/json" \
  -d '{
    "topics": ["Technology", "Science"],
    "wordCount": 200,
    "goodNewsOnly": false
  }'
```

### Testing Custom Topics (requires auth)

**1. Get a token from your iOS app:**
- Run app and login
- Add a breakpoint or print statement in `ApiClient.swift` after login
- Copy the token

**2. Test custom topics:**
```bash
TOKEN="your-token-here"

# Add custom topic
curl -X POST http://localhost:3001/api/custom-topics \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"topic": "AI Research"}'

# Get custom topics
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/custom-topics

# Remove custom topic
curl -X POST http://localhost:3001/api/custom-topics/remove \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"topic": "AI Research"}'
```

### Testing TTS (Text-to-Speech)

```bash
curl -X POST http://localhost:3001/api/tts \
  -H "Content-Type: application/json" \
  -d '{
    "text": "This is a test of text to speech.",
    "voice": "alloy"
  }'
```

---

## 🐛 Debugging Tips

### Enable Verbose Logging

Already enabled in development! Check `.env`:
```bash
DEBUG=true
LOG_LEVEL=debug
```

### Common Issues

**1. Port 3001 not responding**
```bash
# Check if server is running
lsof -i :3001

# If not, start it
cd /Library/FetchNews/backend && npm run dev
```

**2. "Cannot connect to server" in iOS**
```bash
# Verify server is running
curl http://localhost:3001/api/health

# Check iOS is using localhost
# Open ApiClient.swift and verify:
# #if DEBUG section has localhost:3001
```

**3. MongoDB connection errors**
```bash
# Check MongoDB is running
brew services list | grep mongodb

# Start if needed
brew services start mongodb-community
```

**4. API returns errors**
```bash
# Check server logs
tail -50 /Users/finlaysmith/.cursor/projects/Library-FetchNews-App-FetchNews-code-workspace/terminals/5.txt | grep -i error

# Check database
mongosh fetchnews_dev
```

---

## 📊 Monitoring Performance

### Response Times

Add this to see how long requests take:

```bash
# Test endpoint speed
time curl -s http://localhost:3001/api/health

# Test summarization speed
time curl -s -X POST http://localhost:3001/api/summarize \
  -H "Content-Type: application/json" \
  -d '{"topics": ["Tech"], "wordCount": 200}'
```

### Memory Usage

```bash
# Check Node process memory
ps aux | grep node

# Or use htop
htop
# Press F4 and search for "node"
```

---

## 🎯 Test Scenarios

### Scenario 1: New Feature Development

```bash
# 1. Create feature branch
git checkout -b feature/new-endpoint

# 2. Add new endpoint
# Edit: /Library/FetchNews/backend/routes/...

# 3. Test with curl
curl http://localhost:3001/api/new-endpoint

# 4. Test with iOS app
# Run in Xcode

# 5. Verify data in MongoDB
mongosh fetchnews_dev

# 6. Commit when working
git add .
git commit -m "feat: Add new endpoint"
```

### Scenario 2: Bug Fix

```bash
# 1. Reproduce bug in dev
# Use iOS app with dev server

# 2. Check logs for error
tail -f terminals/5.txt

# 3. Add debug logging
console.log('[DEBUG]', variableName);

# 4. Fix the issue
# Edit backend files

# 5. Verify fix
# Test with iOS app

# 6. Clean up debug logs and commit
```

### Scenario 3: API Integration Test

```bash
# Test complete flow:

# 1. Login (get token)
# Use iOS app

# 2. Create custom topic
curl -X POST ... /api/custom-topics

# 3. Fetch news with custom topic
curl -X POST ... /api/summarize

# 4. Check summary history
curl ... /api/summary-history

# 5. Verify in database
mongosh fetchnews_dev
db.users.findOne({email: "test@example.com"})
```

---

## 📝 Testing Checklist

Before deploying to production:

- [ ] Health endpoint responds
- [ ] All API endpoints tested with curl
- [ ] Full user flow tested in iOS app
- [ ] Database operations verified
- [ ] Error cases handled properly
- [ ] Logs show no errors
- [ ] Performance acceptable (< 3s for summary)
- [ ] Auth working correctly
- [ ] No memory leaks (monitor with `ps aux`)

---

## 🎓 Pro Tips

1. **Use multiple terminals:**
   - Terminal 1: Server logs (tail -f ...)
   - Terminal 2: Testing (curl commands)
   - Terminal 3: MongoDB shell
   - Terminal 4: Code editing

2. **Create test scripts:**
   ```bash
   # Save common tests
   echo 'curl http://localhost:3001/api/health' > test-health.sh
   chmod +x test-health.sh
   ./test-health.sh
   ```

3. **Use environment for tokens:**
   ```bash
   # Save token for testing
   export DEV_TOKEN="your-long-token-here"
   
   # Use in requests
   curl -H "Authorization: Bearer $DEV_TOKEN" \
     http://localhost:3001/api/custom-topics
   ```

4. **Quick test all endpoints:**
   ```bash
   # Create a test script
   endpoints=(
     "/api/health"
     "/api/trending-topics"
     "/api/recommended-topics"
     "/api/news-sources"
   )
   
   for endpoint in "${endpoints[@]}"; do
     echo "Testing $endpoint"
     curl -s "http://localhost:3001$endpoint" | jq .status
   done
   ```

---

## 🚀 You're Ready to Test!

Your development environment is fully configured:
- ✅ iOS app → localhost:3001
- ✅ Server → auto-reloads on changes
- ✅ Logs → visible in real-time
- ✅ Database → separate dev data

**Start testing:**
```bash
# Run iOS app in Xcode
# Make backend changes
# See results immediately!
```

Happy testing! 🎉

