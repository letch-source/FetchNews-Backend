# 📦 Installing MongoDB on macOS

## Quick Install (Recommended)

### Step 1: Install MongoDB via Homebrew

```bash
# Add MongoDB tap
brew tap mongodb/brew

# Install MongoDB Community Edition
brew install mongodb-community

# This installs:
# - mongod (MongoDB server)
# - mongosh (MongoDB shell)
# - Configuration files
```

### Step 2: Start MongoDB

```bash
# Start MongoDB as a service (runs in background)
brew services start mongodb-community

# Verify it's running
brew services list | grep mongodb
```

### Step 3: Verify Installation

```bash
# Connect to MongoDB
mongosh

# You should see:
# Current Mongosh Log ID: ...
# Connecting to: mongodb://127.0.0.1:27017/
# ...

# Exit with:
exit
```

---

## Alternative: Manual Start

If you don't want MongoDB running all the time:

```bash
# Start manually (runs in foreground)
mongod --config /opt/homebrew/etc/mongod.conf

# Or on Intel Macs:
mongod --config /usr/local/etc/mongod.conf
```

---

## Troubleshooting

### "brew tap mongodb/brew" fails

**Solution:** Update Homebrew first:
```bash
brew update
brew tap mongodb/brew
brew install mongodb-community
```

### "Permission denied" errors

**Solution:** Fix permissions:
```bash
sudo mkdir -p /opt/homebrew/var/mongodb
sudo chown -R $(whoami) /opt/homebrew/var/mongodb
brew services start mongodb-community
```

### MongoDB won't start

**Check logs:**
```bash
# For Apple Silicon (M1/M2/M3):
tail -f /opt/homebrew/var/log/mongodb/mongo.log

# For Intel Macs:
tail -f /usr/local/var/log/mongodb/mongo.log
```

**Common fixes:**
```bash
# 1. Remove lock file
rm /opt/homebrew/var/mongodb/mongod.lock

# 2. Repair database
mongod --repair --dbpath /opt/homebrew/var/mongodb

# 3. Restart service
brew services restart mongodb-community
```

### Port 27017 already in use

**Find what's using it:**
```bash
lsof -i :27017
kill -9 <PID>
```

---

## Verify FetchNews Backend Connection

Once MongoDB is running:

```bash
cd /Library/FetchNews/backend

# Check connection
mongosh mongodb://localhost:27017/fetchnews_dev --eval "db.runCommand({ping: 1})"

# Should output: { ok: 1 }
```

---

## Configure for FetchNews

Your `.env` file should have:

```bash
# Development database
MONGODB_URI=mongodb://localhost:27017/fetchnews_dev
```

---

## Useful Commands

```bash
# Start MongoDB
brew services start mongodb-community

# Stop MongoDB
brew services stop mongodb-community

# Restart MongoDB
brew services restart mongodb-community

# Check status
brew services list | grep mongodb

# Connect to dev database
mongosh mongodb://localhost:27017/fetchnews_dev

# View databases
mongosh --eval "show dbs"

# View dev database size
mongosh fetchnews_dev --eval "db.stats()"
```

---

## Uninstall (if needed)

```bash
# Stop service
brew services stop mongodb-community

# Uninstall
brew uninstall mongodb-community

# Remove data (optional)
rm -rf /opt/homebrew/var/mongodb
```

---

## Next Steps

After MongoDB is running:

```bash
cd /Library/FetchNews/backend
./dev-start.sh
```

Your development server will connect to MongoDB automatically! 🎉

