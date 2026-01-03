# 🚀 Quick Start: Development Environment

This guide gets you up and running with a development environment in 5 minutes.

## ⚡ TL;DR - Quick Commands

```bash
cd /Library/FetchNews/backend

# 1. Run setup script
node scripts/setup-dev-env.js

# 2. Edit .env and add your API keys
nano .env

# 3. Start development server
npm run dev

# 4. Test it works
curl http://localhost:3001/api/health
```

## 📋 Step-by-Step Setup

### 1. Create Your Development Environment File

```bash
cd /Library/FetchNews/backend
node scripts/setup-dev-env.js
```

This creates a `.env` file with development defaults.

### 2. Add Your API Keys

Open `.env` and add at minimum:

```bash
NEWSAPI_KEY=your-actual-newsapi-key
OPENAI_API_KEY=your-actual-openai-key
```

**Where to get these:**
- NewsAPI: https://newsapi.org/register
- OpenAI: https://platform.openai.com/api-keys

### 3. Start Local Services

**MongoDB:**
```bash
brew services start mongodb-community
# Or: mongod --config /usr/local/etc/mongod.conf
```

**Redis (optional but recommended):**
```bash
brew services start redis
# Or: redis-server
```

### 4. Start Development Server

```bash
npm run dev
```

You should see:
```
📋 Environment Configuration
Environment: development
Port: 3001
MongoDB: mongodb://localhost:27017/fetchnews_dev
...
Server running on port 3001
```

### 5. Test It Works

Open a new terminal and test:

```bash
# Health check
curl http://localhost:3001/api/health

# Should return: {"status":"ok"}
```

## 🎯 Development vs Production

| Feature | Development | Production |
|---------|-------------|------------|
| **Port** | 3001 | 10000 |
| **Database** | fetchnews_dev | fetchnews |
| **Auto-reload** | ✅ Yes (nodemon) | ❌ No |
| **Logs** | 📢 Verbose | 🤫 Errors only |
| **Rate limits** | 🔓 1000/15min | 🔒 100/15min |
| **JWT expiry** | 7 days | 24 hours |
| **APNs mode** | Sandbox | Production |

## 🔄 Switching Environments

```bash
# Development (auto-reload, verbose logging)
npm run dev

# Production mode locally (test prod config)
npm run start:prod

# Check current environment
npm run test:env
```

## 🧪 Testing Features Safely

### Development Workflow:

```bash
# 1. Start dev server
npm run dev

# 2. Make code changes
# Files auto-reload when you save

# 3. Test your changes
# Use Postman, curl, or your iOS app pointed to localhost:3001

# 4. Check the logs in terminal
# All requests and errors are logged

# 5. When ready, deploy to production
git add .
git commit -m "Add new feature"
git push origin main
```

### iOS App Configuration

Point your app to localhost during development:

```swift
// In ApiClient.swift
#if DEBUG
    static let baseURL = "http://localhost:3001/api"
#else
    static let baseURL = "https://your-production-url.com/api"
#endif
```

## 🗄️ Database Management

### View Development Data:

```bash
# Connect to MongoDB
mongosh mongodb://localhost:27017/fetchnews_dev

# List all users
db.users.find().pretty()

# Clear all users
db.users.deleteMany({})

# Exit
exit
```

### Separate Dev/Prod Databases:

- **Dev**: `fetchnews_dev` - Safe to delete and reset
- **Prod**: `fetchnews` - Real user data, never touch

## 🎛️ Common Development Tasks

### Add Test User:

```bash
mongosh mongodb://localhost:27017/fetchnews_dev

db.users.insertOne({
  email: "test@example.com",
  googleId: "test123",
  name: "Test User",
  plan: "pro",
  subscriptionStatus: "active",
  createdAt: new Date()
})
```

### Clear Cache:

```bash
redis-cli -n 1 FLUSHDB
```

### View Logs in Real-Time:

```bash
# Development server shows all logs
npm run dev

# Or tail the logs if running in background
tail -f logs/development.log
```

### Debug with Inspector:

```bash
# Start with Node inspector
npm run dev:watch

# Then open Chrome and go to:
# chrome://inspect
```

## ❌ Troubleshooting

### Port 3001 Already in Use

```bash
# Find what's using the port
lsof -i :3001

# Kill it
kill -9 <PID>

# Or change port in .env
PORT=3002
```

### MongoDB Connection Failed

```bash
# Check if MongoDB is running
brew services list | grep mongodb

# Start it
brew services start mongodb-community

# Check status
mongosh --eval "db.runCommand({ping: 1})"
```

### Redis Connection Failed

```bash
# Check if Redis is running
brew services list | grep redis

# Start it
brew services start redis

# Test connection
redis-cli -n 1 ping
```

### Module Not Found Errors

```bash
# Reinstall dependencies
rm -rf node_modules
npm install
```

### Environment Variables Not Loading

```bash
# Verify .env file exists
ls -la .env

# Test environment loading
npm run test:env

# Check for syntax errors in .env
# (no spaces around =, no quotes unless needed)
```

## 📊 Monitoring Development Server

### Watch for Changes:

The development server uses `nodemon` and automatically reloads when you:
- Change `.js` files
- Modify routes
- Update models

You'll see: `[nodemon] restarting due to changes...`

### Check Memory Usage:

```bash
# While server is running
ps aux | grep node

# Or use htop
htop
```

## 🔐 Security Notes

- ✅ Different JWT secret for dev
- ✅ Separate database
- ✅ Never commit `.env` to git
- ✅ Use test API keys when possible
- ✅ Keep production secrets secure

## 📝 Useful Commands Cheat Sheet

```bash
# Start development
npm run dev

# Start with debugging
npm run dev:watch

# Check environment
npm run test:env

# Install new package
npm install package-name

# Update dependencies
npm update

# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# View package info
npm list --depth=0
```

## 🎓 Best Practices

1. **Always develop in dev environment first**
   - Never test experimental features in production
   - Use separate databases

2. **Use meaningful commit messages**
   - `feat: Add user profile endpoint`
   - `fix: Resolve auth token expiration bug`
   - `refactor: Improve caching logic`

3. **Test thoroughly before deploying**
   - Test all endpoints
   - Check error handling
   - Verify database operations

4. **Keep dependencies updated**
   - Run `npm outdated` weekly
   - Update one at a time
   - Test after each update

5. **Monitor logs during development**
   - Watch for warnings
   - Fix deprecation notices
   - Handle errors gracefully

## 🆘 Need Help?

Check the detailed setup guide:
```bash
cat DEVELOPMENT_SETUP.md
```

Or check the environment configuration:
```bash
cat config/environment.js
```

## 🎉 You're Ready!

Your development environment is set up. Start coding! 🚀

```bash
npm run dev
```

