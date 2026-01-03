# Development Environment Setup Guide

## Overview

This guide will help you set up a proper development environment for testing features before they go to production.

## Architecture

```
Development Environment          Production Environment
├── Local machine                ├── Render.com (or your hosting)
├── Port 3001                    ├── Port 10000
├── MongoDB: fetchnews_dev       ├── MongoDB: fetchnews
├── Redis: localhost:6379/1      ├── Redis: production URL
├── B2: dev-bucket              ├── B2: production bucket
└── Dev API keys                 └── Production API keys
```

## Setup Instructions

### 1. Create Environment Files

You need TWO environment files in `/Library/FetchNews/backend/`:

#### `.env` (Development - for local testing)
```bash
# Development Environment Configuration
NODE_ENV=development
PORT=3001

# JWT Secret (DIFFERENT from production!)
JWT_SECRET=dev-jwt-secret-please-change-this-12345

# Databases - Development
MONGODB_URI=mongodb://localhost:27017/fetchnews_dev
REDIS_URL=redis://localhost:6379/1

# API Keys - Development
NEWSAPI_KEY=your-dev-newsapi-key
OPENAI_API_KEY=your-dev-openai-key
ELEVENLABS_API_KEY=your-dev-elevenlabs-key
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

# Frontend - Local
FRONTEND_ORIGIN=http://localhost:3000

# Backblaze B2 - Development bucket
B2_KEY_ID=your-dev-b2-key-id
B2_APPLICATION_KEY=your-dev-b2-app-key
B2_BUCKET_NAME=fetchnews-dev-bucket
B2_ENDPOINT=s3.us-west-004.backblazeb2.com
B2_REGION=us-west-004

# Google OAuth - Development
GOOGLE_IOS_CLIENT_ID=your-dev-ios-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_ID=your-dev-web-client-id.apps.googleusercontent.com

# Email - Development
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-dev-email@gmail.com
SMTP_PASSWORD=your-dev-app-password
SMTP_FROM_EMAIL=dev@fetchnews.app

# APNs - Development
APN_KEY_ID=your-dev-apns-key-id
APN_TEAM_ID=your-apple-team-id
APN_BUNDLE_ID=com.fetchnews.app.dev
APN_KEY_CONTENT=-----BEGIN PRIVATE KEY-----
...key content...
-----END PRIVATE KEY-----

# Dev-specific
DEBUG=true
LOG_LEVEL=debug
```

#### `.env.production` (Production - for deployed server)
```bash
# Production Environment Configuration
NODE_ENV=production
PORT=10000

# Copy your existing production values here
JWT_SECRET=your-production-jwt-secret
MONGODB_URI=your-production-mongodb-uri
# ... all your production values ...
```

### 2. Update .gitignore

Make sure these files are in your `.gitignore`:
```
.env
.env.local
.env.development
.env.production
.env.*.local
```

### 3. Running the Backend

Use the npm scripts:

```bash
# Development mode (uses .env, auto-reloads on changes)
npm run dev

# Production mode (uses .env.production)
npm run start:prod

# Regular start (uses .env)
npm start
```

### 4. Testing Workflow

```bash
# Step 1: Develop feature in dev environment
cd /Library/FetchNews/backend
npm run dev

# Step 2: Test the feature
# - Use your dev database
# - Check logs
# - Verify behavior

# Step 3: When ready, deploy to production
# - Push code to git
# - Hosting service uses .env.production
```

## Key Differences: Dev vs Production

### Development Environment
- **Purpose**: Test new features safely
- **Database**: `fetchnews_dev` (separate from production)
- **Port**: 3001 (doesn't conflict with production)
- **Logging**: Verbose (DEBUG=true)
- **Error handling**: Show detailed errors
- **Rate limiting**: More lenient
- **Auto-reload**: Yes (nodemon)
- **APNs**: Sandbox mode
- **Email**: Test email account

### Production Environment
- **Purpose**: Serve real users
- **Database**: `fetchnews` (production data)
- **Port**: 10000 (or what Render assigns)
- **Logging**: Errors only
- **Error handling**: Generic messages
- **Rate limiting**: Strict
- **Auto-reload**: No
- **APNs**: Production mode
- **Email**: Production email account

## Database Management

### Development Database
```bash
# Access your dev database
mongosh mongodb://localhost:27017/fetchnews_dev

# Clear dev database when needed
db.dropDatabase()

# Import test data
mongoimport --db fetchnews_dev --collection users --file test-users.json
```

### Production Database
- **Never connect directly** from your local machine
- Use your hosting provider's dashboard
- Always backup before changes

## API Keys Strategy

### Option 1: Shared Keys (Simpler)
Use the same API keys for dev and production:
- ✅ Easier setup
- ⚠️ Can't separate dev/prod usage in analytics
- ⚠️ Risk of hitting rate limits during testing

### Option 2: Separate Keys (Recommended)
Create separate API keys for development:
- ✅ Track usage separately
- ✅ Different rate limits
- ✅ Can revoke dev keys without affecting production
- ⚠️ More setup required

**Recommended for:**
- OpenAI (separate projects)
- NewsAPI (free tier allows one key, but paid allows multiple)
- Backblaze B2 (separate buckets, can use same keys)

## Storage Strategy

### Backblaze B2 Setup
Create two buckets:
- `fetchnews-production` - Production audio files
- `fetchnews-dev` - Development audio files

Benefits:
- Keep dev clutter separate
- Can delete dev bucket contents anytime
- Same credentials work for both

## iOS App Configuration

For testing with your iOS app:

### Development Backend
```swift
// In ApiClient.swift
#if DEBUG
    static let baseURL = "http://localhost:3001/api"
#else
    static let baseURL = "https://your-production-url.com/api"
#endif
```

### Network Security
Add to `Info.plist` for local testing:
```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
</dict>
```

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 3001
lsof -i :3001

# Kill the process
kill -9 <PID>
```

### MongoDB Connection Issues
```bash
# Check if MongoDB is running
brew services list

# Start MongoDB
brew services start mongodb-community
```

### Redis Connection Issues
```bash
# Check if Redis is running
brew services list

# Start Redis
brew services start redis
```

## Git Workflow

```bash
# Create feature branch for development
git checkout -b feature/new-feature

# Develop and test locally with dev environment
npm run dev

# When ready, push to git
git push origin feature/new-feature

# Merge to main for production deployment
git checkout main
git merge feature/new-feature
git push origin main
```

## Advanced: Multiple Dev Environments

If you need multiple developers testing simultaneously:

```bash
.env.dev1        # Developer 1
.env.dev2        # Developer 2
.env.staging     # Staging server
.env.production  # Production server
```

Run with:
```bash
NODE_ENV=dev1 npm run dev
```

## Monitoring

### Development
```bash
# Watch logs in real-time
npm run dev

# The logs will show detailed information
```

### Production
- Use your hosting provider's logs
- Set up error tracking (Sentry, etc.)
- Monitor performance metrics

## Security Checklist

- [ ] Different JWT secrets for dev/prod
- [ ] Separate databases
- [ ] `.env` files in `.gitignore`
- [ ] Never commit secrets to git
- [ ] Use environment variables on hosting platform
- [ ] Rotate production secrets regularly
- [ ] Use HTTPS in production (HTTP okay for localhost dev)

## Quick Reference

```bash
# Start development server
cd /Library/FetchNews/backend && npm run dev

# Start production server
cd /Library/FetchNews/backend && npm run start:prod

# Check which environment you're in
echo $NODE_ENV

# View environment variables
node -e "require('dotenv').config(); console.log(process.env.NODE_ENV)"
```

