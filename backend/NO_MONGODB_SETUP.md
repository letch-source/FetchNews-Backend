# 🚀 Quick Start Without MongoDB

If you don't want to install MongoDB right now, you can still start the backend in a limited mode for testing.

## ⚠️ Limitations Without MongoDB

Without MongoDB, you won't have:
- ❌ User authentication (Google Sign-In)
- ❌ User preferences
- ❌ Subscription management
- ❌ Custom topics per user

But you **CAN** test:
- ✅ News fetching
- ✅ Text-to-speech generation
- ✅ Article caching
- ✅ API endpoints (with mock auth)

---

## Option 1: Use Docker MongoDB (Easiest)

If you have Docker installed:

```bash
# Start MongoDB in Docker (no installation needed)
docker run -d \
  --name fetchnews-mongodb \
  -p 27017:27017 \
  -e MONGO_INITDB_DATABASE=fetchnews_dev \
  mongo:latest

# Verify it's running
docker ps | grep fetchnews-mongodb

# Start your dev server
cd /Library/FetchNews/backend
npm run dev
```

**Stop when done:**
```bash
docker stop fetchnews-mongodb
```

**Remove when done:**
```bash
docker stop fetchnews-mongodb
docker rm fetchnews-mongodb
```

---

## Option 2: Mock MongoDB Connection

Create a temporary mock for testing without MongoDB:

### Step 1: Update your `.env`

Comment out MongoDB:
```bash
# MONGODB_URI=mongodb://localhost:27017/fetchnews_dev
MONGODB_URI=
```

### Step 2: Update `config/database.js`

Add error handling:

```javascript
const mongoose = require('mongoose');

const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    console.log('⚠️  MongoDB URI not set - Running in limited mode');
    console.log('   User features will be disabled');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB');
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    console.log('   Continuing in limited mode...');
  }
};

module.exports = connectDB;
```

### Step 3: Start server

```bash
npm run dev
```

The server will start but user-related features won't work.

---

## 🎯 Recommended Approach

**For serious development, install MongoDB properly:**

```bash
# Takes 2-3 minutes
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community

# Verify
mongosh --eval "db.runCommand({ping: 1})"
```

See `INSTALL_MONGODB.md` for detailed instructions.

---

## Quick Comparison

| Method | Setup Time | Features | Best For |
|--------|------------|----------|----------|
| **Install MongoDB** | 3-5 min | ✅ All features | Real development |
| **Docker MongoDB** | 1 min | ✅ All features | Quick testing |
| **No MongoDB** | 0 min | ⚠️ Limited | API testing only |

---

## After Installing MongoDB

Once MongoDB is running:

```bash
cd /Library/FetchNews/backend
./dev-start.sh
```

Everything will work! 🎉

