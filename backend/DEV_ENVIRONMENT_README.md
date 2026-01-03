# 🔧 Development Environment - Complete Guide

## 📖 Table of Contents

1. [Quick Start](#quick-start)
2. [Why Separate Environments?](#why-separate-environments)
3. [Architecture Overview](#architecture-overview)
4. [Setup Instructions](#setup-instructions)
5. [Daily Workflow](#daily-workflow)
6. [Scripts Reference](#scripts-reference)
7. [FAQ](#faq)

---

## 🚀 Quick Start

Get your development environment running in 3 commands:

```bash
cd /Library/FetchNews/backend

# 1. Create .env file with development settings
npm run setup:dev

# 2. Add your API keys to .env (edit the file)
# Required: NEWSAPI_KEY, OPENAI_API_KEY

# 3. Start development server
npm run dev
```

**That's it!** Your development server is now running on `http://localhost:3001` 🎉

---

## 🤔 Why Separate Environments?

### Without Separate Environments:
❌ Risk breaking production while testing  
❌ Can't experiment freely  
❌ Difficult to debug issues  
❌ Mix of real and test data  
❌ One mistake = angry users  

### With Separate Environments:
✅ Test safely without affecting users  
✅ Experiment freely  
✅ Separate databases (no data mixing)  
✅ Better debugging and logging  
✅ Confidence when deploying  

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    YOUR CODEBASE                            │
│                  (Same code, different configs)             │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
     ┌─────▼─────┐                  ┌──────▼──────┐
     │    DEV    │                  │    PROD     │
     │           │                  │             │
     │  Port     │                  │  Port       │
     │  3001     │                  │  10000      │
     │           │                  │             │
     │  MongoDB  │                  │  MongoDB    │
     │  *_dev    │                  │  *_prod     │
     │           │                  │             │
     │  Verbose  │                  │  Minimal    │
     │  Logs     │                  │  Logs       │
     │           │                  │             │
     │  Test     │                  │  Real       │
     │  Data     │                  │  Users      │
     └───────────┘                  └─────────────┘
     
     Your Machine                   Render.com
     localhost:3001                 Production URL
```

---

## 📋 Setup Instructions

### Prerequisites

Make sure you have:
- ✅ Node.js 18+ (`node --version`)
- ✅ MongoDB installed (`brew install mongodb-community`)
- ✅ Redis installed (`brew install redis`) - optional but recommended
- ✅ Git configured

### Step 1: Create Development Environment

```bash
cd /Library/FetchNews/backend
npm run setup:dev
```

This creates a `.env` file with:
- `NODE_ENV=development`
- `PORT=3001`
- Separate database (`fetchnews_dev`)
- Random JWT secret
- Development defaults

### Step 2: Add Your API Keys

Open `.env` and add:

```bash
NEWSAPI_KEY=your-actual-key-here
OPENAI_API_KEY=your-actual-key-here
```

**Where to get keys:**
- NewsAPI: https://newsapi.org/register (free tier: 100 requests/day)
- OpenAI: https://platform.openai.com/api-keys ($5 credit for new users)

### Step 3: Start Local Services

```bash
# Start MongoDB
brew services start mongodb-community

# Start Redis (optional)
brew services start redis

# Verify they're running
brew services list
```

### Step 4: Verify Configuration

```bash
npm run check:env
```

This shows:
- ✓ What's configured correctly
- ✗ What's missing
- Environment-specific settings
- Security checklist

### Step 5: Start Development Server

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
✓ Connected to MongoDB
✓ Redis connected
Server running on port 3001
```

### Step 6: Test It Works

In a new terminal:

```bash
curl http://localhost:3001/api/health
# Should return: {"status":"ok"}
```

---

## 🔄 Daily Workflow

### Morning: Start Your Dev Environment

```bash
cd /Library/FetchNews/backend

# Check everything is configured
npm run check:env

# Start dev server
npm run dev
```

### During Development

1. **Make code changes** - Files auto-reload
2. **Test immediately** - Check terminal logs
3. **Use your iOS app** - Point it to `localhost:3001`
4. **Check database** - `mongosh fetchnews_dev`

### Testing a New Feature

```bash
# 1. Create feature branch
git checkout -b feature/my-new-feature

# 2. Start dev server
npm run dev

# 3. Make changes, test, iterate
# Watch the logs for errors

# 4. Verify everything works
npm run check:env

# 5. Commit and push
git add .
git commit -m "feat: Add my new feature"
git push origin feature/my-new-feature
```

### Evening: Stop Services

```bash
# Stop dev server: Ctrl+C in terminal

# Stop services (optional, can leave running)
brew services stop mongodb-community
brew services stop redis
```

---

## 📚 Scripts Reference

### Development Scripts

```bash
# Start development server (auto-reload)
npm run dev

# Start with Node inspector for debugging
npm run dev:watch
```

### Production Scripts

```bash
# Start in production mode
npm run start:prod

# Regular start (uses current NODE_ENV)
npm start
```

### Setup Scripts

```bash
# Create .env file for development
npm run setup:dev

# Check environment configuration
npm run check:env

# Quick environment info
npm run test:env
```

### Database Scripts

```bash
# Connect to dev database
mongosh mongodb://localhost:27017/fetchnews_dev

# Connect to prod database (careful!)
mongosh mongodb://localhost:27017/fetchnews

# Clear dev database
mongosh fetchnews_dev --eval "db.dropDatabase()"
```

---

## 🎯 Key Differences: Dev vs Prod

| Feature | Development | Production |
|---------|-------------|------------|
| **Purpose** | Test features safely | Serve real users |
| **Location** | Your computer | Render.com |
| **Port** | 3001 | 10000 |
| **Database** | fetchnews_dev | fetchnews |
| **Data** | Test data | Real user data |
| **Auto-reload** | Yes (nodemon) | No |
| **Logs** | Verbose debug | Errors only |
| **Rate limit** | 1000/15min | 100/15min |
| **JWT expiry** | 7 days | 24 hours |
| **Error messages** | Full details | Generic |
| **APNs** | Sandbox | Production |

---

## ❓ FAQ

### Q: Can I use the same API keys for dev and prod?
**A:** Yes, but not recommended. Better to have separate keys so you can:
- Track usage separately
- Set different rate limits
- Revoke dev keys without affecting production

### Q: Will changes in dev affect production?
**A:** No! They use:
- Separate databases
- Separate ports
- Separate configuration
- Same code, different settings

### Q: How do I deploy to production?
**A:** 
```bash
git push origin main
# Your hosting service (Render) automatically deploys
# It uses .env.production configured in Render dashboard
```

### Q: What if I accidentally use production database?
**A:** Development environment is configured to use `fetchnews_dev` by default. Always check:
```bash
npm run check:env
```

### Q: Can multiple developers work simultaneously?
**A:** Yes! Each developer:
- Runs their own local server (port 3001)
- Has their own local database
- Can work independently

### Q: How do I test push notifications in dev?
**A:** APNs automatically uses sandbox mode in development. Configure:
```bash
APN_BUNDLE_ID=com.fetchnews.app.dev  # In .env
```

### Q: What if port 3001 is already in use?
**A:** Change it in `.env`:
```bash
PORT=3002  # Or any available port
```

### Q: Do I need Redis?
**A:** Optional. Without Redis:
- Cache uses in-memory storage
- Works fine for development
- Data lost on server restart

With Redis:
- Persistent cache
- Better performance
- More realistic testing

### Q: How do I debug issues?
**A:**
```bash
# Start with inspector
npm run dev:watch

# Open Chrome
# Go to: chrome://inspect

# Or use console.log() - they show in terminal
```

### Q: Can I test production mode locally?
**A:** Yes!
```bash
# Create .env.production locally
# Then run:
npm run start:prod
```

---

## 🔒 Security Best Practices

- [ ] Different JWT secrets for dev/prod
- [ ] Separate databases
- [ ] `.env` in `.gitignore`
- [ ] Never commit secrets
- [ ] Use test API keys when possible
- [ ] Keep production keys secure
- [ ] Rotate secrets regularly
- [ ] Use HTTPS in production

---

## 🆘 Troubleshooting

### MongoDB won't start
```bash
brew services restart mongodb-community
mongosh --eval "db.runCommand({ping: 1})"
```

### Redis won't connect
```bash
brew services restart redis
redis-cli ping  # Should return: PONG
```

### Port already in use
```bash
lsof -i :3001
kill -9 <PID>
```

### Environment variables not loading
```bash
# Check file exists
ls -la .env

# Check for syntax errors (no spaces around =)
cat .env | grep -v "^#" | grep "="

# Test loading
npm run test:env
```

### Changes not reloading
```bash
# Restart nodemon
# Ctrl+C, then: npm run dev

# Check nodemon.json if present
```

---

## 📖 Additional Documentation

- **Quick Start Guide**: `QUICK_START_DEV.md`
- **Detailed Setup**: `DEVELOPMENT_SETUP.md`
- **Environment Config**: `config/environment.js`
- **Package Scripts**: `package.json`

---

## ✅ Checklist: Ready to Develop

- [ ] `.env` file created (`npm run setup:dev`)
- [ ] API keys added to `.env`
- [ ] MongoDB running (`brew services list`)
- [ ] Redis running (optional)
- [ ] Configuration verified (`npm run check:env`)
- [ ] Dev server starts (`npm run dev`)
- [ ] Health check works (`curl localhost:3001/api/health`)
- [ ] iOS app pointed to localhost:3001
- [ ] Git configured and `.env` in `.gitignore`

---

## 🎉 You're All Set!

Your development environment is ready. Time to build amazing features! 🚀

```bash
npm run dev
```

Happy coding! 💻✨

