# How to Test Notifications

## Option 1: Using curl (Terminal)

Replace `YOUR_BACKEND_URL` with your Render backend URL (e.g., `https://your-app.onrender.com`) and `YOUR_AUTH_TOKEN` with your JWT token.

```bash
curl -X POST https://YOUR_BACKEND_URL/api/notifications/test \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Notification",
    "body": "This is a test notification from Fetch News"
  }'
```

### Getting Your Auth Token

1. Sign in to your app
2. Check Xcode console logs - the token might be logged
3. Or check your app's keychain/storage where tokens are stored
4. Or use the diagnostic endpoint first (see below)

## Option 2: Using the Diagnostic Endpoint First

Check your notification setup status:

```bash
curl -X GET https://YOUR_BACKEND_URL/api/notifications/diagnostics \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json"
```

This will show:
- APNs configuration status
- Device token registration status
- Notification preferences
- Any issues preventing notifications

## Option 3: Test from iOS App (Easiest)

The easiest way is to add a test button in your app. I can help you add this to your settings or admin view.

## Option 4: Using Postman or Insomnia

1. Create a new POST request
2. URL: `https://YOUR_BACKEND_URL/api/notifications/test`
3. Headers:
   - `Authorization: Bearer YOUR_AUTH_TOKEN`
   - `Content-Type: application/json`
4. Body (JSON):
   ```json
   {
     "title": "Test Notification",
     "body": "This is a test"
   }
   ```

## Option 5: Test from iOS App (Easiest - Already Added!)

I've added a `testNotification()` function to `ApiClient`. You can call it from anywhere in your app:

```swift
Task {
    do {
        let message = try await ApiClient.testNotification(
            title: "Test Notification",
            body: "This is a test from the app"
        )
        print("✅ \(message)")
    } catch {
        print("❌ Failed to send test notification: \(error)")
    }
}
```

You can add a test button to your settings view, or call it from Xcode's debug console.

## Finding Your Backend URL

Your Render backend URL should be something like:
- `https://fetchnews-backend.onrender.com`
- Or check your Render dashboard → Your service → URL

## Finding Your Auth Token

The auth token is stored in your app after login. You can:
1. Check Xcode console when you sign in
2. Add temporary logging in your app to print the token
3. Use the app's diagnostic endpoint which doesn't require the token to be extracted

