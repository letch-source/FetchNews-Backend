# 🎯 START HERE: Development Environment Setup

> **Your Complete Guide to Setting Up Dev & Production Environments**

---

## 📖 What This Is About

You asked: *"How do I create a development version of the backend to test features before production?"*

**Answer:** Use environment-based configuration! Same codebase, different settings.

This guide includes everything you need to:
- ✅ Set up a safe development environment
- ✅ Test features without affecting production
- ✅ Use separate databases for dev and prod
- ✅ Switch between environments easily

---

## 🚀 Quick Start (5 Minutes)

### Option 1: Automated Setup (Recommended)

```bash
cd /Library/FetchNews/backend

# Run the automated setup script
./dev-start.sh
```

This script will:
1. Check if `.env` exists (create if not)
2. Verify MongoDB is running (start if not)
3. Check Redis (optional)
4. Validate configuration
5. Start the dev server

### Option 2: Manual Setup

```bash
cd /Library/FetchNews/backend

# 1. Create .env file
npm run setup:dev

# 2. Edit .env and add your API keys
nano .env
# Required: NEWSAPI_KEY, OPENAI_API_KEY

# 3. Start MongoDB and Redis
brew services start mongodb-community
brew services start redis

# 4. Verify configuration
npm run check:env

# 5. Start dev server
npm run dev
```

---

## 📁 What Was Created For You

### New Files & Scripts

```
/Library/FetchNews/backend/
│
├── 📄 START_HERE.md                    ← You are here
├── 📄 DEV_ENVIRONMENT_README.md        ← Complete guide
├── 📄 QUICK_START_DEV.md               ← Quick reference
├── 📄 DEVELOPMENT_SETUP.md             ← Detailed setup
│
├── 🔧 config/
│   └── environment.js                  ← Environment config helper
│
├── 📜 scripts/
│   ├── setup-dev-env.js                ← Creates .env file
│   └── check-environment.js            ← Validates configuration
│
├── 🚀 dev-start.sh                     ← One-command startup
│
└── 📦 package.json                     ← Updated with new scripts
```

### Updated Files

- ✅ `package.json` - Added dev scripts
- ✅ `.gitignore` - Protects environment files
- ✅ Ready to use!

---

## 🎮 Commands You Can Use Now

### Setup Commands

```bash
# Create .env file for development
npm run setup:dev

# Check if everything is configured correctly
npm run check:env

# Quick environment info
npm run test:env

# One-command startup (checks + starts)
./dev-start.sh
```

### Development Commands

```bash
# Start development server (auto-reload)
npm run dev

# Start with Node inspector (for debugging)
npm run dev:watch

# Check environment while server is running
npm run check:env
```

### Production Commands

```bash
# Start in production mode (locally)
npm run start:prod

# Regular start (uses current NODE_ENV)
npm start
```

---

## 🏗️ How It Works

### The Architecture

```
Your Codebase (One set of files)
         │
         ├─────────────┬─────────────┐
         │             │             │
    .env (dev)    .env.prod    .env.test
         │             │             │
         ▼             ▼             ▼
   Development    Production     Testing
   localhost:3001  Render.com   CI/CD
   fetchnews_dev   fetchnews    test_db
   Verbose logs    Minimal logs Mock APIs
```

### Environment Variables Control Everything

Same code behaves differently based on `NODE_ENV`:

```javascript
// Automatically configured for you in config/environment.js
if (NODE_ENV === 'development') {
  // Port 3001
  // Database: fetchnews_dev
  // Verbose logging
  // Lenient rate limits
  // Full error messages
}

if (NODE_ENV === 'production') {
  // Port 10000
  // Database: fetchnews
  // Minimal logging
  // Strict rate limits
  // Generic error messages
}
```

---

## 📋 Your Dev vs Prod Setup

### Development Environment (Your Computer)

| Setting | Value |
|---------|-------|
| **Location** | Your Mac |
| **Port** | 3001 |
| **Database** | fetchnews_dev |
| **Start Command** | `npm run dev` |
| **Purpose** | Safe testing |
| **Auto-reload** | ✅ Yes |
| **Logging** | 📢 Verbose |
| **Data** | Test data |

### Production Environment (Render.com)

| Setting | Value |
|---------|-------|
| **Location** | Render.com |
| **Port** | 10000 |
| **Database** | fetchnews |
| **Start Command** | `npm start` |
| **Purpose** | Real users |
| **Auto-reload** | ❌ No |
| **Logging** | 🤫 Minimal |
| **Data** | Real users |

---

## 📚 Documentation Index

Choose your learning style:

### 🏃 Quick Learner
**Read:** `QUICK_START_DEV.md`  
**Time:** 5 minutes  
**Gets you:** Running server immediately

