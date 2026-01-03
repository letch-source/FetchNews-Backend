# Google Cloud Console OAuth Setup Guide

## Web Application Client Configuration

### Application Type
✅ **Web application** (correct choice)

### Name
✅ **FetchWeb** (or any name you prefer - this is just for your reference)

### Authorized JavaScript Origins
**Leave this empty** - This is only needed if you have a web frontend making direct OAuth requests from a browser. Since you're using an iOS app, you don't need this.

### Authorized Redirect URIs
**Add ONE redirect URI** (Google requires at least one, even if not used):

```
https://fetchnews-backend.onrender.com/api/auth/google/callback
```

**Note**: Even though your backend doesn't use this callback URL (iOS sends ID token directly), Google Cloud Console requires at least one redirect URI for Web application clients.

### Why This Setup?

Your authentication flow is:
1. iOS app uses Google Sign-In SDK → Gets ID token
2. iOS app sends ID token to your backend (`/api/auth/google`)
3. Backend verifies the token with Google using the Web Client ID

The redirect URI is required by Google but won't actually be used in your flow.

## iOS Client Configuration (Next Step)

After creating the Web application client, you'll create an iOS client:
- **Application type**: iOS
- **Bundle ID**: `com.fetchnews.app` (or your actual bundle ID)
- **No redirect URIs needed** for iOS clients

## Summary

**Web Application Client:**
- Name: FetchWeb (or any name)
- Authorized JavaScript Origins: (empty)
- Authorized Redirect URIs: `https://fetchnews-backend.onrender.com/api/auth/google/callback`

**Save the Client ID** - You'll need this for your backend `.env` file as `GOOGLE_CLIENT_ID`.



