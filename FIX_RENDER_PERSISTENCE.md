# Fix Render Backend Persistence Issue

## Problem
Voice selection and Daily Fetch settings are not persisting after Render backend restarts.

## Root Cause
Render's filesystem is **ephemeral** - files are wiped on every restart. If your Render backend doesn't have MongoDB configured, it's using fallback file storage (`fallback_users.json`) which gets deleted on restart.

## Solution: Configure MongoDB Atlas

### Step 1: Create MongoDB Atlas Cluster (Free)

1. Go to https://www.mongodb.com/cloud/atlas/register
2. Create a free account
3. Create a **Free Shared Cluster** (M0 tier - free forever)
4. Choose a cloud provider and region (preferably same as Render)
5. Click **Create Cluster**

### Step 2: Configure Database Access

1. In Atlas, click **Database Access** (left sidebar)
2. Click **Add New Database User**
3. Choose **Password** authentication
4. Username: `fetchnews_user` (or your choice)
5. Password: Generate a secure password and **save it**
6. Database User Privileges: **Read and write to any database**
7. Click **Add User**

### Step 3: Configure Network Access

1. In Atlas, click **Network Access** (left sidebar)
2. Click **Add IP Address**
3. Click **Allow Access from Anywhere** (0.0.0.0/0)
   - This is safe because you're using password authentication
4. Click **Confirm**

### Step 4: Get Connection String

1. In Atlas, click **Database** (left sidebar)
2. Click **Connect** on your cluster
3. Choose **Connect your application**
4. Driver: **Node.js**, Version: **5.5 or later**
5. Copy the connection string - it looks like:
   ```
   mongodb+srv://fetchnews_user:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<password>` with your actual password
7. Add database name at the end:
   ```
   mongodb+srv://fetchnews_user:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/fetchnews?retryWrites=true&w=majority
   ```

### Step 5: Add to Render Environment Variables

1. Go to your Render dashboard
2. Select your backend service
3. Click **Environment** in the left sidebar
4. Add a new environment variable:
   - **Key**: `MONGODB_URI`
   - **Value**: Your MongoDB Atlas connection string (from Step 4)
5. Click **Save Changes**

Render will automatically restart your backend with the new MongoDB connection.

### Step 6: Verify Connection

1. Wait for Render to redeploy (2-3 minutes)
2. Check Render logs for: `MongoDB connected successfully`
3. If you see connection errors, double-check:
   - Password is correct (no special characters causing issues)
   - IP whitelist includes 0.0.0.0/0
   - Connection string format is correct

### Step 7: Migrate Existing Users (If Needed)

If you have existing users in fallback storage that need to be migrated, you'll need to:

1. Export user data before MongoDB connection
2. Import to MongoDB after connection
3. This is only needed if users already exist

---

## Alternative: Use Render's Redis (Not Recommended)

Render doesn't offer persistent file storage, so you need an external database. Redis is another option but MongoDB is better for structured user data.

---

## Verification

After MongoDB is connected:

1. **Open your app**
2. **Change voice selection** (e.g., from Alloy to Echo)
3. **Check Render logs** - you should see:
   ```
   [PREFERENCES] Using MongoDB for user finlaysmith@gmail.com
   [PREFERENCES] After update - selectedVoice: echo
   ```
4. **Trigger a Render restart** (Settings → Manual Deploy → Deploy latest commit)
5. **Open app again** - voice should still be Echo ✅

---

## Check Current Render Configuration

To see if MongoDB is already configured:

1. Go to Render Dashboard → Your Service → Environment
2. Look for `MONGODB_URI` variable
3. If it exists but persistence isn't working:
   - Check if the MongoDB cluster is running
   - Verify connection string is correct
   - Check Render logs for connection errors

---

## Cost

- **MongoDB Atlas M0 (Free Tier)**: $0/month
  - 512 MB storage
  - Shared RAM
  - Perfect for this use case
- **No credit card required**

---

## Why This Fixes The Issue

**Before:**
```
User Changes Voice → Render Backend → Saves to fallback_users.json → Render Restarts → File Deleted ❌
```

**After:**
```
User Changes Voice → Render Backend → Saves to MongoDB Atlas → Render Restarts → MongoDB Still Has Data ✅
```

---

## Need Help?

Common issues:

1. **Connection timeout**: Check IP whitelist (0.0.0.0/0)
2. **Authentication failed**: Verify password doesn't have special characters
3. **Database not found**: Add database name to connection string
4. **Still using fallback**: Render env variable not saved correctly

Check Render logs for specific error messages.