### 📖 Detailed Learner
**Read:** `DEVELOPMENT_SETUP.md`  
**Time:** 15 minutes  
**Gets you:** Deep understanding of setup

### 🎓 Complete Learner
**Read:** `DEV_ENVIRONMENT_README.md`  
**Time:** 30 minutes  
**Gets you:** Master of dev environments

### 💻 Code Reference
**Read:** `config/environment.js`  
**Time:** 10 minutes  
**Gets you:** How to customize settings

---

## ✅ Pre-Flight Checklist

Before starting development, ensure:

- [ ] Node.js 18+ installed (`node --version`)
- [ ] MongoDB installed (`brew install mongodb-community`)
- [ ] Redis installed - optional (`brew install redis`)
- [ ] `.env` file created (`npm run setup:dev`)
- [ ] API keys added to `.env`
- [ ] MongoDB running (`brew services list`)
- [ ] Configuration valid (`npm run check:env`)
- [ ] Dev server starts (`npm run dev`)
- [ ] Health check passes (`curl localhost:3001/api/health`)

---

## 🎯 Common Workflows

### Starting Your Day

```bash
cd /Library/FetchNews/backend
./dev-start.sh
```

### Creating a New Feature

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Start dev server
npm run dev

# 3. Code, test, iterate
# Watch logs in terminal

# 4. Commit when ready
git add .
git commit -m "feat: Add my feature"
git push
```

### Testing Before Production

```bash
# 1. Develop in dev environment
npm run dev

# 2. Test thoroughly
# Use your iOS app pointed to localhost:3001

# 3. Check configuration
npm run check:env

# 4. When satisfied, deploy to production
git push origin main
```

---

## 🆘 Quick Troubleshooting

### ".env file not found"
```bash
npm run setup:dev
```

### "MongoDB connection failed"
```bash
brew services start mongodb-community
```

### "Port 3001 in use"
```bash
lsof -i :3001
kill -9 <PID>
```

### "Environment variables not loading"
```bash
npm run check:env
# Fix any issues shown
```

### More Help?
- Check `QUICK_START_DEV.md` troubleshooting section
- Read `DEVELOPMENT_SETUP.md` for detailed solutions

---

## 🔐 Security Notes

✅ **What's Safe:**
- Using same codebase for dev/prod
- Separate databases (fetchnews_dev vs fetchnews)
- Different JWT secrets
- Testing freely in development

⚠️ **What to Avoid:**
- Never commit `.env` files
- Never connect to production DB from dev
- Never use production secrets in development
- Never test unverified code in production

---

## 🎓 Learn More

### Recommended Reading Order:

1. **This file** (START_HERE.md) - Overview ← You are here
2. **QUICK_START_DEV.md** - Get running fast
3. **DEV_ENVIRONMENT_README.md** - Complete guide
4. **DEVELOPMENT_SETUP.md** - Deep dive
5. **config/environment.js** - Implementation details

---

## 💡 Pro Tips

1. **Always start with dev environment**
   ```bash
   npm run dev  # Not npm start
   ```

2. **Check configuration regularly**
   ```bash
   npm run check:env
   ```

3. **Use the automated script**
   ```bash
   ./dev-start.sh  # Checks everything
   ```

4. **Keep production secrets secure**
   - Never in git
   - Never in screenshots
   - Never in logs

5. **Test thoroughly before deploying**
   - Run in dev first
   - Verify all endpoints
   - Check error handling

---

## 📞 Need Help?

### Quick Reference Commands

```bash
# Show available scripts
npm run

# Check what's configured
npm run check:env

# View environment
npm run test:env

# Start dev server
npm run dev

# Full automated setup
./dev-start.sh
```

### Still Stuck?

1. Read error messages carefully
2. Check `npm run check:env` output
3. Review relevant documentation file
4. Verify services are running: `brew services list`

---

## 🎉 You're Ready!

Everything is set up and ready to use. Your next steps:

1. **Run the setup:**
   ```bash
   ./dev-start.sh
   ```

2. **Start coding:**
   - Make changes
   - Test locally
   - Deploy when ready

3. **Read more if needed:**
   - Check `QUICK_START_DEV.md` for quick reference
   - Read `DEV_ENVIRONMENT_README.md` for complete guide

---

## 📊 What You Gain

✅ **Safety** - Test without breaking production  
✅ **Speed** - Auto-reload saves time  
✅ **Confidence** - Verify before deploy  
✅ **Flexibility** - Experiment freely  
✅ **Professionalism** - Industry best practice  

---

**Happy Coding! 🚀**

```bash
cd /Library/FetchNews/backend && ./dev-start.sh
```

