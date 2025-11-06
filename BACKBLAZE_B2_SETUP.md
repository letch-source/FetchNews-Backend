# Backblaze B2 Integration Setup Guide

## ✅ What's Been Done

The backend has been successfully integrated with Backblaze B2 cloud storage for persistent audio file storage. This solves the "Audio unavailable" issue for old Fetch summaries.

### Changes Made:

1. **Installed AWS SDK** - Added `@aws-sdk/client-s3` package for S3-compatible B2 access
2. **Created B2 Storage Utility** - New module at `backend/utils/b2Storage.js`
3. **Updated TTS Endpoint** - Modified `/api/tts` in `backend/index.js` to upload to B2
4. **Updated Scheduled Summaries** - Modified `backend/routes/scheduledSummaries.js` to upload to B2
5. **Added Fallback Logic** - If B2 fails, system falls back to local storage

---

## 🔧 Required: Add B2 Credentials to .env

You need to manually add your Backblaze B2 credentials to your `.env` file.

### Step 1: Edit `/Library/FetchNews-Backend/backend/.env`

Add these lines to your `.env` file:

```env
# Backblaze B2 Cloud Storage
B2_KEY_ID=00471fab8665d5f0000000001
B2_APPLICATION_KEY=K004+dBZ+Er/CmuS0g2IuG2ggPSpDu0
B2_BUCKET_NAME=Fetch-Audio
B2_ENDPOINT=s3.us-west-004.backblazeb2.com
B2_REGION=us-west-004
```

### Step 2: Deploy to Render.com

Add the same environment variables in your Render.com dashboard:

1. Go to your Render dashboard
2. Select your backend service
3. Go to "Environment" tab
4. Add each variable:
   - `B2_KEY_ID` = `00471fab8665d5f0000000001`
   - `B2_APPLICATION_KEY` = `K004+dBZ+Er/CmuS0g2IuG2ggPSpDu0`
   - `B2_BUCKET_NAME` = `Fetch-Audio`
   - `B2_ENDPOINT` = `s3.us-west-004.backblazeb2.com`
   - `B2_REGION` = `us-west-004`
5. Click "Save Changes" (this will trigger a redeploy)

---

## 🔒 Security Recommendation

**IMPORTANT**: You shared your actual B2 credentials in the chat. For security, you should:

1. **Rotate your Application Key** in Backblaze:
   - Go to Backblaze B2 → App Keys
   - Delete the current "Backblaze-Key"
   - Create a new one with the same permissions
   - Update your `.env` and Render environment variables with the new key

---

## 🧪 Testing the Integration

### Local Testing:

1. Add the credentials to your local `.env` file
2. Restart your backend server
3. Generate a new Fetch in the app
4. Check the server logs - you should see:
   ```
   📤 Uploading audio to Backblaze B2...
   ✅ Audio uploaded to B2 successfully
   ```
5. Check your B2 bucket - you should see a new `.mp3` file

### Production Testing:

1. Deploy to Render with environment variables
2. Generate a new Fetch from your app
3. Wait 10 minutes, then restart the Render service (to simulate server restart)
4. Go to History tab and check if the audio is still available ✅

---

## 📊 How It Works

### Before (Problem):
- Audio files saved to `/backend/media/` on Render's ephemeral storage
- Server restarts → files deleted → "Audio unavailable"

### After (Solution):
- Audio files uploaded to Backblaze B2 cloud storage
- Server restarts → files persist in B2 → Audio always available
- Fallback to local storage if B2 is unavailable

### Audio URL Format:
- **Old**: `https://your-backend.onrender.com/media/tts-123456.mp3`
- **New**: `https://f004.backblazeb2.com/file/Fetch-Audio/tts-123456.mp3`

---

## 💰 Cost Estimate

Based on typical usage (100 users, 1 fetch/day, 500KB audio):
- **Storage**: ~15GB/month = $0.08/month
- **Bandwidth**: Free (within 3x storage allowance)
- **Total**: Less than $0.10/month

---

## ⚠️ Bucket Configuration Check

Make sure your B2 bucket is configured correctly:

1. Go to Backblaze B2 → Buckets → "Fetch-Audio"
2. **Bucket Type** should be **"Public"**
   - If it's private, change it to public so audio URLs work directly
3. **Files should be publicly readable**

If your bucket is private, audio files won't be accessible to users.

---

## 🐛 Troubleshooting

### "B2 not configured" message in logs
- Check that all 5 environment variables are set correctly
- Restart your server after adding variables

### "B2 upload failed" errors
- Verify bucket name is exactly: `Fetch-Audio`
- Verify endpoint is exactly: `s3.us-west-004.backblazeb2.com`
- Check that your Application Key has write permissions
- Verify bucket is set to "Public"

### Old audio still unavailable
- This is expected - old audio files are already deleted from Render
- New fetches will have persistent audio
- Old entries will continue showing "Audio unavailable"

---

## ✨ Next Steps

1. ✅ Add credentials to local `.env` file
2. ✅ Test locally by generating a fetch
3. ✅ Add credentials to Render environment variables
4. ✅ Deploy to production
5. ✅ Rotate your B2 Application Key for security
6. ✅ Test in production by generating a fetch and checking after server restart

---

**Need Help?** Check the logs for helpful messages:
- 📤 = Starting B2 upload
- ✅ = Upload successful
- ❌ = Upload failed (will use local fallback)
- ⚠️ = B2 not configured (using local storage)

